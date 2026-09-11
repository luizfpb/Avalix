-- Somente PostgreSQL/Supabase descartável, com migrations até a 0037.
-- Fixtures fictícias e chamadas reais sob authenticated/anon; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(13);

select ok(public.app_schema_version() >= '0037',
  'schema inclui a semana do mesociclo pelo histórico');

select has_column('public', 'workout_log_summary', 'first_date',
  'resumo de execução passa a expor a primeira sessão do plano');
select ok(
  (select reloptions @> array['security_invoker=true'] from pg_class
    where oid = 'public.workout_log_summary'::regclass),
  'view continua com security_invoker, então a RLS do chamador vale');
select ok(
  (select prosecdef and proconfig @> array['search_path=""']
     from pg_proc where oid = 'public.get_workout_for_link(text)'::regprocedure),
  'pacote do aluno continua security definer com search_path vazio');
select ok(
  has_function_privilege('anon', 'public.get_workout_for_link(text)', 'execute')
  and has_function_privilege('authenticated', 'public.get_workout_for_link(text)', 'execute'),
  'grants do pacote do aluno permanecem');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
insert into auth.users(id, raw_user_meta_data) values
 ('37000000-0000-0000-0000-000000000001', '{"full_name":"Owner teste"}');
select pg_temp.act('37000000-0000-0000-0000-000000000001', 'aal2');
insert into public.organizations(id, name) values
 ('37000000-0000-0000-0000-000000000002', 'Org teste 0037');
insert into public.org_members(org_id, user_id, role) values
 ('37000000-0000-0000-0000-000000000002', '37000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects(id, org_id, full_name, birth_date, sex) values
 ('37000000-0000-0000-0000-000000000003', '37000000-0000-0000-0000-000000000002', 'Aluno treinando', '1990-01-01', 'F'),
 ('37000000-0000-0000-0000-000000000004', '37000000-0000-0000-0000-000000000002', 'Aluno sem plano', '1990-01-01', 'M');

-- Plano ativo com 3 sessões na semana 2 e uma na 3, mais um plano arquivado
-- cujas sessões não podem vazar para a sugestão do plano vigente.
insert into public.workout_plans
  (id, org_id, subject_id, evaluator_id, name, weeks, status)
values
 ('37000000-0000-0000-0000-000000000010', '37000000-0000-0000-0000-000000000002',
  '37000000-0000-0000-0000-000000000003', '37000000-0000-0000-0000-000000000001',
  'Plano ativo 0037', 8, 'active'),
 ('37000000-0000-0000-0000-000000000011', '37000000-0000-0000-0000-000000000002',
  '37000000-0000-0000-0000-000000000003', '37000000-0000-0000-0000-000000000001',
  'Plano arquivado 0037', 8, 'archived');
insert into public.workout_days (id, org_id, plan_id, label, position) values
 ('37000000-0000-0000-0000-000000000020', '37000000-0000-0000-0000-000000000002',
  '37000000-0000-0000-0000-000000000010', 'A', 0);

insert into public.workout_logs
  (org_id, subject_id, plan_id, day_label, week_number, performed_at)
values
 ('37000000-0000-0000-0000-000000000002', '37000000-0000-0000-0000-000000000003',
  '37000000-0000-0000-0000-000000000010', 'A', 2, date '2026-01-05'),
 ('37000000-0000-0000-0000-000000000002', '37000000-0000-0000-0000-000000000003',
  '37000000-0000-0000-0000-000000000010', 'A', 2, date '2026-01-07'),
 ('37000000-0000-0000-0000-000000000002', '37000000-0000-0000-0000-000000000003',
  '37000000-0000-0000-0000-000000000010', 'A', 2, date '2026-01-09'),
 ('37000000-0000-0000-0000-000000000002', '37000000-0000-0000-0000-000000000003',
  '37000000-0000-0000-0000-000000000010', 'A', 3, date '2026-01-12'),
 ('37000000-0000-0000-0000-000000000002', '37000000-0000-0000-0000-000000000003',
  '37000000-0000-0000-0000-000000000011', 'A', 1, date '2025-11-03');

insert into public.workout_links
  (org_id, subject_id, created_by, token_hash, expires_at)
values
 ('37000000-0000-0000-0000-000000000002', '37000000-0000-0000-0000-000000000003',
  '37000000-0000-0000-0000-000000000001',
  encode(sha256(convert_to('pgtap-token-0037', 'UTF8')), 'hex'), now() + interval '30 days'),
 ('37000000-0000-0000-0000-000000000002', '37000000-0000-0000-0000-000000000004',
  '37000000-0000-0000-0000-000000000001',
  encode(sha256(convert_to('pgtap-token-0037-sem-plano', 'UTF8')), 'hex'), now() + interval '30 days');

set local role authenticated;
select is(
  (select first_date from public.workout_log_summary
    where plan_id = '37000000-0000-0000-0000-000000000010'),
  date '2026-01-05',
  'início real do plano é a primeira sessão registrada, não a criação');
select is(
  (select last_date from public.workout_log_summary
    where plan_id = '37000000-0000-0000-0000-000000000010'),
  date '2026-01-12',
  'última sessão continua sendo reportada como antes');
reset role;

set local role anon;
select is(
  jsonb_array_length(public.get_workout_for_link('pgtap-token-0037') -> 'plan_week_log'),
  4,
  'pacote do aluno traz as sessões do plano ativo, e só as dele');
select is(
  public.get_workout_for_link('pgtap-token-0037') #>> '{plan_week_log,0,performed_at}',
  '2026-01-12',
  'sessões vêm da mais recente para a mais antiga');
select is(
  public.get_workout_for_link('pgtap-token-0037') #>> '{plan_week_log,0,week_number}',
  '3',
  'a semana do último treino é a que a página do aluno vai continuar');
select is(
  public.get_workout_for_link('pgtap-token-0037') #>> '{plan_week_log,3,performed_at}',
  '2026-01-05',
  'a sessão mais antiga do plano ativo fecha a lista');
select is(
  public.get_workout_for_link('pgtap-token-0037-sem-plano') -> 'plan_week_log',
  '[]'::jsonb,
  'aluno sem plano ativo recebe lista vazia, não nulo');
select is(
  public.get_workout_for_link('token-que-nao-existe'),
  null::jsonb,
  'token inválido continua sem devolver pacote');
reset role;

select * from finish();
rollback;
