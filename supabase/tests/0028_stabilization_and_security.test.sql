-- Regression suite da migration 0028.
-- Execute SOMENTE contra Supabase local/CI descartável após reset local:
--   SUPABASE_TELEMETRY_DISABLED=1 npx supabase test db \
--     supabase/tests/0028_stabilization_and_security.test.sql --local
-- Nunca execute este arquivo stateful com --linked ou --db-url de produção.

begin;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end;
$$;
set local search_path = public, extensions, pg_catalog;

select plan(43);

-- =====================================================================
-- Policies administrativas e Storage
-- =====================================================================
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs'
      and policyname = 'audit_select'
      and coalesce(qual, '') like '%mfa_satisfied%'),
  1,
  'leitura da auditoria exige MFA satisfeito'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'client_errors'
      and policyname in ('client_errors_select','client_errors_delete')
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%mfa_satisfied%'),
  2,
  'leitura e exclusao de erros exigem MFA satisfeito'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('storage_logos_insert','storage_logos_update','storage_logos_delete')
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%mfa_satisfied%'),
  3,
  'as tres operacoes de escrita de logo exigem MFA'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('storage_logos_insert','storage_logos_update')
      and coalesce(with_check, '') like '%canonical_logo_org_id%'),
  2,
  'INSERT e destino de UPDATE exigem chave canonica de logo'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'storage_logos_select'
      and coalesce(qual, '') like '%mfa_satisfied%'),
  0,
  'leitura de logo continua disponivel durante elevacao de MFA'
);

select is(
  app.canonical_logo_org_id('00000000-0000-0000-0000-000000000001/logo.png'),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'helper aceita uma chave canonica'
);

select is(
  app.canonical_logo_org_id('00000000-0000-0000-0000-000000000001/sub/logo.png'),
  null,
  'helper rejeita subpastas'
);

select is(
  app.canonical_logo_org_id('00000000-0000-0000-0000-000000000001/Logo.PNG'),
  null,
  'helper rejeita variantes de caixa que ampliariam o namespace'
);

-- =====================================================================
-- Treino e concorrencia de organizacoes
-- =====================================================================
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'workout_logs'
      and policyname = 'workout_logs_insert'
      and coalesce(with_check, '') ~ $$source\s*=\s*'trainer'::text$$
      and coalesce(with_check, '') not like '%student%'),
  1,
  'insert REST de treino so aceita autoria trainer'
);

select ok(
  exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.workout_logs'::regclass
       and t.tgname = 'workout_logs_b2_student_plan'
       and not t.tgisinternal
       and (t.tgtype & 4) = 4
       and (t.tgtype & 16) = 16
  ),
  'guard de plano student cobre INSERT e UPDATE idempotente'
);

select ok(
  position('from public.profiles' in lower(pg_get_functiondef(
    'public.create_organization(text)'::regprocedure
  ))) > 0
  and position('for update' in lower(pg_get_functiondef(
    'public.create_organization(text)'::regprocedure
  ))) > 0,
  'create_organization trava a linha do ator antes de contar'
);

-- =====================================================================
-- Triagem server-side
-- =====================================================================
create temporary table _payload (value jsonb not null);
insert into _payload values ('{
  "parq": {
    "cardio_dx": false,
    "dor_toracica": false,
    "tontura_sincope": false,
    "condicao_cronica": false,
    "medicacao_cronica": false,
    "lesao_atividade": false,
    "supervisao_medica": false
  },
  "ativo_regular": false,
  "doenca_cmr": [],
  "doenca_cmr_confirmada": true,
  "sinais_sintomas": [],
  "sinais_sintomas_confirmados": true,
  "red_flags": [],
  "gestante": null,
  "declaracao_veracidade": true,
  "consentimento_lgpd": true
}'::jsonb);

select lives_ok(
  $$ select app.assert_anamnese_payload_complete(value) from _payload $$,
  'payload A1/A2 completo e valido'
);

select throws_ok(
  $$ select app.assert_anamnese_payload_complete(value - 'ativo_regular') from _payload $$,
  'P0001',
  'pratica regular de exercicio deve ser confirmada',
  'ativo_regular ausente falha fechado'
);

select throws_ok(
  $$ select app.assert_anamnese_payload_complete(
       jsonb_set(value, '{sinais_sintomas_confirmados}', 'false'::jsonb)
     ) from _payload $$,
  'P0001',
  'sinais e sintomas devem ser confirmados',
  'A2 sem confirmacao explicita falha fechado'
);

select is(
  (select g.liberado from _payload p
   cross join lateral app.compute_anamnese_gate(
     jsonb_set(p.value, '{parq,cardio_dx}', 'true'::jsonb)
   ) g),
  false,
  'PAR-Q positivo remove liberacao automatica'
);

select is(
  (select g.flag from _payload p
   cross join lateral app.compute_anamnese_gate(
     jsonb_set(p.value, '{parq,cardio_dx}', 'true'::jsonb)
   ) g),
  true,
  'PAR-Q positivo levanta encaminhamento'
);

select is(
  (select g.nivel from _payload p
   cross join lateral app.compute_anamnese_gate(
     jsonb_set(
       jsonb_set(p.value, '{ativo_regular}', 'true'::jsonb),
       '{doenca_cmr}', '["cardiovascular"]'::jsonb
     )
   ) g),
  'antes_vigorosa',
  'doenca CMR em pessoa ativa exige liberacao antes de vigorosa'
);

select is(
  (select g.nivel from _payload p
   cross join lateral app.compute_anamnese_gate(
     jsonb_set(p.value, '{sinais_sintomas}', '["dispneia"]'::jsonb)
   ) g),
  'antes_iniciar',
  'sintoma exige liberacao antes de iniciar'
);

select is(
  (select g.flag from _payload p
   cross join lateral app.compute_anamnese_gate(
     jsonb_set(p.value, '{red_flags}', '["trauma"]'::jsonb)
   ) g),
  true,
  'red flag levanta encaminhamento'
);

select has_trigger(
  'public', 'anamneses', 'anamneses_b3_gate_guard',
  'anamneses recalculam o gate no banco'
);

select ok(
  not has_function_privilege('anon', 'app.compute_anamnese_gate(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'app.compute_anamnese_gate(jsonb)', 'execute'),
  'helper clinico interno nao e RPC publica'
);

select ok(
  not exists (
    select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
     where p.oid in (
       'app.workout_plan_payload(uuid)'::regprocedure,
       'app.workout_last_sets(uuid)'::regprocedure
     )
       and acl.grantee = 0
       and acl.privilege_type = 'EXECUTE'
  )
  and not has_function_privilege('anon', 'app.workout_plan_payload(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app.workout_plan_payload(uuid)', 'execute')
  and not has_function_privilege('anon', 'app.workout_last_sets(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app.workout_last_sets(uuid)', 'execute'),
  'helpers security definer de treino nao herdam EXECUTE de PUBLIC'
);

-- =====================================================================
-- Comportamento integrado: rollout clínico, treino e paginação
-- =====================================================================
select set_config('request.jwt.claim.sub', '28000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"28000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',
  true
);

insert into auth.users (id, raw_user_meta_data) values
  ('28000000-0000-0000-0000-000000000001', '{"full_name":"Treinador pgTAP"}'::jsonb);
insert into public.organizations (id, name) values
  ('28000000-0000-0000-0000-000000000002', 'Org pgTAP 0028');
insert into public.org_members (org_id, user_id, role) values
  ('28000000-0000-0000-0000-000000000002',
   '28000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects
  (id, org_id, evaluator_id, full_name, birth_date, sex)
values
  ('28000000-0000-0000-0000-000000000003',
   '28000000-0000-0000-0000-000000000002',
   '28000000-0000-0000-0000-000000000001',
   'Aluna pgTAP 0028', '1990-01-01', 'F');

-- Mesmo com JSON atual, a versão antiga continua sendo evidência antiga.
alter table public.anamnese_intakes disable trigger anamnese_intakes_b2_create_guard;
insert into public.anamnese_intakes
  (id, org_id, subject_id, token_hash, status, expires_at, spec_version,
   submitted_at, payload, consent_version, consent_text_sha256,
   signer_kind, signer_name, submit_user_agent)
select
  '28000000-0000-0000-0000-000000000004',
  '28000000-0000-0000-0000-000000000002',
  '28000000-0000-0000-0000-000000000003', repeat('4', 64), 'submitted',
  now() + interval '1 day', '1.2', now(), p.value,
  app.canonical_consent_version(), repeat('5', 64),
  'titular', 'Aluna pgTAP 0028', 'pgTAP'
from _payload p;
alter table public.anamnese_intakes enable trigger anamnese_intakes_b2_create_guard;

select throws_ok(
  $$ select * from public.accept_anamnese_intake(
       '28000000-0000-0000-0000-000000000004', true, 'liberado', false, null
     ) $$,
  'P0001',
  'formulario desatualizado; rejeite e emita um novo link',
  'aceite recusa spec antiga mesmo quando o JSON tem forma 1.3'
);

select is(
  (select status from public.anamnese_intakes
    where id = '28000000-0000-0000-0000-000000000004'),
  'submitted',
  'recusa de spec antiga preserva o intake para rejeição explícita'
);

insert into public.exercises
  (id, org_id, name, primary_muscle, equipment, movement_pattern)
values
  ('28000000-0000-0000-0000-000000000005',
   '28000000-0000-0000-0000-000000000002',
   'Exercício pgTAP 0028', 'chest', 'barbell', 'horizontal_push');

insert into public.workout_plans
  (id, org_id, subject_id, evaluator_id, name, weeks, status)
values
  ('28000000-0000-0000-0000-000000000010',
   '28000000-0000-0000-0000-000000000002',
   '28000000-0000-0000-0000-000000000003',
   '28000000-0000-0000-0000-000000000001', 'Plano ativo 0028', 4, 'active'),
  ('28000000-0000-0000-0000-000000000011',
   '28000000-0000-0000-0000-000000000002',
   '28000000-0000-0000-0000-000000000003',
   '28000000-0000-0000-0000-000000000001', 'Plano arquivado 0028', 4, 'archived'),
  ('28000000-0000-0000-0000-000000000012',
   '28000000-0000-0000-0000-000000000002',
   '28000000-0000-0000-0000-000000000003',
   '28000000-0000-0000-0000-000000000001', 'Plano rascunho 0028', 4, 'draft');

insert into public.workout_days (id, org_id, plan_id, label, position) values
  ('28000000-0000-0000-0000-000000000020',
   '28000000-0000-0000-0000-000000000002',
   '28000000-0000-0000-0000-000000000010', 'A', 0);
insert into public.workout_exercises
  (org_id, day_id, exercise_id, position, sets, reps)
values
  ('28000000-0000-0000-0000-000000000002',
   '28000000-0000-0000-0000-000000000020',
   '28000000-0000-0000-0000-000000000005', 0, 3, '8-12');

insert into public.workout_links
  (org_id, subject_id, created_by, token_hash, expires_at)
values
  ('28000000-0000-0000-0000-000000000002',
   '28000000-0000-0000-0000-000000000003',
   '28000000-0000-0000-0000-000000000001',
   encode(sha256(convert_to('pgtap-token-0028', 'UTF8')), 'hex'),
   now() + interval '30 days');

create temporary table _sets (one_set jsonb not null, two_sets jsonb not null);
insert into _sets values (
  '[{"exercise_id":"28000000-0000-0000-0000-000000000005","set_number":1,"weight_kg":40,"reps":10,"rir":2}]',
  '[{"exercise_id":"28000000-0000-0000-0000-000000000005","set_number":1,"weight_kg":40,"reps":10,"rir":2},{"exercise_id":"28000000-0000-0000-0000-000000000005","set_number":2,"weight_kg":42,"reps":8,"rir":1}]'
);

select lives_ok(
  $$ select public.submit_workout_session(
       'pgtap-token-0028', '28000000-0000-0000-0000-000000000101', one_set,
       'A', 1, current_date, null, '28000000-0000-0000-0000-000000000010', 1
     ) from _sets $$,
  'sessão student é aceita em plano ativo'
);

select lives_ok(
  $$ select public.submit_workout_session(
       'pgtap-token-0028', '28000000-0000-0000-0000-000000000102', one_set,
       null, 1, current_date, null, '28000000-0000-0000-0000-000000000011', 1
     ) from _sets $$,
  'fila offline ainda sincroniza em plano arquivado'
);

select throws_ok(
  $$ select public.submit_workout_session(
       'pgtap-token-0028', '28000000-0000-0000-0000-000000000103', one_set,
       null, 1, current_date, null, '28000000-0000-0000-0000-000000000012', 1
     ) from _sets $$,
  'P0001',
  'sessao do aluno exige plano ativo ou arquivado',
  'sessão student é recusada em plano draft'
);

do $$
begin
  perform public.submit_workout_session(
    'pgtap-token-0028', '28000000-0000-0000-0000-000000000104', two_sets,
    'A', 1, current_date, null, '28000000-0000-0000-0000-000000000010', 2
  ) from _sets;
end;
$$;

select is(
  (select public.submit_workout_session(
     'pgtap-token-0028', '28000000-0000-0000-0000-000000000104', one_set,
     'A', 1, current_date, null, '28000000-0000-0000-0000-000000000010', 1
   )->>'stale' from _sets),
  'true',
  'replay com revisão menor é reconhecido como obsoleto'
);

select is(
  (select count(*)::int
     from public.workout_log_sets s
     join public.workout_logs l on l.id = s.log_id
    where l.client_ref = '28000000-0000-0000-0000-000000000104'),
  2,
  'replay obsoleto não substitui as séries mais novas'
);

do $$
begin
  perform public.submit_workout_session(
    'pgtap-token-0028', '28000000-0000-0000-0000-000000000104', two_sets,
    'A', 1, current_date - 7, null,
    '28000000-0000-0000-0000-000000000010', 3
  ) from _sets;
end;
$$;

select is(
  (select performed_at
     from public.workout_logs
    where client_ref = '28000000-0000-0000-0000-000000000104'),
  current_date,
  'revisão mais nova preserva a data imutável usada pelo cursor do histórico'
);

create temporary table _history_pages (first_page jsonb not null, second_page jsonb not null);
insert into _history_pages
with first as (
  select public.get_workout_history_page_for_link('pgtap-token-0028', 2) as page
)
select
  first.page,
  public.get_workout_history_page_for_link(
    'pgtap-token-0028', 2,
    (first.page->'next_cursor'->>'performed_at')::date,
    (first.page->'next_cursor'->>'created_at')::timestamptz,
    (first.page->'next_cursor'->>'id')::uuid
  )
from first;

select is(
  (select jsonb_array_length(first_page->'items')
          + jsonb_array_length(second_page->'items') from _history_pages),
  3,
  'duas páginas preservam todas as sessões que compartilham a data'
);

select is(
  (select count(distinct item->>'id')::int
     from _history_pages h
     cross join lateral jsonb_array_elements(
       (h.first_page->'items') || (h.second_page->'items')
     ) item),
  3,
  'cursor composto não repete sessão entre páginas'
);

-- Consentimento mínimo para o trigger de avaliação; uma leitura de forma
-- inválida deve reverter inclusive o cabeçalho recém-inserido.
insert into public.consent_records
  (org_id, subject_id, consent_version, consent_text_sha256,
   signer_kind, signer_name, collected_by)
values
  ('28000000-0000-0000-0000-000000000002',
   '28000000-0000-0000-0000-000000000003',
   app.canonical_consent_version(),
   encode(sha256(convert_to(app.canonical_consent_text('Org pgTAP 0028'), 'UTF8')), 'hex'),
   'titular', 'Aluna pgTAP 0028', '28000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ select public.create_assessment(
       '28000000-0000-0000-0000-000000000003', current_date, 'pollock3',
       70, 165, '{}'::jsonb, 'pgtap', '{}'::jsonb, '[]'::jsonb, null, null
     ) $$,
  '22023',
  'cannot extract elements from an object',
  'leitura inválida faz create_assessment falhar'
);

select is(
  (select count(*)::int from public.assessments
    where subject_id = '28000000-0000-0000-0000-000000000003'),
  0,
  'falha nas leituras reverte também o cabeçalho da avaliação'
);

-- =====================================================================
-- Avaliacao e contratos publicos de treino
-- =====================================================================
select ok(
  exists (
    select 1
      from pg_index i
      join pg_class idx on idx.oid = i.indexrelid
     where i.indrelid = 'public.workout_exercises'::regclass
       and idx.relname = 'workout_exercises_day_exercise_key'
       and i.indisunique
       and i.indisvalid
  ),
  'indice valido e UNIQUE garante um exercicio por divisao'
);

select ok(
  to_regprocedure(
    'public.create_assessment(uuid,date,text,numeric,numeric,jsonb,text,jsonb,jsonb,text,text)'
  ) is not null,
  'RPC atomica de criacao de avaliacao existe'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_assessment(uuid,date,text,numeric,numeric,jsonb,text,jsonb,jsonb,text,text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.create_assessment(uuid,date,text,numeric,numeric,jsonb,text,jsonb,jsonb,text,text)',
    'execute'
  ),
  'create_assessment e exclusiva do usuario autenticado'
);

select ok(
  not (select p.prosecdef from pg_proc p
        where p.oid = 'public.create_assessment(uuid,date,text,numeric,numeric,jsonb,text,jsonb,jsonb,text,text)'::regprocedure)
  and position('replace_assessment_readings' in pg_get_functiondef(
        'public.create_assessment(uuid,date,text,numeric,numeric,jsonb,text,jsonb,jsonb,text,text)'::regprocedure
      )) > 0,
  'create_assessment preserva RLS e grava leituras na mesma transacao'
);

select ok(
  has_function_privilege(
    'anon',
    'public.get_workout_history_page_for_link(text,int,date,timestamptz,uuid)',
    'execute'
  )
  and (select p.prosecdef from pg_proc p
       where p.oid = 'public.get_workout_history_page_for_link(text,int,date,timestamptz,uuid)'::regprocedure),
  'historico composto e exposto somente pela RPC security definer'
);

select ok(
  position('status = ''archived''' in pg_get_functiondef(
    'public.get_workout_plan_for_link(text,uuid)'::regprocedure
  )) > 0,
  'detalhe historico nao expoe plano draft conhecido'
);

select ok(
  position('link_expires_at' in pg_get_functiondef(
    'public.get_workout_for_link(text)'::regprocedure
  )) > 0
  and position('current_plan_sessions' in pg_get_functiondef(
    'public.get_workout_for_link(text)'::regprocedure
  )) > 0,
  'pacote atual informa expiracao do link e sessoes do plano vigente'
);

select ok(
  position('l.created_at desc' in lower(pg_get_functiondef(
    'app.workout_last_sets(uuid)'::regprocedure
  ))) > 0
  and position('s.weight_kg desc nulls last' in lower(pg_get_functiondef(
    'app.workout_last_sets(uuid)'::regprocedure
  ))) > 0,
  'ultima carga prioriza sessao mais recente antes da melhor serie'
);

select is(public.app_schema_version(), '0028', 'carimbo de schema em 0028');

select * from finish();
rollback;
