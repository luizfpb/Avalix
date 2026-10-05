-- Somente PostgreSQL/Supabase descartável, com migrations até a 0044.
-- Fixtures fictícias e chamadas reais sob anon e authenticated; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(8);

select ok(public.app_schema_version() >= '0044',
  'schema inclui a última carga com uma regra só');
select ok(
  has_function_privilege('authenticated', 'public.subject_last_sets(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.subject_last_sets(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app.workout_last_sets(uuid)', 'execute'),
  'o profissional lê pelo avaliado; o aluno recebe pelo link; o helper segue fechado');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
insert into auth.users(id, raw_user_meta_data) values
 ('44000000-0000-0000-0000-000000000001', '{"full_name":"Owner 0044"}'),
 ('44000000-0000-0000-0000-000000000011', '{"full_name":"Owner outra org"}');
select pg_temp.act('44000000-0000-0000-0000-000000000011', 'aal2');
insert into public.organizations(id, name) values ('44000000-0000-0000-0000-000000000012', 'Outra org 0044');
insert into public.org_members(org_id, user_id, role) values
 ('44000000-0000-0000-0000-000000000012', '44000000-0000-0000-0000-000000000011', 'owner');
select pg_temp.act('44000000-0000-0000-0000-000000000001', 'aal2');
insert into public.organizations(id, name) values ('44000000-0000-0000-0000-000000000002', 'Org pgTAP 0044');
insert into public.org_members(org_id, user_id, role) values
 ('44000000-0000-0000-0000-000000000002', '44000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects(id, org_id, full_name, birth_date, sex) values
 ('44000000-0000-0000-0000-000000000003', '44000000-0000-0000-0000-000000000002', 'Aluna 0044', '1990-01-01', 'F');
insert into public.exercises (id, org_id, name, primary_muscle, equipment, movement_pattern) values
 ('44000000-0000-0000-0000-000000000005', '44000000-0000-0000-0000-000000000002',
  'Supino pgTAP 0044', 'chest', 'barbell', 'horizontal_push'),
 ('44000000-0000-0000-0000-000000000006', '44000000-0000-0000-0000-000000000002',
  'Flexão pgTAP 0044', 'chest', 'bodyweight', 'horizontal_push');
insert into public.workout_plans (id, org_id, subject_id, evaluator_id, name, weeks, status) values
 ('44000000-0000-0000-0000-000000000030', '44000000-0000-0000-0000-000000000002',
  '44000000-0000-0000-0000-000000000003', '44000000-0000-0000-0000-000000000001',
  'Plano anterior 0044', 4, 'archived'),
 ('44000000-0000-0000-0000-000000000010', '44000000-0000-0000-0000-000000000002',
  '44000000-0000-0000-0000-000000000003', '44000000-0000-0000-0000-000000000001',
  'Plano atual 0044', 4, 'active');
insert into public.workout_links (subject_id, created_by, token_hash, expires_at)
values ('44000000-0000-0000-0000-000000000003', '44000000-0000-0000-0000-000000000001',
        encode(sha256(convert_to(repeat('u', 43), 'UTF8')), 'hex'), now() + interval '30 days');

-- Mesociclo anterior: o aluno fez supino pesado e flexão sem carga.
insert into public.workout_logs (id, plan_id, performed_at, source, client_ref) values
 ('44000000-0000-0000-0000-000000000031', '44000000-0000-0000-0000-000000000030',
  current_date - 20, 'student', '44000000-0000-0000-0000-0000000000a1');
insert into public.workout_log_sets (log_id, exercise_id, set_number, weight_kg, reps) values
 ('44000000-0000-0000-0000-000000000031', '44000000-0000-0000-0000-000000000005', 1, 50, 5),
 ('44000000-0000-0000-0000-000000000031', '44000000-0000-0000-0000-000000000006', 1, null, 15);
-- Sessão mais recente do supino, do profissional, no plano atual: 40×12 tem
-- 1RM estimado maior que 42,5×6, embora seja mais leve.
insert into public.workout_logs (id, plan_id, performed_at) values
 ('44000000-0000-0000-0000-000000000032', '44000000-0000-0000-0000-000000000010', current_date - 2);
insert into public.workout_log_sets (log_id, exercise_id, set_number, weight_kg, reps, rir) values
 ('44000000-0000-0000-0000-000000000032', '44000000-0000-0000-0000-000000000005', 1, 42.5, 6, 1),
 ('44000000-0000-0000-0000-000000000032', '44000000-0000-0000-0000-000000000005', 2, 40, 12, 2);

set local role authenticated;
create temporary table _ultimas as
  select public.subject_last_sets('44000000-0000-0000-0000-000000000003') as v;
reset role;

select is(
  (select (e->>'weight_kg')::numeric || '×' || (e->>'reps')
     from _ultimas, jsonb_array_elements(v) e
    where e->>'exercise_id' = '44000000-0000-0000-0000-000000000005'),
  '40.00×12',
  'a melhor série da sessão mais recente pelo 1RM estimado, não a mais pesada');
select is(
  (select e->>'performed_at'
     from _ultimas, jsonb_array_elements(v) e
    where e->>'exercise_id' = '44000000-0000-0000-0000-000000000005'),
  (current_date - 2)::text,
  'vale a sessão mais recente, do profissional, mesmo havendo uma mais pesada antes');
select ok(
  (select e->>'reps' = '15' and e->'weight_kg' = 'null'::jsonb
     from _ultimas, jsonb_array_elements(v) e
    where e->>'exercise_id' = '44000000-0000-0000-0000-000000000006'),
  'peso corporal de um mesociclo anterior, registrado pelo aluno, também conta');

set local role anon;
create temporary table _pacote as select public.get_workout_for_link(repeat('u', 43)) as v;
reset role;
select is(
  (select v->'last_sets' from _pacote),
  (select v from _ultimas),
  'o aluno vê exatamente a mesma última carga que o profissional');

select pg_temp.act('44000000-0000-0000-0000-000000000011', 'aal2');
set local role authenticated;
select is(
  public.subject_last_sets('44000000-0000-0000-0000-000000000003'),
  '[]'::jsonb,
  'profissional de outra organização não lê nada');
select is(
  public.subject_last_sets(null),
  '[]'::jsonb,
  'avaliado nulo não quebra a tela');
reset role;

select * from finish();
rollback;
