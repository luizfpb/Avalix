-- Avalix - migration 0006: modulo de montagem de treino (schema)
-- Depende de 0001-0005. Rodar no SQL Editor do Supabase (ou supabase db push).
--
-- Mesmo arcabouco das demais tabelas filhas:
--   - org_id denormalizado, herdado do pai por trigger b1 (RLS nao faz join);
--   - b2 valida o que depende de org/relacao ja estar preenchida;
--   - freeze_columns congela as colunas relacionais no update;
--   - auditoria so na tabela principal (workout_plans), igual assessments
--     audita o pai e nao as leituras.
--
-- Biblioteca de exercicios: tabela unica com org_id NULLABLE.
--   org_id NULL  -> catalogo global curado (seed em 0008), lido por todo
--                   usuario autenticado, imutavel pra usuario (sem policy que
--                   case org_id null na escrita).
--   org_id setado -> exercicio custom da org, RLS padrao org-scoped.
-- primary_muscle/equipment/movement_pattern sao OBRIGATORIOS tambem no custom:
-- sem eles o motor de volume nao significa nada.
--
-- Vocabulario (primary/secondary muscle, equipment, movement_pattern): a fonte
-- de verdade dos rotulos pt-BR e o modulo TS src/features/workout/volume; estes
-- CHECK so travam o dominio. Os 20 grupos musculares seguem o recorte dos volume
-- landmarks (Renaissance Periodization / Israetel) refinado ao nivel mais
-- granular ainda treinavel de forma independente. A contagem de volume usa
-- series semanais por grupo, fracionadas (primario 1.0 / secundario 0.5), que e
-- o metodo de melhor evidencia nas meta-regressoes dose-resposta atuais.

-- =====================================================================
-- BIBLIOTECA DE EXERCICIOS
-- =====================================================================

create table public.exercises (
  id                uuid primary key default gen_random_uuid(),
  -- NULL = catalogo global; setado = exercicio custom da org
  org_id            uuid references public.organizations(id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 120),
  primary_muscle    text not null check (primary_muscle in (
                      'chest','lats','upper_back','traps',
                      'front_delts','side_delts','rear_delts',
                      'biceps','triceps','forearms',
                      'abs','obliques','lower_back',
                      'quads','hamstrings','glutes','adductors','abductors',
                      'calves','neck')),
  secondary_muscles text[] not null default '{}'
                    check (secondary_muscles <@ array[
                      'chest','lats','upper_back','traps',
                      'front_delts','side_delts','rear_delts',
                      'biceps','triceps','forearms',
                      'abs','obliques','lower_back',
                      'quads','hamstrings','glutes','adductors','abductors',
                      'calves','neck']::text[]),
  equipment         text not null check (equipment in (
                      'barbell','ez_bar','trap_bar','dumbbell','kettlebell',
                      'machine','smith_machine','cable','bodyweight',
                      'resistance_band','suspension','plate','medicine_ball',
                      'other')),
  movement_pattern  text not null check (movement_pattern in (
                      'horizontal_push','vertical_push','horizontal_pull',
                      'vertical_pull','squat','hinge','lunge','carry',
                      'rotation','isolation','core')),
  is_unilateral     boolean not null default false,
  cues              text,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index exercises_org_idx on public.exercises (org_id);
create index exercises_primary_muscle_idx on public.exercises (primary_muscle);

-- org_id e imutavel: nao da pra mover exercicio entre orgs nem promover um
-- custom a global por update.
create trigger exercises_freeze
  before update on public.exercises
  for each row execute function app.freeze_columns('org_id');

create trigger exercises_updated_at
  before update on public.exercises
  for each row execute function app.set_updated_at();

-- =====================================================================
-- HELPERS DE HERANCA (b1) E VALIDACAO (b2) DO MODULO DE TREINO
-- b1 resolve org/relacao a partir do pai; b2 valida o que depende disso.
-- =====================================================================

-- b1: copia org_id do plano (pai de workout_days e workout_weeks)
create or replace function app.org_from_plan()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select wp.org_id into new.org_id from public.workout_plans wp where wp.id = new.plan_id;
  if new.org_id is null then
    raise exception 'plano inexistente';
  end if;
  return new;
end;
$$;

-- b1: copia org_id do dia (pai de workout_exercises)
create or replace function app.org_from_workout_day()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select d.org_id into new.org_id from public.workout_days d where d.id = new.day_id;
  if new.org_id is null then
    raise exception 'dia de treino inexistente';
  end if;
  return new;
end;
$$;

-- b1: resolve org_id E plan_id a partir do exercicio do treino (pai do override)
create or replace function app.org_from_workout_exercise()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select d.org_id, d.plan_id
    into new.org_id, new.plan_id
    from public.workout_exercises we
    join public.workout_days d on d.id = we.day_id
   where we.id = new.workout_exercise_id;
  if new.org_id is null then
    raise exception 'exercicio do treino inexistente';
  end if;
  return new;
end;
$$;

-- b2: o exercicio referenciado tem que ser global (org_id null) ou da mesma
-- org do treino. Depende de new.org_id ja resolvido pelo b1 -> roda depois.
create or replace function app.check_exercise_scope()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ex_org uuid;
begin
  select e.org_id into v_ex_org from public.exercises e where e.id = new.exercise_id;
  if not found then
    raise exception 'exercicio inexistente';
  end if;
  if v_ex_org is not null and v_ex_org is distinct from new.org_id then
    raise exception 'exercicio custom de outra organizacao';
  end if;
  return new;
end;
$$;

-- b2: a avaliacao/sessao de origem (a ponte avaliacao->prescricao, opcional)
-- precisa ser do MESMO avaliado do plano. Vale no insert e no update, porque
-- ligar a origem depois (aditivo) passa por update.
create or replace function app.check_workout_sources()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_subj uuid;
begin
  if new.source_assessment_id is not null then
    select a.subject_id into v_subj from public.assessments a where a.id = new.source_assessment_id;
    if not found then raise exception 'avaliacao de origem inexistente'; end if;
    if v_subj is distinct from new.subject_id then
      raise exception 'avaliacao de origem e de outro avaliado';
    end if;
  end if;
  if new.source_posture_session_id is not null then
    select ps.subject_id into v_subj from public.posture_sessions ps where ps.id = new.source_posture_session_id;
    if not found then raise exception 'sessao postural de origem inexistente'; end if;
    if v_subj is distinct from new.subject_id then
      raise exception 'sessao postural de origem e de outro avaliado';
    end if;
  end if;
  return new;
end;
$$;

-- b2: semana referenciada nao pode passar do mesociclo. Reusado por
-- workout_week_overrides e workout_weeks (ambos tem plan_id + week_number).
create or replace function app.check_week_within_plan()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_weeks int;
begin
  select wp.weeks into v_weeks from public.workout_plans wp where wp.id = new.plan_id;
  if not found then raise exception 'plano inexistente'; end if;
  if new.week_number > v_weeks then
    raise exception 'semana % alem do mesociclo (% semanas)', new.week_number, v_weeks;
  end if;
  return new;
end;
$$;

-- =====================================================================
-- PLANO DE TREINO (mesociclo)
-- Pai = subject (igual assessments). Snapshot do volume calculado guardado em
-- jsonb + volume_engine_version, pro PDF continuar reproduzivel se o motor de
-- volume mudar (mesmo padrao de assessments.results/engine_version).
-- source_*_id: costura aberta avaliacao->prescricao. v1 sai standalone; ligar
-- um plano a sua avaliacao depois e update, nao migration.
-- =====================================================================

create table public.workout_plans (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  subject_id                uuid not null references public.subjects(id) on delete cascade,
  evaluator_id              uuid not null default auth.uid() references public.profiles(id),
  name                      text not null check (char_length(name) between 1 and 120),
  goal                      text check (goal in (
                              'hypertrophy','strength','endurance','fat_loss',
                              'conditioning','rehab','other')),
  weeks                     int not null default 4 check (weeks between 1 and 52),
  starts_on                 date,
  notes                     text,
  status                    text not null default 'draft'
                            check (status in ('draft','active','archived')),
  -- ponte opcional para a avaliacao de origem (set null: o plano sobrevive)
  source_assessment_id      uuid references public.assessments(id) on delete set null,
  source_posture_session_id uuid references public.posture_sessions(id) on delete set null,
  -- snapshot do volume (motor versionado) - fonte de verdade do PDF
  volume                    jsonb,
  volume_engine_version     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index workout_plans_subject_idx on public.workout_plans (subject_id, created_at desc);
create index workout_plans_org_idx on public.workout_plans (org_id);

create trigger workout_plans_b1_org
  before insert on public.workout_plans
  for each row execute function app.org_from_subject();

create trigger workout_plans_b2_evaluator
  before insert or update on public.workout_plans
  for each row execute function app.check_evaluator();

create trigger workout_plans_b2_sources
  before insert or update on public.workout_plans
  for each row execute function app.check_workout_sources();

create trigger workout_plans_freeze
  before update on public.workout_plans
  for each row execute function app.freeze_columns('org_id', 'subject_id');

create trigger workout_plans_updated_at
  before update on public.workout_plans
  for each row execute function app.set_updated_at();

create trigger workout_plans_audit
  after insert or update or delete on public.workout_plans
  for each row execute function app.audit();

-- =====================================================================
-- DIVISOES / DIAS (templates A/B/C...)
-- =====================================================================

create table public.workout_days (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  plan_id     uuid not null references public.workout_plans(id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 8),
  name        text check (char_length(name) <= 80),
  position    int not null check (position >= 0),
  created_at  timestamptz not null default now(),
  unique (plan_id, position),
  unique (plan_id, label)
);

create index workout_days_plan_idx on public.workout_days (plan_id, position);

create trigger workout_days_b1_org
  before insert on public.workout_days
  for each row execute function app.org_from_plan();

create trigger workout_days_freeze
  before update on public.workout_days
  for each row execute function app.freeze_columns('org_id', 'plan_id');

-- =====================================================================
-- EXERCICIOS DO DIA (ordenados; series/reps/RIR/descanso)
-- reps e texto: aceita faixa ("8-12"), fixo ("10") ou tempo ("30s").
-- on delete restrict no exercise: nao apaga exercicio em uso por um plano.
-- =====================================================================

create table public.workout_exercises (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  day_id       uuid not null references public.workout_days(id) on delete cascade,
  exercise_id  uuid not null references public.exercises(id) on delete restrict,
  position     int not null check (position >= 0),
  sets         int not null check (sets between 1 and 20),
  reps         text not null check (char_length(reps) between 1 and 20),
  rir          numeric(3,1) check (rir between 0 and 10),
  rest_seconds int check (rest_seconds between 0 and 600),
  tempo        text check (char_length(tempo) <= 15),
  notes        text,
  created_at   timestamptz not null default now(),
  unique (day_id, position)
);

create index workout_exercises_day_idx on public.workout_exercises (day_id, position);
create index workout_exercises_exercise_idx on public.workout_exercises (exercise_id);

create trigger workout_exercises_b1_org
  before insert on public.workout_exercises
  for each row execute function app.org_from_workout_day();

create trigger workout_exercises_b2_exercise
  before insert or update on public.workout_exercises
  for each row execute function app.check_exercise_scope();

create trigger workout_exercises_freeze
  before update on public.workout_exercises
  for each row execute function app.freeze_columns('org_id', 'day_id');

-- =====================================================================
-- OVERRIDES POR SEMANA (sparse). Campo nulo = herda do template.
-- is_skipped = exercicio nao executado naquela semana (volume 0).
-- =====================================================================

create table public.workout_week_overrides (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  plan_id              uuid not null references public.workout_plans(id) on delete cascade,
  workout_exercise_id  uuid not null references public.workout_exercises(id) on delete cascade,
  week_number          int not null check (week_number >= 1),
  sets                 int check (sets between 1 and 20),
  reps                 text check (char_length(reps) between 1 and 20),
  rir                  numeric(3,1) check (rir between 0 and 10),
  rest_seconds         int check (rest_seconds between 0 and 600),
  is_skipped           boolean not null default false,
  notes                text,
  created_at           timestamptz not null default now(),
  unique (workout_exercise_id, week_number)
);

create index workout_week_overrides_plan_idx on public.workout_week_overrides (plan_id, week_number);

create trigger workout_week_overrides_b1_org
  before insert on public.workout_week_overrides
  for each row execute function app.org_from_workout_exercise();

create trigger workout_week_overrides_b2_week
  before insert or update on public.workout_week_overrides
  for each row execute function app.check_week_within_plan();

create trigger workout_week_overrides_freeze
  before update on public.workout_week_overrides
  for each row execute function app.freeze_columns('org_id', 'plan_id', 'workout_exercise_id');

-- =====================================================================
-- METADADO POR SEMANA (opcional). Deload aqui e so um rotulo/flag: a carga
-- mais leve da semana vive nos overrides. Linha so existe se houver label/nota.
-- =====================================================================

create table public.workout_weeks (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  plan_id      uuid not null references public.workout_plans(id) on delete cascade,
  week_number  int not null check (week_number >= 1),
  label        text check (char_length(label) between 1 and 40),
  is_deload    boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  unique (plan_id, week_number)
);

create index workout_weeks_plan_idx on public.workout_weeks (plan_id, week_number);

create trigger workout_weeks_b1_org
  before insert on public.workout_weeks
  for each row execute function app.org_from_plan();

create trigger workout_weeks_b2_week
  before insert or update on public.workout_weeks
  for each row execute function app.check_week_within_plan();

create trigger workout_weeks_freeze
  before update on public.workout_weeks
  for each row execute function app.freeze_columns('org_id', 'plan_id');
