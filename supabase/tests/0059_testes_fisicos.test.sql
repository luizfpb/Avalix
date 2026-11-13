-- Somente PostgreSQL/Supabase descartável, com migrations até a 0059.
-- Fixtures fictícias e chamadas reais sob authenticated; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(23);

select ok(public.app_schema_version() >= '0059', 'schema inclui os testes físicos');
select ok((select relrowsecurity from pg_class where oid = 'public.fitness_tests'::regclass),
  'RLS ligada em fitness_tests');
select ok(not has_table_privilege('anon', 'public.fitness_tests', 'select')
          and not has_table_privilege('anon', 'public.fitness_tests', 'insert'),
  'o anon não toca a tabela');
select ok(
  not has_function_privilege('authenticated', 'app.export_subject_data_0034(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.export_subject_data(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.export_subject_data(uuid)', 'execute'),
  'a exportação antiga só é chamada pela nova');

create function pg_temp.act(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', case when p_user is null then '' else json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text end, true);
$$;
grant execute on function pg_temp.act(uuid) to authenticated;

insert into auth.users(id, raw_user_meta_data) values
 ('59000000-0000-0000-0000-000000000001', '{"full_name":"Owner 0059"}'),
 ('59000000-0000-0000-0000-000000000009', '{"full_name":"Outra org 0059"}');

select pg_temp.act('59000000-0000-0000-0000-000000000001');
set local role authenticated;
create temp table if not exists t_org(id uuid);
grant all on t_org to authenticated;
insert into t_org select public.create_organization('Org pgTAP 0059');
insert into public.subjects (id, org_id, full_name, birth_date, sex) values
 ('59000000-0000-0000-0000-000000000003', (select id from t_org), 'Aluna pgTAP 0059', '1990-05-10', 'F'),
 ('59000000-0000-0000-0000-000000000004', (select id from t_org), 'Sem consentimento 0059', '1991-06-11', 'M');
reset role;
insert into public.consent_records
  (org_id, subject_id, consent_version, consent_text_sha256, signer_kind, signer_name, collected_by)
select (select id from t_org), s.id, app.canonical_consent_version(),
       encode(sha256(convert_to(app.canonical_consent_text('Org pgTAP 0059'), 'UTF8')), 'hex'),
       'titular', s.full_name, '59000000-0000-0000-0000-000000000001'
  from public.subjects s where s.id = '59000000-0000-0000-0000-000000000003';
set local role authenticated;

-- =====================================================================
-- Gravação válida
-- =====================================================================
select lives_ok($$
  insert into public.fitness_tests (id, org_id, subject_id, tested_at, measures) values
   ('59000000-0000-0000-0000-0000000000a1', (select id from t_org), '59000000-0000-0000-0000-000000000003',
    '2026-11-01',
    '{"cooper":{"distance_m":2400},
      "rockport":{"time_s":900,"heart_rate_bpm":120,"weight_kg":65.5},
      "queens":{"heart_rate_bpm":150},
      "push_ups":{"reps":18,"knees":true},
      "sit_ups":{"reps":30},
      "sit_and_reach":{"best_cm":31.5,"feet_mark_cm":23},
      "grip":{"right_kg":30,"left_kg":28}}')
$$, 'todos os testes juntos são aceitos');
select is((select org_id from public.fitness_tests where id = '59000000-0000-0000-0000-0000000000a1'),
  (select id from t_org), 'a org vem do avaliado');
select is((select evaluator_id from public.fitness_tests where id = '59000000-0000-0000-0000-0000000000a1'),
  '59000000-0000-0000-0000-000000000001'::uuid, 'o avaliador é quem gravou');
select lives_ok($$
  insert into public.fitness_tests (subject_id, org_id, measures) values
   ('59000000-0000-0000-0000-000000000003', (select id from t_org), '{"grip":{"left_kg":25}}')
$$, 'um teste só, com uma mão só, é aceito');

-- =====================================================================
-- Medidas recusadas
-- =====================================================================
select throws_ok($$
  insert into public.fitness_tests (subject_id, org_id, measures) values
   ('59000000-0000-0000-0000-000000000003', (select id from t_org), '{}')
$$, '23514', null, 'sem nenhum teste é recusado');
select throws_ok($$
  insert into public.fitness_tests (subject_id, org_id, measures) values
   ('59000000-0000-0000-0000-000000000003', (select id from t_org), '{"burpee":{"reps":10}}')
$$, '23514', null, 'teste desconhecido é recusado');
select throws_ok($$
  insert into public.fitness_tests (subject_id, org_id, measures) values
   ('59000000-0000-0000-0000-000000000003', (select id from t_org), '{"cooper":{"distance_m":"2400"}}')
$$, '23514', null, 'número como texto é recusado');
select throws_ok($$
  insert into public.fitness_tests (subject_id, org_id, measures) values
   ('59000000-0000-0000-0000-000000000003', (select id from t_org), '{"cooper":{"distance_m":24000}}')
$$, '23514', null, 'distância fora da faixa física é recusada');
select throws_ok($$
  insert into public.fitness_tests (subject_id, org_id, measures) values
   ('59000000-0000-0000-0000-000000000003', (select id from t_org), '{"rockport":{"time_s":900,"heart_rate_bpm":120}}')
$$, '23514', null, 'Rockport sem o peso é recusado');
select throws_ok($$
  insert into public.fitness_tests (subject_id, org_id, measures) values
   ('59000000-0000-0000-0000-000000000003', (select id from t_org), '{"sit_and_reach":{"best_cm":30,"feet_mark_cm":24}}')
$$, '23514', null, 'banco com os pés fora de 23 ou 26 cm é recusado');
select throws_ok($$
  insert into public.fitness_tests (subject_id, org_id, measures) values
   ('59000000-0000-0000-0000-000000000003', (select id from t_org), '{"grip":{}}')
$$, '23514', null, 'preensão sem nenhuma mão é recusada');
select throws_ok($$
  insert into public.fitness_tests (subject_id, org_id, measures) values
   ('59000000-0000-0000-0000-000000000003', (select id from t_org), '{"push_ups":{"reps":10,"knees":true,"extra":1}}')
$$, '23514', null, 'chave a mais dentro do teste é recusada');

-- =====================================================================
-- Consentimento e congelamento
-- =====================================================================
select throws_ok($$
  insert into public.fitness_tests (subject_id, org_id, measures) values
   ('59000000-0000-0000-0000-000000000004', (select id from t_org), '{"sit_ups":{"reps":20}}')
$$, '42501', null, 'sem consentimento ativo a RLS recusa');
select throws_ok($$
  update public.fitness_tests set subject_id = '59000000-0000-0000-0000-000000000004'
   where id = '59000000-0000-0000-0000-0000000000a1'
$$, null, null, 'o avaliado do teste não muda');
reset role;

-- =====================================================================
-- Outra organização não enxerga
-- =====================================================================
select pg_temp.act('59000000-0000-0000-0000-000000000009');
set local role authenticated;
select is((select count(*)::int from public.fitness_tests), 0, 'outra organização não lê os testes');
reset role;

-- =====================================================================
-- Exportação do titular
-- =====================================================================
select pg_temp.act('59000000-0000-0000-0000-000000000001');
set local role authenticated;
create temp table if not exists t_exp(v jsonb);
grant all on t_exp to authenticated;
insert into t_exp select public.export_subject_data('59000000-0000-0000-0000-000000000003');
select is((select jsonb_array_length(v -> 'fitness_tests') from t_exp), 2, 'a exportação leva os testes');
select ok((select v ->> 'schema_version' = '1.2' and v ? 'assessments' and v ? 'posture_sessions' from t_exp),
  'e mantém as coleções de antes, com a versão nova');
reset role;
select is((select count(*)::int from public.audit_logs
            where action = 'SUBJECT_EXPORT' and row_id = '59000000-0000-0000-0000-000000000003'),
  1, 'um evento de exportação só');

-- =====================================================================
-- Só leitura pela assinatura
-- =====================================================================
update public.org_subscriptions
   set status = 'trial', trial_ends_at = now() - interval '1 day', current_period_end = null
 where org_id = (select id from t_org);
select pg_temp.act('59000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$
  insert into public.fitness_tests (subject_id, org_id, measures) values
   ('59000000-0000-0000-0000-000000000003', (select id from t_org), '{"sit_ups":{"reps":20}}')
$$, null, null, 'conta em só leitura não grava teste novo');
reset role;

select * from finish();
