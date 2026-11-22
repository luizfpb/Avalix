-- Somente PostgreSQL/Supabase descartável, com migrations até a 0061.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(7);

select ok(public.app_schema_version() >= '0061', 'schema inclui evolução no link do aluno');
select ok(
  has_function_privilege('anon', 'public.get_workout_for_link(text)', 'execute'),
  'get_workout_for_link segue acessível para anon');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

insert into auth.users(id, raw_user_meta_data) values
 ('61000000-0000-0000-0000-000000000001', '{"full_name":"Owner 0061"}');
select pg_temp.act('61000000-0000-0000-0000-000000000001', 'aal2');
insert into public.organizations(id, name) values ('61000000-0000-0000-0000-000000000002', 'Org pgTAP 0061');
insert into public.org_members(org_id, user_id, role) values
 ('61000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects(id, org_id, full_name, birth_date, sex) values
 ('61000000-0000-0000-0000-000000000003', '61000000-0000-0000-0000-000000000002', 'Aluno 0061', '1992-05-10', 'M');
insert into public.consents(org_id, subject_id, version, accepted_at) values
 ('61000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000003', '1.1', now());

insert into public.assessments(id, org_id, subject_id, evaluator_id, assessed_at, weight_kg, height_cm, notes, results) values
 ('61000000-0000-0000-0000-000000000020', '61000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000003',
  '61000000-0000-0000-0000-000000000001', current_date - 60, 82.0, 178, 'Nota clinica privada',
  '{"bodyFatPct":21.5,"leanMassKg":64.4}'::jsonb),
 ('61000000-0000-0000-0000-000000000021', '61000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000003',
  current_date - 5, 79.2, 178, 'Outra nota privada',
  '{"bodyFatPct":18.4,"leanMassKg":64.6}'::jsonb);

insert into public.exercises(id, org_id, name, primary_muscle, equipment, movement_pattern, aliases) values
 ('61000000-0000-0000-0000-000000000030', '61000000-0000-0000-0000-000000000002',
  'Supino pgTAP 0061', 'chest', 'barbell', 'horizontal_push', '{}');

insert into public.workout_plans(id, org_id, subject_id, evaluator_id, name, status, weeks) values
 ('61000000-0000-0000-0000-000000000040', '61000000-0000-0000-0000-000000000002',
  '61000000-0000-0000-0000-000000000003', '61000000-0000-0000-0000-000000000001',
  'Plano 0061', 'active', 4);

insert into public.workout_logs(id, org_id, subject_id, plan_id, performed_at, in_progress, source) values
 ('61000000-0000-0000-0000-000000000050', '61000000-0000-0000-0000-000000000002',
  '61000000-0000-0000-0000-000000000003', '61000000-0000-0000-0000-000000000040',
  current_date - 2, false, 'student'),
 ('61000000-0000-0000-0000-000000000051', '61000000-0000-0000-0000-000000000002',
  '61000000-0000-0000-0000-000000000003', '61000000-0000-0000-0000-000000000040',
  current_date - 45, false, 'student');

insert into public.workout_log_sets(log_id, exercise_id, set_number, weight_kg, reps) values
 ('61000000-0000-0000-0000-000000000051', '61000000-0000-0000-0000-000000000030', 1, 70, 8),
 ('61000000-0000-0000-0000-000000000050', '61000000-0000-0000-0000-000000000030', 1, 82.5, 6);

insert into public.workout_links(subject_id, created_by, token_hash, expires_at)
values ('61000000-0000-0000-0000-000000000003', '61000000-0000-0000-0000-000000000001',
        encode(sha256(convert_to(repeat('f', 43), 'UTF8')), 'hex'), now() + interval '30 days');

set local role anon;
create temporary table _pacote61 as select public.get_workout_for_link(repeat('f', 43)) as v;
reset role;

select is((select (v->'evolution'->>'sessions_30d')::int from _pacote61), 1, 'conta apenas sessões dos últimos 30 dias');
select is((select (v->'evolution'->>'sessions_total')::int from _pacote61), 2, 'conta o total de sessões concluídas');
select is(
  (select (v->'evolution'->'prs'->0->>'best_weight_kg')::numeric from _pacote61),
  82.5::numeric,
  'retorna o maior peso registrado (PR) do exercício');
select is(
  (select jsonb_array_length(v->'evolution'->'assessments') from _pacote61),
  2,
  'traz o resumo das avaliações em ordem cronológica');
select ok(
  (select (v->'evolution'->'assessments')::text not like '%Nota clinica privada%' from _pacote61),
  'não expõe notas clínicas privadas no pacote do aluno');

select * from finish();
rollback;
