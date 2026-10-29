-- Somente PostgreSQL/Supabase descartável, com migrations até a 0055.
-- Fixtures fictícias e chamadas reais sob anon e authenticated; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(12);

select ok(public.app_schema_version() >= '0055', 'schema inclui a semana na correção');
select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('update_workout_log', 'update_workout_session_for_link')) = 2,
  'sem sobrecarga: cada correção tem uma assinatura só');
select ok(
  not has_function_privilege('anon', 'public.update_workout_log(uuid,timestamptz,jsonb,date,text,int)', 'execute')
  and has_function_privilege('authenticated', 'public.update_workout_log(uuid,timestamptz,jsonb,date,text,int)', 'execute')
  and not (select prosecdef from pg_proc where oid = 'public.update_workout_log(uuid,timestamptz,jsonb,date,text,int)'::regprocedure)
  and has_function_privilege('anon', 'public.update_workout_session_for_link(text,uuid,timestamptz,jsonb,date,text,int)', 'execute'),
  'grants e invoker preservados na assinatura nova');

select set_config('request.jwt.claim.sub', '55000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"55000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
insert into auth.users (id, raw_user_meta_data) values
  ('55000000-0000-0000-0000-000000000001', '{"full_name":"Treinador pgTAP 0055"}');
insert into public.organizations (id, name) values
  ('55000000-0000-0000-0000-000000000002', 'Org pgTAP 0055');
insert into public.org_members (org_id, user_id, role) values
  ('55000000-0000-0000-0000-000000000002', '55000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects (id, org_id, evaluator_id, full_name, birth_date, sex) values
  ('55000000-0000-0000-0000-000000000003', '55000000-0000-0000-0000-000000000002',
   '55000000-0000-0000-0000-000000000001', 'Aluna pgTAP 0055', '1990-01-01', 'F');
insert into public.exercises (id, org_id, name, primary_muscle, equipment, movement_pattern) values
  ('55000000-0000-0000-0000-000000000004', '55000000-0000-0000-0000-000000000002',
   'Exercício pgTAP 0055', 'chest', 'barbell', 'horizontal_push');
insert into public.workout_plans (id, org_id, subject_id, evaluator_id, name, weeks, status) values
  ('55000000-0000-0000-0000-000000000005', '55000000-0000-0000-0000-000000000002',
   '55000000-0000-0000-0000-000000000003', '55000000-0000-0000-0000-000000000001', 'Plano pgTAP 0055', 4, 'active');
insert into public.workout_links (org_id, subject_id, created_by, token_hash, expires_at) values
  ('55000000-0000-0000-0000-000000000002', '55000000-0000-0000-0000-000000000003',
   '55000000-0000-0000-0000-000000000001', encode(sha256(convert_to('pgtap-token-0055', 'UTF8')), 'hex'), now() + interval '30 days');

create temporary table _sets (value jsonb not null);
insert into _sets values
  ('[{"exercise_id":"55000000-0000-0000-0000-000000000004","set_number":1,"weight_kg":40,"reps":10,"rir":1}]');
create temporary table _state (name text primary key, log_id uuid, version timestamptz);
grant select on _sets to anon, authenticated;
grant select, insert, update on _state to anon, authenticated;

set local role authenticated;
insert into _state (name, log_id, version)
select 'trainer', l.id, l.updated_at from _sets s
cross join lateral public.create_workout_log('55000000-0000-0000-0000-000000000005',
  s.value, 'A', 3, current_date, null) l;
reset role;
-- Sessão do aluno, e uma legada numa semana que o plano não tem mais (o
-- gatilho só confere a semana quando ela é gravada).
insert into public.workout_logs (id, plan_id, source, client_ref, week_number, performed_at) values
  ('55000000-0000-0000-0000-000000000010', '55000000-0000-0000-0000-000000000005',
   'student', '55000000-0000-0000-0000-000000000011', 2, current_date - 1);
alter table public.workout_logs disable trigger workout_logs_b2_week;
insert into public.workout_logs (id, plan_id, week_number, performed_at) values
  ('55000000-0000-0000-0000-000000000012', '55000000-0000-0000-0000-000000000005', 6, current_date - 30);
alter table public.workout_logs enable trigger workout_logs_b2_week;
insert into public.workout_log_sets (log_id, exercise_id, set_number, weight_kg, reps) values
  ('55000000-0000-0000-0000-000000000010', '55000000-0000-0000-0000-000000000004', 1, 30, 12),
  ('55000000-0000-0000-0000-000000000012', '55000000-0000-0000-0000-000000000004', 1, 30, 12);
insert into _state (name, log_id, version)
select case id when '55000000-0000-0000-0000-000000000010' then 'student' else 'legacy' end, id, updated_at
  from public.workout_logs where id in ('55000000-0000-0000-0000-000000000010', '55000000-0000-0000-0000-000000000012');

set local role authenticated;
select throws_ok(
  $$ select public.update_workout_log(log_id, version, (select value from _sets), current_date, null, 5)
       from _state where name = 'trainer' $$,
  '23514', 'semana fora do mesociclo', 'profissional não move a sessão para além do mesociclo');
select lives_ok(
  $$ update _state set version = (public.update_workout_log(log_id, version, (select value from _sets), current_date, null, 2)).updated_at
      where name = 'trainer' $$,
  'profissional corrige a semana');
select lives_ok(
  $$ update _state set version = (public.update_workout_log(log_id, version, (select value from _sets), current_date, 'só a nota')).updated_at
      where name = 'trainer' $$,
  'sem semana no envio (app antigo) a correção continua valendo');
select lives_ok(
  $$ select public.update_workout_log(log_id, version, (select value from _sets), current_date - 30, 'nota', 6)
       from _state where name = 'legacy' $$,
  'sessão antiga numa semana que o plano não tem mais continua corrigível');
reset role;
select is(
  (select week_number from public.workout_logs where id = (select log_id from _state where name = 'trainer')),
  2, 'a semana corrigida fica gravada e a correção sem semana não a apaga');
select is(
  (select day_label from public.workout_logs where id = (select log_id from _state where name = 'trainer')),
  'A', 'a divisão continua a original');

set local role anon;
select throws_ok(
  $$ select public.update_workout_session_for_link('pgtap-token-0055', log_id, version, (select value from _sets), current_date - 1, null, 0)
       from _state where name = 'student' $$,
  '23514', 'semana fora do mesociclo', 'aluno não grava semana zero');
select lives_ok(
  $$ update _state set version = (public.update_workout_session_for_link('pgtap-token-0055', log_id, version,
       (select value from _sets), current_date - 1, null, 4)->>'updated_at')::timestamptz where name = 'student' $$,
  'aluno corrige a semana');
reset role;
select is(
  (select week_number from public.workout_logs where id = '55000000-0000-0000-0000-000000000010'),
  4, 'a semana do aluno fica gravada');

select * from finish();
rollback;
