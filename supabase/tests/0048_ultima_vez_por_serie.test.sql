-- Somente PostgreSQL/Supabase descartável, com migrations até a 0048.
-- Fixtures fictícias e chamadas reais sob anon e authenticated; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(7);

select ok(public.app_schema_version() >= '0048',
  'schema inclui a última vez de cada série');
select ok(
  not has_function_privilege('authenticated', 'app.workout_last_sets(uuid)', 'execute')
  and not has_function_privilege('anon', 'app.workout_last_sets(uuid)', 'execute'),
  'o helper segue fechado depois de recriado');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
insert into auth.users(id, raw_user_meta_data) values
 ('48000000-0000-0000-0000-000000000001', '{"full_name":"Owner 0048"}'),
 ('48000000-0000-0000-0000-000000000011', '{"full_name":"Owner outra org"}');
select pg_temp.act('48000000-0000-0000-0000-000000000011', 'aal2');
insert into public.organizations(id, name) values ('48000000-0000-0000-0000-000000000012', 'Outra org 0048');
insert into public.org_members(org_id, user_id, role) values
 ('48000000-0000-0000-0000-000000000012', '48000000-0000-0000-0000-000000000011', 'owner');
select pg_temp.act('48000000-0000-0000-0000-000000000001', 'aal2');
insert into public.organizations(id, name) values ('48000000-0000-0000-0000-000000000002', 'Org pgTAP 0048');
insert into public.org_members(org_id, user_id, role) values
 ('48000000-0000-0000-0000-000000000002', '48000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects(id, org_id, full_name, birth_date, sex) values
 ('48000000-0000-0000-0000-000000000003', '48000000-0000-0000-0000-000000000002', 'Aluna 0048', '1990-01-01', 'F');
insert into public.exercises (id, org_id, name, primary_muscle, equipment, movement_pattern) values
 ('48000000-0000-0000-0000-000000000005', '48000000-0000-0000-0000-000000000002',
  'Supino pgTAP 0048', 'chest', 'barbell', 'horizontal_push'),
 ('48000000-0000-0000-0000-000000000006', '48000000-0000-0000-0000-000000000002',
  'Flexão pgTAP 0048', 'chest', 'bodyweight', 'horizontal_push');
insert into public.workout_plans (id, org_id, subject_id, evaluator_id, name, weeks, status) values
 ('48000000-0000-0000-0000-000000000030', '48000000-0000-0000-0000-000000000002',
  '48000000-0000-0000-0000-000000000003', '48000000-0000-0000-0000-000000000001',
  'Plano anterior 0048', 4, 'archived'),
 ('48000000-0000-0000-0000-000000000010', '48000000-0000-0000-0000-000000000002',
  '48000000-0000-0000-0000-000000000003', '48000000-0000-0000-0000-000000000001',
  'Plano atual 0048', 4, 'active');
insert into public.workout_links (subject_id, created_by, token_hash, expires_at)
values ('48000000-0000-0000-0000-000000000003', '48000000-0000-0000-0000-000000000001',
        encode(sha256(convert_to(repeat('w', 43), 'UTF8')), 'hex'), now() + interval '30 days');

-- Sessão antiga: não pode vazar para as séries da sessão escolhida.
insert into public.workout_logs (id, plan_id, performed_at, source, client_ref) values
 ('48000000-0000-0000-0000-000000000031', '48000000-0000-0000-0000-000000000030',
  current_date - 20, 'student', '48000000-0000-0000-0000-0000000000a1');
insert into public.workout_log_sets (log_id, exercise_id, set_number, weight_kg, reps) values
 ('48000000-0000-0000-0000-000000000031', '48000000-0000-0000-0000-000000000005', 1, 30, 10),
 ('48000000-0000-0000-0000-000000000031', '48000000-0000-0000-0000-000000000005', 4, 30, 10);
-- Sessão mais recente: 55×8, 50×12, 50×10 (inseridas fora de ordem), mais uma
-- série vazia e a flexão, que é outro exercício na mesma sessão.
insert into public.workout_logs (id, plan_id, performed_at) values
 ('48000000-0000-0000-0000-000000000032', '48000000-0000-0000-0000-000000000010', current_date - 2);
insert into public.workout_log_sets (log_id, exercise_id, set_number, weight_kg, reps, rir, reached_failure) values
 ('48000000-0000-0000-0000-000000000032', '48000000-0000-0000-0000-000000000005', 3, 50, 10, 0, true),
 ('48000000-0000-0000-0000-000000000032', '48000000-0000-0000-0000-000000000005', 1, 55, 8, 1, false),
 ('48000000-0000-0000-0000-000000000032', '48000000-0000-0000-0000-000000000005', 2, 50, 12, 1, false),
 ('48000000-0000-0000-0000-000000000032', '48000000-0000-0000-0000-000000000005', 4, null, null, null, false),
 ('48000000-0000-0000-0000-000000000032', '48000000-0000-0000-0000-000000000006', 1, null, 20, null, false);

set local role authenticated;
create temporary table _ultimas as
  select public.subject_last_sets('48000000-0000-0000-0000-000000000003') as v;
reset role;

create function pg_temp.item(p_exercise text) returns jsonb language sql as $$
  select e from _ultimas, jsonb_array_elements(v) e where e->>'exercise_id' = p_exercise
$$;

select is(
  (select string_agg((s->>'set_number') || ':' || (s->>'weight_kg')::numeric || '×' || (s->>'reps'), ' '
                     order by (s->>'set_number')::int)
     from jsonb_array_elements(pg_temp.item('48000000-0000-0000-0000-000000000005')->'sets') s),
  '1:55.00×8 2:50.00×12 3:50.00×10',
  'cada série da última sessão, em ordem, sem a vazia e sem a sessão antiga');
select is(
  pg_temp.item('48000000-0000-0000-0000-000000000005')->'sets'->2,
  '{"set_number": 3, "weight_kg": 50.00, "reps": 10, "rir": 0, "reached_failure": true}'::jsonb,
  'a série leva RIR e falha');
select is(
  (select (e->>'weight_kg')::numeric || '×' || (e->>'reps')
     from (select pg_temp.item('48000000-0000-0000-0000-000000000005') as e) d),
  '50.00×12',
  'a melhor série (1RM estimado) continua no item, para a sugestão de carga');
select is(
  pg_temp.item('48000000-0000-0000-0000-000000000006')->'sets',
  '[{"set_number": 1, "weight_kg": null, "reps": 20, "rir": null, "reached_failure": false}]'::jsonb,
  'peso corporal também tem as séries');

set local role anon;
create temporary table _pacote as select public.get_workout_for_link(repeat('w', 43)) as v;
reset role;
select is(
  (select v->'last_sets' from _pacote),
  (select v from _ultimas),
  'o aluno recebe as mesmas séries que o profissional');

select * from finish();
rollback;
