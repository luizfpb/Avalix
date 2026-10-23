-- Somente PostgreSQL/Supabase descartável, com migrations até a 0053.
-- Fixtures fictícias e chamadas reais sob authenticated; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(16);

select ok(public.app_schema_version() >= '0053', 'schema inclui a criação idempotente');
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('create_assessment', 'create_workout_plan')),
  2, 'uma função de cada, sem sobrecarga ambígua para o PostgREST');
select ok(
  (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')
                   and not has_function_privilege('anon', p.oid, 'execute')
                   and not p.prosecdef)
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('create_assessment', 'create_workout_plan')),
  'continuam só do usuário autenticado e security invoker (RLS vale)');

create function pg_temp.act(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', case when p_user is null then '' else json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text end, true);
$$;
grant execute on function pg_temp.act(uuid) to authenticated;

insert into auth.users(id, raw_user_meta_data) values
 ('53000000-0000-0000-0000-000000000001', '{"full_name":"Owner 0053"}'),
 ('53000000-0000-0000-0000-000000000009', '{"full_name":"Outra org 0053"}');

select pg_temp.act('53000000-0000-0000-0000-000000000001');
set local role authenticated;
create temp table if not exists t_org(id uuid);
grant all on t_org to authenticated;
insert into t_org select public.create_organization('Org pgTAP 0053');
insert into public.subjects (id, org_id, full_name, birth_date, sex) values
 ('53000000-0000-0000-0000-000000000003', (select id from t_org), 'Aluna pgTAP 0053', '1990-05-10', 'F'),
 ('53000000-0000-0000-0000-000000000004', (select id from t_org), 'Outra aluna 0053', '1991-06-11', 'F');
reset role;
-- consentimento mínimo para o gatilho da avaliação (o schema app não é do authenticated)
insert into public.consent_records
  (org_id, subject_id, consent_version, consent_text_sha256, signer_kind, signer_name, collected_by)
select (select id from t_org), s.id, app.canonical_consent_version(),
       encode(sha256(convert_to(app.canonical_consent_text('Org pgTAP 0053'), 'UTF8')), 'hex'),
       'titular', s.full_name, '53000000-0000-0000-0000-000000000001'
  from public.subjects s where s.org_id = (select id from t_org);
set local role authenticated;

-- =====================================================================
-- Avaliação física
-- =====================================================================
create temp table if not exists t_a(id uuid);
grant all on t_a to authenticated;
insert into t_a select (public.create_assessment(
  '53000000-0000-0000-0000-000000000003', current_date, 'pollock3', 70, 165, '{}'::jsonb, 'pgtap',
  '[]'::jsonb, '[{"site":"waist","value_cm":80}]'::jsonb, null, null,
  '53000000-0000-0000-0000-0000000000a1')).id;
select is((select id from t_a), '53000000-0000-0000-0000-0000000000a1'::uuid, 'a avaliação nasce com o id da ação');

-- resposta perdida: a tela manda de novo, com o mesmo id e as mesmas leituras
select is(
  (public.create_assessment(
    '53000000-0000-0000-0000-000000000003', current_date, 'pollock3', 70, 165, '{}'::jsonb, 'pgtap',
    '[]'::jsonb, '[{"site":"waist","value_cm":80}]'::jsonb, null, null,
    '53000000-0000-0000-0000-0000000000a1')).id,
  '53000000-0000-0000-0000-0000000000a1'::uuid, 'a nova tentativa devolve a mesma avaliação');
select is((select count(*)::int from public.assessments where subject_id = '53000000-0000-0000-0000-000000000003'),
  1, 'e não cria outra (antes: duas avaliações iguais na evolução)');
select is((select count(*)::int from public.circumference_readings where assessment_id = '53000000-0000-0000-0000-0000000000a1'),
  1, 'as leituras não são regravadas nem duplicadas');
select throws_ok(
  $$ select public.create_assessment(
       '53000000-0000-0000-0000-000000000004', current_date, 'pollock3', 70, 165, '{}'::jsonb, 'pgtap',
       '[]'::jsonb, '[]'::jsonb, null, null, '53000000-0000-0000-0000-0000000000a1') $$,
  'P0001', 'avaliacao indisponivel', 'o mesmo id para outro avaliado é recusado');
select isnt(
  (public.create_assessment(
    '53000000-0000-0000-0000-000000000003', current_date, 'pollock3', 71, 165, '{}'::jsonb, 'pgtap',
    '[]'::jsonb, '[]'::jsonb)).id,
  '53000000-0000-0000-0000-0000000000a1'::uuid, 'sem p_id, como o frontend publicado, cria uma nova');
reset role;

-- outra organização não usa o id para ler avaliação alheia
select pg_temp.act('53000000-0000-0000-0000-000000000009');
set local role authenticated;
create temp table if not exists t_org2(id uuid);
grant all on t_org2 to authenticated;
insert into t_org2 select public.create_organization('Outra org 0053');
insert into public.subjects (id, org_id, full_name, birth_date, sex) values
 ('53000000-0000-0000-0000-000000000005', (select id from t_org2), 'Aluno outra org', '1990-05-10', 'M');
reset role;
insert into public.consent_records
  (org_id, subject_id, consent_version, consent_text_sha256, signer_kind, signer_name, collected_by)
values ((select id from t_org2), '53000000-0000-0000-0000-000000000005', app.canonical_consent_version(),
  encode(sha256(convert_to(app.canonical_consent_text('Outra org 0053'), 'UTF8')), 'hex'),
  'titular', 'Aluno outra org', '53000000-0000-0000-0000-000000000009');
set local role authenticated;
select throws_ok(
  $$ select public.create_assessment(
       '53000000-0000-0000-0000-000000000005', current_date, 'pollock3', 70, 165, '{}'::jsonb, 'pgtap',
       '[]'::jsonb, '[]'::jsonb, null, null, '53000000-0000-0000-0000-0000000000a1') $$,
  null, null, 'id de avaliação de outra organização não vira leitura nem gravação');
reset role;

-- =====================================================================
-- Plano de treino
-- =====================================================================
select pg_temp.act('53000000-0000-0000-0000-000000000001');
set local role authenticated;
select is(
  (public.create_workout_plan((select id from t_org), '53000000-0000-0000-0000-000000000003',
    'Plano 0053', 4, 'active', '["A"]', '{}'::jsonb, 'volume-engine@2',
    '[{"label":"A","position":0,"exercises":[]}]', '[]', '[]',
    null, null, null, null, null, '53000000-0000-0000-0000-0000000000b1')).id,
  '53000000-0000-0000-0000-0000000000b1'::uuid, 'o plano nasce com o id da ação');
-- o profissional mexe no plano em outra aba antes da nova tentativa chegar
update public.workout_days set name = 'Editado' where plan_id = '53000000-0000-0000-0000-0000000000b1';
select is(
  (public.create_workout_plan((select id from t_org), '53000000-0000-0000-0000-000000000003',
    'Plano 0053', 4, 'active', '["A"]', '{}'::jsonb, 'volume-engine@2',
    '[{"label":"A","position":0,"exercises":[]}]', '[]', '[]',
    null, null, null, null, null, '53000000-0000-0000-0000-0000000000b1')).id,
  '53000000-0000-0000-0000-0000000000b1'::uuid, 'a nova tentativa devolve o mesmo plano');
select is((select count(*)::int from public.workout_plans where subject_id = '53000000-0000-0000-0000-000000000003'),
  1, 'e não cria um segundo plano');
select is((select status from public.workout_plans where id = '53000000-0000-0000-0000-0000000000b1'),
  'active', 'o plano continua o vigente (o gatilho de arquivar não roda de novo)');
select is((select name from public.workout_days where plan_id = '53000000-0000-0000-0000-0000000000b1'),
  'Editado', 'as divisões não são regravadas por cima da edição');
select throws_ok(
  $$ select public.create_workout_plan((select id from t_org), '53000000-0000-0000-0000-000000000004',
       'Plano 0053', 4, 'draft', '[]', '{}'::jsonb, 'volume-engine@2', '[]', '[]', '[]',
       null, null, null, null, null, '53000000-0000-0000-0000-0000000000b1') $$,
  'P0001', 'plano indisponivel', 'o mesmo id para outro avaliado é recusado');
reset role;

select * from finish();
rollback;
