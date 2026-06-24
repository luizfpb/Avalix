-- Avalix - migration 0009: log de execucao de treino (schema)
-- Depende de 0006-0008. Fecha o ciclo prescrever -> executar -> medir.
--
-- workout_logs = uma sessao executada (vinculada ao plano). workout_log_sets =
-- as series reais (carga x reps x RIR). Mesmo arcabouco das filhas: org_id (e
-- aqui tambem subject_id) herdados do plano por trigger b1; b2 valida o
-- exercicio no escopo da org; freeze; auditoria so na tabela principal.
--
-- Decisoes de robustez:
--   - day_label e TEXTO (snapshot da divisao A/B/C), nao FK: editar o plano
--     apaga e recria os dias, entao um FK ficaria orfao; o rotulo sobrevive.
--   - a serie referencia exercise_id (estavel no catalogo), nao o
--     workout_exercise (que some ao reeditar o plano) — e a chave da progressao
--     de carga / e1RM por exercicio ao longo do tempo.
--   - SEM gate de consentimento (igual ao plano): execucao e dado operacional do
--     treino, nao coleta de dado sensivel do titular.

create table public.workout_logs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  subject_id    uuid not null references public.subjects(id) on delete cascade,
  plan_id       uuid not null references public.workout_plans(id) on delete cascade,
  day_label     text check (day_label is null or char_length(day_label) between 1 and 8),
  week_number   int check (week_number is null or week_number >= 1),
  performed_at  date not null default current_date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index workout_logs_plan_idx on public.workout_logs (plan_id, performed_at desc);
create index workout_logs_subject_idx on public.workout_logs (subject_id, performed_at desc);

-- b1: copia org_id E subject_id do plano (ignora o que vier do cliente)
create or replace function app.org_subject_from_plan()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select wp.org_id, wp.subject_id
    into new.org_id, new.subject_id
    from public.workout_plans wp
   where wp.id = new.plan_id;
  if new.org_id is null then
    raise exception 'plano inexistente';
  end if;
  return new;
end;
$$;

create trigger workout_logs_b1_org
  before insert on public.workout_logs
  for each row execute function app.org_subject_from_plan();

create trigger workout_logs_freeze
  before update on public.workout_logs
  for each row execute function app.freeze_columns('org_id', 'subject_id', 'plan_id');

create trigger workout_logs_updated_at
  before update on public.workout_logs
  for each row execute function app.set_updated_at();

create trigger workout_logs_audit
  after insert or update or delete on public.workout_logs
  for each row execute function app.audit();

create table public.workout_log_sets (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  log_id       uuid not null references public.workout_logs(id) on delete cascade,
  exercise_id  uuid not null references public.exercises(id) on delete restrict,
  set_number   int not null check (set_number between 1 and 50),
  weight_kg    numeric(6,2) check (weight_kg is null or (weight_kg >= 0 and weight_kg <= 1000)),
  reps         int check (reps is null or (reps between 0 and 100)),
  rir          numeric(3,1) check (rir is null or (rir between 0 and 10)),
  created_at   timestamptz not null default now(),
  unique (log_id, exercise_id, set_number)
);

create index workout_log_sets_log_idx on public.workout_log_sets (log_id);
create index workout_log_sets_exercise_idx on public.workout_log_sets (exercise_id, created_at);

-- b1: copia org_id do log
create or replace function app.org_from_workout_log()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select wl.org_id into new.org_id from public.workout_logs wl where wl.id = new.log_id;
  if new.org_id is null then
    raise exception 'registro de treino inexistente';
  end if;
  return new;
end;
$$;

create trigger workout_log_sets_b1_org
  before insert on public.workout_log_sets
  for each row execute function app.org_from_workout_log();

-- b2: exercicio global ou da mesma org (reusa o validador dos exercicios do plano)
create trigger workout_log_sets_b2_exercise
  before insert or update on public.workout_log_sets
  for each row execute function app.check_exercise_scope();

create trigger workout_log_sets_freeze
  before update on public.workout_log_sets
  for each row execute function app.freeze_columns('org_id', 'log_id');
