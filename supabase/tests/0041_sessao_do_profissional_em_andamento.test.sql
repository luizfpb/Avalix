-- Somente PostgreSQL/Supabase descartável, com migrations até a 0041.
-- Fixtures fictícias e chamadas reais sob authenticated; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(13);

select ok(public.app_schema_version() >= '0041',
  'schema inclui o salvamento parcial do profissional');
select ok(
  has_function_privilege('authenticated',
    'public.save_trainer_workout_session(uuid,jsonb,boolean,uuid,timestamptz,text,int,date,text)', 'execute')
  and not has_function_privilege('anon',
    'public.save_trainer_workout_session(uuid,jsonb,boolean,uuid,timestamptz,text,int,date,text)', 'execute'),
  'só o profissional autenticado chama; o link do aluno não');
select ok(
  not (select prosecdef from pg_proc
        where oid = 'public.save_trainer_workout_session(uuid,jsonb,boolean,uuid,timestamptz,text,int,date,text)'::regprocedure),
  'security invoker: RLS e MFA das tabelas valem');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
insert into auth.users(id, raw_user_meta_data) values
 ('41000000-0000-0000-0000-000000000001', '{"full_name":"Owner teste"}');
select pg_temp.act('41000000-0000-0000-0000-000000000001', 'aal2');
insert into public.organizations(id, name) values
 ('41000000-0000-0000-0000-000000000002', 'Org teste 0041');
insert into public.org_members(org_id, user_id, role) values
 ('41000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects(id, org_id, full_name, birth_date, sex) values
 ('41000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000002', 'Aluno 0041', '1990-01-01', 'M');
insert into public.exercises
  (id, org_id, name, primary_muscle, equipment, movement_pattern)
values
 ('41000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000002',
  'Exercício pgTAP 0041', 'chest', 'barbell', 'horizontal_push');
insert into public.workout_plans
  (id, org_id, subject_id, evaluator_id, name, weeks, status)
values
 ('41000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000002',
  '41000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000001',
  'Plano 0041', 4, 'active');

create temporary table _p (uma jsonb, duas jsonb);
insert into _p values (
  '[{"exercise_id":"41000000-0000-0000-0000-000000000005","set_number":1,"weight_kg":40,"reps":10}]',
  '[{"exercise_id":"41000000-0000-0000-0000-000000000005","set_number":1,"weight_kg":40,"reps":10},
    {"exercise_id":"41000000-0000-0000-0000-000000000005","set_number":2,"weight_kg":40,"reps":9}]'
);
grant select on _p to authenticated;

set local role authenticated;
select lives_ok(
  $$ select public.save_trainer_workout_session(
       '41000000-0000-0000-0000-000000000010', uma, true,
       p_day_label => null, p_week_number => 1, p_notes => 'pgtap 0041')
     from _p $$,
  'profissional salva a sessão no meio, sem concluir');
select is(
  (select in_progress from public.workout_logs where notes = 'pgtap 0041'),
  true,
  'a sessão fica em andamento: não conta na adesão nem fecha a semana');

select lives_ok(
  $$ select public.save_trainer_workout_session(
       '41000000-0000-0000-0000-000000000010', duas, true,
       p_log => (select id from public.workout_logs where notes = 'pgtap 0041'),
       p_expected_updated_at => (select updated_at from public.workout_logs where notes = 'pgtap 0041'),
       p_week_number => 1, p_notes => 'pgtap 0041')
     from _p $$,
  'continuar a mesma sessão depois, com mais séries');
select is(
  (select count(*)::int from public.workout_log_sets s
     join public.workout_logs l on l.id = s.log_id where l.notes = 'pgtap 0041'),
  2,
  'as séries são regravadas, não duplicadas');

select throws_ok(
  $$ select public.save_trainer_workout_session(
       '41000000-0000-0000-0000-000000000010', duas, true,
       p_log => (select id from public.workout_logs where notes = 'pgtap 0041'),
       p_expected_updated_at => '2000-01-01T00:00:00Z', p_notes => 'pgtap 0041')
     from _p $$,
  '40001', null,
  'versão antiga (outro aparelho salvou antes) é recusada');

select lives_ok(
  $$ select public.save_trainer_workout_session(
       '41000000-0000-0000-0000-000000000010', duas, false,
       p_log => (select id from public.workout_logs where notes = 'pgtap 0041'),
       p_expected_updated_at => (select updated_at from public.workout_logs where notes = 'pgtap 0041'),
       p_week_number => 1, p_notes => 'pgtap 0041')
     from _p $$,
  'registrar conclui a sessão que estava em andamento');
select is(
  (select in_progress from public.workout_logs where notes = 'pgtap 0041'),
  false,
  'depois de concluída ela conta como treino feito');
select throws_ok(
  $$ select public.save_trainer_workout_session(
       '41000000-0000-0000-0000-000000000010', uma, true,
       p_log => (select id from public.workout_logs where notes = 'pgtap 0041'),
       p_expected_updated_at => (select updated_at from public.workout_logs where notes = 'pgtap 0041'),
       p_notes => 'pgtap 0041')
     from _p $$,
  'esta sessao ja foi concluida; corrija pelo historico de sessoes',
  'sessão concluída não volta a ficar em andamento por aqui');

select throws_ok(
  $$ select public.save_trainer_workout_session(
       '41000000-0000-0000-0000-000000000010', '[]'::jsonb, true) $$,
  'series obrigatorias',
  'sem nenhuma série não há o que salvar');
select is(
  (select source from public.workout_logs where notes = 'pgtap 0041'),
  'trainer',
  'a autoria continua sendo do profissional');
reset role;

select * from finish();
rollback;
