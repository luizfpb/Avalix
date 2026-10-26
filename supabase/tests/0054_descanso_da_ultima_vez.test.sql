-- Somente PostgreSQL/Supabase descartável, com migrations até a 0054.
-- Fixtures fictícias e chamadas reais sob anon e authenticated; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(5);

select ok(public.app_schema_version() >= '0054',
  'schema inclui o descanso de cada série da última vez');
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
 ('54000000-0000-0000-0000-000000000001', '{"full_name":"Owner 0054"}');
select pg_temp.act('54000000-0000-0000-0000-000000000001', 'aal2');
insert into public.organizations(id, name) values ('54000000-0000-0000-0000-000000000002', 'Org pgTAP 0054');
insert into public.org_members(org_id, user_id, role) values
 ('54000000-0000-0000-0000-000000000002', '54000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects(id, org_id, full_name, birth_date, sex) values
 ('54000000-0000-0000-0000-000000000003', '54000000-0000-0000-0000-000000000002', 'Aluna 0054', '1990-01-01', 'F');
insert into public.exercises (id, org_id, name, primary_muscle, equipment, movement_pattern) values
 ('54000000-0000-0000-0000-000000000005', '54000000-0000-0000-0000-000000000002',
  'Supino pgTAP 0054', 'chest', 'barbell', 'horizontal_push');
insert into public.workout_plans (id, org_id, subject_id, evaluator_id, name, weeks, status) values
 ('54000000-0000-0000-0000-000000000010', '54000000-0000-0000-0000-000000000002',
  '54000000-0000-0000-0000-000000000003', '54000000-0000-0000-0000-000000000001',
  'Plano 0054', 4, 'active');
insert into public.workout_links (subject_id, created_by, token_hash, expires_at)
values ('54000000-0000-0000-0000-000000000003', '54000000-0000-0000-0000-000000000001',
        encode(sha256(convert_to(repeat('d', 43), 'UTF8')), 'hex'), now() + interval '30 days');

-- Sessão antiga com descanso diferente: não pode vazar para a escolhida.
insert into public.workout_logs (id, plan_id, performed_at) values
 ('54000000-0000-0000-0000-000000000031', '54000000-0000-0000-0000-000000000010', current_date - 9);
insert into public.workout_log_sets (log_id, exercise_id, set_number, weight_kg, reps, rest_seconds) values
 ('54000000-0000-0000-0000-000000000031', '54000000-0000-0000-0000-000000000005', 1, 40, 10, 300);
-- Última sessão: 90 s, sem descanso (0) e não informado (NULL).
insert into public.workout_logs (id, plan_id, performed_at) values
 ('54000000-0000-0000-0000-000000000032', '54000000-0000-0000-0000-000000000010', current_date - 2);
insert into public.workout_log_sets (log_id, exercise_id, set_number, weight_kg, reps, rest_seconds) values
 ('54000000-0000-0000-0000-000000000032', '54000000-0000-0000-0000-000000000005', 1, 50, 10, 90),
 ('54000000-0000-0000-0000-000000000032', '54000000-0000-0000-0000-000000000005', 2, 50, 9, 0),
 ('54000000-0000-0000-0000-000000000032', '54000000-0000-0000-0000-000000000005', 3, 50, 8, null);

set local role authenticated;
create temporary table _ultimas as
  select public.subject_last_sets('54000000-0000-0000-0000-000000000003') as v;
reset role;

select is(
  (select string_agg((s->>'set_number') || ':' || coalesce(s->>'rest_seconds', 'null'), ' '
                     order by (s->>'set_number')::int)
     from _ultimas, jsonb_array_elements(v) e, jsonb_array_elements(e->'sets') s),
  '1:90 2:0 3:null',
  'cada série leva o próprio descanso, da sessão mais recente');
select ok(
  (select bool_and((s ? 'rest_seconds'))
     from _ultimas, jsonb_array_elements(v) e, jsonb_array_elements(e->'sets') s),
  'o campo vem mesmo quando o descanso não foi informado');

set local role anon;
create temporary table _pacote as select public.get_workout_for_link(repeat('d', 43)) as v;
reset role;
select is(
  (select v->'last_sets' from _pacote),
  (select v from _ultimas),
  'o aluno recebe o mesmo descanso que o profissional');

select * from finish();
rollback;
