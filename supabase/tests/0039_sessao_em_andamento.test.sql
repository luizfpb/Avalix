-- Somente PostgreSQL/Supabase descartável, com migrations até a 0039.
-- Fixtures fictícias e chamadas reais sob anon/authenticated; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(24);

select ok(public.app_schema_version() >= '0039',
  'schema inclui a sessão em andamento');
select has_column('public', 'workout_logs', 'in_progress',
  'sessão passa a dizer se ficou em andamento');
select col_not_null('public', 'workout_logs', 'in_progress',
  'em andamento nunca é desconhecido');
select col_default_is('public', 'workout_logs', 'in_progress', 'false',
  'registros antigos e do profissional continuam concluídos');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_workout_session'),
  1,
  'envio do aluno não virou sobrecarga');
select ok(
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
    where oid = 'public.submit_workout_session(text,uuid,jsonb,text,int,date,text,uuid,int,int,boolean)'::regprocedure),
  'envio continua security definer com search_path vazio');
select ok(
  has_function_privilege('anon',
    'public.submit_workout_session(text,uuid,jsonb,text,int,date,text,uuid,int,int,boolean)', 'execute')
  and not has_function_privilege('anon',
    'public.submit_workout_session_0027_internal(text,uuid,jsonb,text,int,date,text,uuid,int,boolean)', 'execute'),
  'grants: o aluno chama o wrapper, nunca o helper interno');
select ok(
  (select reloptions @> array['security_invoker=true'] from pg_class
    where oid = 'public.workout_log_summary'::regclass),
  'resumo continua com security_invoker');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
insert into auth.users(id, raw_user_meta_data) values
 ('39000000-0000-0000-0000-000000000001', '{"full_name":"Owner teste"}');
select pg_temp.act('39000000-0000-0000-0000-000000000001', 'aal2');
insert into public.organizations(id, name) values
 ('39000000-0000-0000-0000-000000000002', 'Org teste 0039');
insert into public.org_members(org_id, user_id, role) values
 ('39000000-0000-0000-0000-000000000002', '39000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects(id, org_id, full_name, birth_date, sex) values
 ('39000000-0000-0000-0000-000000000003', '39000000-0000-0000-0000-000000000002', 'Aluno 0039', '1990-01-01', 'F');
insert into public.exercises
  (id, org_id, name, primary_muscle, equipment, movement_pattern)
values
 ('39000000-0000-0000-0000-000000000005', '39000000-0000-0000-0000-000000000002',
  'Exercício pgTAP 0039', 'chest', 'barbell', 'horizontal_push');
insert into public.workout_plans
  (id, org_id, subject_id, evaluator_id, name, weeks, status)
values
 ('39000000-0000-0000-0000-000000000010', '39000000-0000-0000-0000-000000000002',
  '39000000-0000-0000-0000-000000000003', '39000000-0000-0000-0000-000000000001',
  'Plano ativo 0039', 4, 'active');
insert into public.workout_days (id, org_id, plan_id, label, position) values
 ('39000000-0000-0000-0000-000000000020', '39000000-0000-0000-0000-000000000002',
  '39000000-0000-0000-0000-000000000010', 'A', 0);
insert into public.workout_exercises
  (org_id, day_id, exercise_id, position, sets, reps)
values
 ('39000000-0000-0000-0000-000000000002', '39000000-0000-0000-0000-000000000020',
  '39000000-0000-0000-0000-000000000005', 0, 3, '8-12');
insert into public.workout_links
  (org_id, subject_id, created_by, token_hash, expires_at)
values
 ('39000000-0000-0000-0000-000000000002', '39000000-0000-0000-0000-000000000003',
  '39000000-0000-0000-0000-000000000001',
  encode(sha256(convert_to('pgtap-token-0039', 'UTF8')), 'hex'), now() + interval '30 days');

create temporary table _payload (sets jsonb not null);
insert into _payload values (
  '[{"exercise_id":"39000000-0000-0000-0000-000000000005","set_number":1,"weight_kg":40,"reps":10,"rir":2}]'
);
grant select on _payload to anon, authenticated;

-- "Parar por aqui e continuar depois": a sessão existe no servidor, mas não é
-- um treino feito.
set local role anon;
select lives_ok(
  $$ select public.submit_workout_session(
       'pgtap-token-0039', '39000000-0000-0000-0000-000000000101', sets,
       'A', 2, current_date, null, null, 1, null, true
     ) from _payload $$,
  'aluno salva a sessão para continuar depois');
select is(
  (public.get_workout_for_link('pgtap-token-0039') ->> 'current_plan_sessions')::int,
  0,
  'sessão em andamento não avança a divisão sugerida');
select is(
  jsonb_array_length(public.get_workout_for_link('pgtap-token-0039') -> 'plan_week_log'),
  0,
  'nem entra na contagem da semana do mesociclo');
select is(
  public.get_workout_history_page_for_link('pgtap-token-0039', 30) #>> '{items,0,in_progress}',
  'true',
  'o histórico do aluno diz que a sessão ficou em andamento');
reset role;
select is(
  (select in_progress from public.workout_logs
    where client_ref = '39000000-0000-0000-0000-000000000101'),
  true,
  'a sessão fica gravada como em andamento');

set local role anon;
select lives_ok(
  $$ select public.submit_workout_session(
       'pgtap-token-0039', '39000000-0000-0000-0000-000000000101', sets,
       'A', 2, current_date, null, null, 2, null, false
     ) from _payload $$,
  'concluir a mesma sessão, com revisão maior');
select is(
  (public.get_workout_for_link('pgtap-token-0039') ->> 'current_plan_sessions')::int,
  1,
  'a sessão concluída passa a contar');
select is(
  public.get_workout_for_link('pgtap-token-0039') #>> '{plan_week_log,0,client_ref}',
  '39000000-0000-0000-0000-000000000101',
  'o resumo semanal traz a identidade da sessão, para a tela não contar duas vezes');
-- Cliente publicado antes da 0039 não manda p_in_progress: o default conclui.
select lives_ok(
  $$ select public.submit_workout_session(
       'pgtap-token-0039', '39000000-0000-0000-0000-000000000102', sets,
       'A', 2, current_date, null, null, 1
     ) from _payload $$,
  'chamada sem o argumento novo continua valendo');
select lives_ok(
  $$ select public.submit_workout_session(
       'pgtap-token-0039', '39000000-0000-0000-0000-000000000103', sets,
       'A', 2, current_date, null, null, 1, null, true
     ) from _payload $$,
  'outra sessão fica em andamento');
reset role;
select is(
  (select in_progress from public.workout_logs
    where client_ref = '39000000-0000-0000-0000-000000000102'),
  false,
  'sem o argumento, a sessão é gravada como concluída');

set local role authenticated;
select is(
  (select log_count from public.workout_log_summary
    where plan_id = '39000000-0000-0000-0000-000000000010'),
  2,
  'a adesão da carteira conta só as sessões concluídas');
select is(
  (select array_length(recent_dates, 1) from public.workout_log_summary
    where plan_id = '39000000-0000-0000-0000-000000000010'),
  2,
  'as datas recentes também são só das concluídas');
reset role;

-- Semana validada em qualquer caminho de escrita, e só quando ela é gravada.
select throws_ok(
  $$ insert into public.workout_logs (org_id, subject_id, plan_id, week_number, performed_at)
     values ('39000000-0000-0000-0000-000000000002', '39000000-0000-0000-0000-000000000003',
             '39000000-0000-0000-0000-000000000010', 5, current_date) $$,
  '23514',
  'semana fora do mesociclo',
  'registro com semana além do mesociclo é recusado');
select lives_ok(
  $$ insert into public.workout_logs (org_id, subject_id, plan_id, week_number, performed_at, notes)
     values ('39000000-0000-0000-0000-000000000002', '39000000-0000-0000-0000-000000000003',
             '39000000-0000-0000-0000-000000000010', 4, current_date, 'legado') $$,
  'a última semana do mesociclo continua aceita');
update public.workout_plans set weeks = 2 where id = '39000000-0000-0000-0000-000000000010';
select lives_ok(
  $$ update public.workout_logs set notes = 'ajuste' where notes = 'legado' $$,
  'registro antigo além do novo tamanho do plano continua editável');

select * from finish();
rollback;
