-- 0059 — testes físicos: cardiorrespiratórios e neuromotores.
-- Aplicar depois da 0058. Não altera dado existente.
--
-- Uma sessão de testes por linha, separada da avaliação de composição
-- (os testes costumam ser feitos em outro dia e não dependem de protocolo de
-- dobras), no mesmo desenho de posture_sessions: org e avaliador resolvidos
-- pelos gatilhos, RLS pela visibilidade do avaliado, consentimento para criar,
-- só leitura pela assinatura (b9) e auditoria.
--
-- As medidas ficam em `measures` (jsonb). O banco guarda só o que foi medido;
-- VO2máx estimado e classificação são calculados no app (features/fitness),
-- que é onde moram as equações e as tabelas normativas, com teste. O CHECK
-- abaixo recusa chave desconhecida, tipo errado e valor fora da faixa física,
-- para que nenhum cliente grave lixo que o cálculo depois leria.
--
-- Formato (todas as chaves opcionais, ao menos um teste):
--   cooper         { distance_m }                      corrida de 12 min
--   rockport       { time_s, heart_rate_bpm, weight_kg } caminhada de 1 milha
--   queens         { heart_rate_bpm }                  banco de Queens, 3 min
--   push_ups       { reps, knees }                     flexão de braço
--   sit_ups        { reps }                            abdominal em 1 min
--   sit_and_reach  { best_cm, feet_mark_cm }           banco de Wells (23 ou 26)
--   grip           { right_kg?, left_kg? }             dinamômetro, melhor de cada mão
--
-- export_subject_data passa a levar `fitness_tests`: a função da 0034 vira
-- app.export_subject_data_0034 (mesma autorização e o mesmo evento
-- SUBJECT_EXPORT) e a pública acrescenta a coleção nova.
begin;

-- ---------------------------------------------------------------------
-- 1. VALIDAÇÃO DAS MEDIDAS
-- ---------------------------------------------------------------------
create or replace function app.fitness_num_ok(p jsonb, p_key text, p_min numeric, p_max numeric)
returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(p -> p_key) = 'number'
     and (p ->> p_key)::numeric between p_min and p_max;
$$;

create or replace function app.fitness_keys_ok(p jsonb, p_allowed text[], p_required text[])
returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
     and not exists (select 1 from jsonb_object_keys(p) k where k <> all (p_allowed))
     and p ?& p_required;
$$;

-- security definer: o CHECK roda como quem grava, e o authenticated não tem
-- uso do schema app para achar as duas funções auxiliares pelo nome.
create or replace function app.fitness_measures_valid(p jsonb)
returns boolean
language plpgsql immutable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' or p = '{}'::jsonb then
    return false;
  end if;
  if exists (
    select 1 from jsonb_object_keys(p) k
     where k <> all (array['cooper','rockport','queens','push_ups','sit_ups','sit_and_reach','grip'])
  ) then
    return false;
  end if;

  v := p -> 'cooper';
  if v is not null and not (
    app.fitness_keys_ok(v, array['distance_m'], array['distance_m'])
    and app.fitness_num_ok(v, 'distance_m', 600, 5000)
  ) then return false; end if;

  v := p -> 'rockport';
  if v is not null and not (
    app.fitness_keys_ok(v, array['time_s','heart_rate_bpm','weight_kg'],
                           array['time_s','heart_rate_bpm','weight_kg'])
    and app.fitness_num_ok(v, 'time_s', 360, 3600)
    and app.fitness_num_ok(v, 'heart_rate_bpm', 40, 230)
    and app.fitness_num_ok(v, 'weight_kg', 20, 350)
  ) then return false; end if;

  v := p -> 'queens';
  if v is not null and not (
    app.fitness_keys_ok(v, array['heart_rate_bpm'], array['heart_rate_bpm'])
    and app.fitness_num_ok(v, 'heart_rate_bpm', 40, 230)
  ) then return false; end if;

  v := p -> 'push_ups';
  if v is not null and not (
    app.fitness_keys_ok(v, array['reps','knees'], array['reps','knees'])
    and app.fitness_num_ok(v, 'reps', 0, 300)
    and jsonb_typeof(v -> 'knees') = 'boolean'
  ) then return false; end if;

  v := p -> 'sit_ups';
  if v is not null and not (
    app.fitness_keys_ok(v, array['reps'], array['reps'])
    and app.fitness_num_ok(v, 'reps', 0, 200)
  ) then return false; end if;

  v := p -> 'sit_and_reach';
  if v is not null and not (
    app.fitness_keys_ok(v, array['best_cm','feet_mark_cm'], array['best_cm','feet_mark_cm'])
    and app.fitness_num_ok(v, 'best_cm', 0, 80)
    and jsonb_typeof(v -> 'feet_mark_cm') = 'number'
    and (v ->> 'feet_mark_cm')::numeric in (23, 26)
  ) then return false; end if;

  v := p -> 'grip';
  if v is not null and not (
    app.fitness_keys_ok(v, array['right_kg','left_kg'], array[]::text[])
    and (v ? 'right_kg' or v ? 'left_kg')
    and (not v ? 'right_kg' or app.fitness_num_ok(v, 'right_kg', 1, 150))
    and (not v ? 'left_kg' or app.fitness_num_ok(v, 'left_kg', 1, 150))
  ) then return false; end if;

  return true;
end;
$$;

revoke execute on function app.fitness_num_ok(jsonb, text, numeric, numeric) from public, anon, authenticated;
revoke execute on function app.fitness_keys_ok(jsonb, text[], text[]) from public, anon, authenticated;
revoke execute on function app.fitness_measures_valid(jsonb) from public, anon;
grant execute on function app.fitness_measures_valid(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 2. TABELA
-- ---------------------------------------------------------------------
create table public.fitness_tests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  subject_id    uuid not null references public.subjects(id) on delete cascade,
  evaluator_id  uuid not null default auth.uid() references public.profiles(id),
  tested_at     date not null default current_date,
  measures      jsonb not null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint fitness_tests_measures_valid check (app.fitness_measures_valid(measures)),
  constraint fitness_tests_notes_len check (notes is null or char_length(notes) <= 2000)
);

create index fitness_tests_subject_idx on public.fitness_tests (subject_id, tested_at desc);

create trigger fitness_tests_b1_org
  before insert on public.fitness_tests
  for each row execute function app.org_from_subject();

create trigger fitness_tests_b2_evaluator
  before insert or update on public.fitness_tests
  for each row execute function app.check_evaluator();

create trigger fitness_tests_b9_billing
  before insert or update on public.fitness_tests
  for each row execute function app.billing_write_guard();

create trigger fitness_tests_freeze
  before update on public.fitness_tests
  for each row execute function app.freeze_columns('org_id', 'subject_id');

create trigger fitness_tests_updated_at
  before update on public.fitness_tests
  for each row execute function app.set_updated_at();

create trigger fitness_tests_audit
  after insert or update or delete on public.fitness_tests
  for each row execute function app.audit();

alter table public.fitness_tests enable row level security;
revoke all on public.fitness_tests from anon;

create policy fitness_tests_select on public.fitness_tests
  for select to authenticated
  using (app.can_view_subject_id(subject_id));

create policy fitness_tests_insert on public.fitness_tests
  for insert to authenticated
  with check (
    app.can_view_subject_id(subject_id)
    and app.has_active_consent(subject_id)
  );

create policy fitness_tests_update on public.fitness_tests
  for update to authenticated
  using (app.can_view_subject_id(subject_id))
  with check (app.can_view_subject_id(subject_id));

create policy fitness_tests_delete on public.fitness_tests
  for delete to authenticated
  using (app.can_view_subject_id(subject_id));

-- ---------------------------------------------------------------------
-- 3. EXPORTAÇÃO DO TITULAR
-- ---------------------------------------------------------------------
alter function public.export_subject_data(uuid) rename to export_subject_data_0034;
alter function public.export_subject_data_0034(uuid) set schema app;
revoke execute on function app.export_subject_data_0034(uuid) from public, anon, authenticated;

create or replace function public.export_subject_data(p_subject uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_export jsonb;
begin
  -- autorização, MFA e o evento SUBJECT_EXPORT ficam na função da 0034
  v_export := app.export_subject_data_0034(p_subject);
  return v_export || jsonb_build_object(
    'schema_version', '1.2',
    'fitness_tests', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.tested_at, t.id)
        from public.fitness_tests t where t.subject_id = p_subject
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.export_subject_data(uuid) from public, anon;
grant execute on function public.export_subject_data(uuid) to authenticated;

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0059'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
