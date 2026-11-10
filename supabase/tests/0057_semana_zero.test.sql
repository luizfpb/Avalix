-- Somente PostgreSQL/Supabase descartável, com migrations até a 0057.
-- Fixtures fictícias e chamadas reais sob anon e authenticated; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(13);

select ok(public.app_schema_version() >= '0057', 'schema inclui a semana 0');
select ok(
  (select count(*) from pg_constraint c
    where c.conrelid in ('public.workout_weeks'::regclass, 'public.workout_week_overrides'::regclass,
                         'public.workout_logs'::regclass)
      and c.contype = 'c' and pg_get_constraintdef(c.oid) ~ 'week_number >= 1') = 0,
  'nenhum check antigo de semana >= 1 sobrou');
select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('update_workout_log', 'update_workout_session_for_link', 'submit_workout_session_0027_internal')) = 3,
  'sem sobrecarga nas funções regravadas');
select ok(
  not has_function_privilege('anon', 'public.update_workout_log(uuid,timestamptz,jsonb,date,text,int)', 'execute')
  and has_function_privilege('authenticated', 'public.update_workout_log(uuid,timestamptz,jsonb,date,text,int)', 'execute')
  and has_function_privilege('anon', 'public.update_workout_session_for_link(text,uuid,timestamptz,jsonb,date,text,int)', 'execute')
  and not has_function_privilege('anon',
    'public.submit_workout_session_0027_internal(text,uuid,jsonb,text,int,date,text,uuid,int,boolean)', 'execute'),
  'grants preservados');

select set_config('request.jwt.claim.sub', '57000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"57000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
insert into auth.users (id, raw_user_meta_data) values
  ('57000000-0000-0000-0000-000000000001', '{"full_name":"Treinador pgTAP 0057"}');
insert into public.organizations (id, name) values
  ('57000000-0000-0000-0000-000000000002', 'Org pgTAP 0057');
insert into public.org_members (org_id, user_id, role) values
  ('57000000-0000-0000-0000-000000000002', '57000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects (id, org_id, evaluator_id, full_name, birth_date, sex) values
  ('57000000-0000-0000-0000-000000000003', '57000000-0000-0000-0000-000000000002',
   '57000000-0000-0000-0000-000000000001', 'Aluna pgTAP 0057', '1990-01-01', 'F');
insert into public.exercises (id, org_id, name, primary_muscle, equipment, movement_pattern) values
  ('57000000-0000-0000-0000-000000000004', '57000000-0000-0000-0000-000000000002',
   'Exercício pgTAP 0057', 'chest', 'barbell', 'horizontal_push');
insert into public.workout_plans (id, org_id, subject_id, evaluator_id, name, weeks, status) values
  ('57000000-0000-0000-0000-000000000005', '57000000-0000-0000-0000-000000000002',
   '57000000-0000-0000-0000-000000000003', '57000000-0000-0000-0000-000000000001', 'Plano pgTAP 0057', 4, 'active');
insert into public.workout_links (org_id, subject_id, created_by, token_hash, expires_at) values
  ('57000000-0000-0000-0000-000000000002', '57000000-0000-0000-0000-000000000003',
   '57000000-0000-0000-0000-000000000001', encode(sha256(convert_to('pgtap-token-0057', 'UTF8')), 'hex'), now() + interval '30 days');

create temporary table _sets (value jsonb not null);
insert into _sets values
  ('[{"exercise_id":"57000000-0000-0000-0000-000000000004","set_number":1,"weight_kg":40,"reps":10,"rir":1}]');
create temporary table _state (name text primary key, log_id uuid, version timestamptz);
grant select on _sets to anon, authenticated;
grant select, insert, update on _state to anon, authenticated;

set local role authenticated;
select lives_ok(
  $$ insert into public.workout_weeks (plan_id, week_number, label)
     values ('57000000-0000-0000-0000-000000000005', 0, 'Adaptação') $$,
  'o plano guarda a semana 0');
select throws_ok(
  $$ insert into public.workout_weeks (plan_id, week_number, label)
     values ('57000000-0000-0000-0000-000000000005', -1, 'Negativa') $$,
  '23514', null, 'semana negativa continua recusada');
insert into _state (name, log_id, version)
select 'trainer', l.id, l.updated_at from _sets s
cross join lateral public.create_workout_log('57000000-0000-0000-0000-000000000005',
  s.value, null, 0, current_date, null) l;
select is(
  (select week_number from public.workout_logs where id = (select log_id from _state where name = 'trainer')),
  0, 'profissional registra na semana 0');
select lives_ok(
  $$ update _state set version = (public.update_workout_log(log_id, version, (select value from _sets), current_date, null, 2)).updated_at
      where name = 'trainer' $$,
  'profissional move da semana 0 para a 2');
select lives_ok(
  $$ update _state set version = (public.update_workout_log(log_id, version, (select value from _sets), current_date, null, 0)).updated_at
      where name = 'trainer' $$,
  'profissional corrige para a semana 0');
select throws_ok(
  $$ select public.update_workout_log(log_id, version, (select value from _sets), current_date, null, -1)
       from _state where name = 'trainer' $$,
  '23514', 'semana fora do mesociclo', 'correção recusa semana negativa');
reset role;

set local role anon;
select lives_ok(
  $$ insert into _state (name, log_id)
     select 'student', (public.submit_workout_session('pgtap-token-0057', '57000000-0000-0000-0000-000000000010',
       (select value from _sets), null, 0, current_date)->>'log_id')::uuid $$,
  'aluno registra na semana 0');
reset role;
update _state set version = (select updated_at from public.workout_logs where id = _state.log_id) where name = 'student';
set local role anon;
select lives_ok(
  $$ update _state set version = (public.update_workout_session_for_link('pgtap-token-0057', log_id, version,
       (select value from _sets), current_date, null, 3)->>'updated_at')::timestamptz where name = 'student' $$,
  'aluno corrige da semana 0 para a 3');
reset role;
select is(
  (select week_number from public.workout_logs where id = (select log_id from _state where name = 'student')),
  3, 'a semana corrigida do aluno fica gravada');

select * from finish();
rollback;
