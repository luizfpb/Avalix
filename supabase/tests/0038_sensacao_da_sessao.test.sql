-- Somente PostgreSQL/Supabase descartável, com migrations até a 0038.
-- Fixtures fictícias e chamadas reais sob anon; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(14);

select ok(public.app_schema_version() >= '0038',
  'schema inclui a sensação da sessão');
select has_column('public', 'workout_logs', 'feel',
  'sessão passa a guardar a sensação relatada pelo aluno');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_workout_session'),
  1,
  'envio do aluno não virou sobrecarga: o PostgREST continua sem ambiguidade');
-- Pela função única com esse nome (checada acima), e não pela assinatura da
-- 0038: a 0039 acrescenta p_in_progress e a garantia continua valendo.
select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_workout_session'),
  'envio continua security definer com search_path vazio');
select ok(
  (select bool_and(has_function_privilege('anon', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_workout_session')
  and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'submit_workout_session_0027_internal'
       and has_function_privilege('anon', p.oid, 'execute')),
  'grants: o aluno chama o wrapper, nunca o helper interno');

-- O cadastro do avaliado exige um avaliador autenticado (trigger b2): sem as
-- claims, a fixture parava antes de chegar ao que este arquivo testa.
select set_config('request.jwt.claim.sub', '38000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"38000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
insert into auth.users(id, raw_user_meta_data) values
 ('38000000-0000-0000-0000-000000000001', '{"full_name":"Owner teste"}');
insert into public.organizations(id, name) values
 ('38000000-0000-0000-0000-000000000002', 'Org teste 0038');
insert into public.org_members(org_id, user_id, role) values
 ('38000000-0000-0000-0000-000000000002', '38000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects(id, org_id, full_name, birth_date, sex) values
 ('38000000-0000-0000-0000-000000000003', '38000000-0000-0000-0000-000000000002', 'Aluno 0038', '1990-01-01', 'F');
insert into public.exercises
  (id, org_id, name, primary_muscle, equipment, movement_pattern)
values
 ('38000000-0000-0000-0000-000000000005', '38000000-0000-0000-0000-000000000002',
  'Exercício pgTAP 0038', 'chest', 'barbell', 'horizontal_push');
insert into public.workout_plans
  (id, org_id, subject_id, evaluator_id, name, weeks, status)
values
 ('38000000-0000-0000-0000-000000000010', '38000000-0000-0000-0000-000000000002',
  '38000000-0000-0000-0000-000000000003', '38000000-0000-0000-0000-000000000001',
  'Plano ativo 0038', 4, 'active');
insert into public.workout_days (id, org_id, plan_id, label, position) values
 ('38000000-0000-0000-0000-000000000020', '38000000-0000-0000-0000-000000000002',
  '38000000-0000-0000-0000-000000000010', 'A', 0);
insert into public.workout_exercises
  (org_id, day_id, exercise_id, position, sets, reps)
values
 ('38000000-0000-0000-0000-000000000002', '38000000-0000-0000-0000-000000000020',
  '38000000-0000-0000-0000-000000000005', 0, 3, '8-12');
insert into public.workout_links
  (org_id, subject_id, created_by, token_hash, expires_at)
values
 ('38000000-0000-0000-0000-000000000002', '38000000-0000-0000-0000-000000000003',
  '38000000-0000-0000-0000-000000000001',
  encode(sha256(convert_to('pgtap-token-0038', 'UTF8')), 'hex'), now() + interval '30 days');

create temporary table _payload (sets jsonb not null);
insert into _payload values (
  '[{"exercise_id":"38000000-0000-0000-0000-000000000005","set_number":1,"weight_kg":40,"reps":10,"rir":2}]'
);
-- A tabela temporária pertence a quem a criou; o papel anônimo precisa ler.
grant select on _payload to anon, authenticated;

set local role anon;
select lives_ok(
  $$ select public.submit_workout_session(
       'pgtap-token-0038', '38000000-0000-0000-0000-000000000101', sets,
       'A', 1, current_date, 'foi puxado', null, 1, 1
     ) from _payload $$,
  'aluno conclui o treino informando a sensação');
select throws_ok(
  $$ select public.submit_workout_session(
       'pgtap-token-0038', '38000000-0000-0000-0000-000000000102', sets,
       'A', 1, current_date, null, null, 1, 4
     ) from _payload $$,
  'sensacao da sessao invalida',
  'sensação fora de 1 a 3 é recusada antes de qualquer escrita');
reset role;

-- Leitura da tabela fora do papel anônimo: o aluno nunca lê workout_logs
-- direto (não há policy para anon), só pelas RPCs do link.
select is(
  (select feel from public.workout_logs where client_ref = '38000000-0000-0000-0000-000000000101'),
  1::smallint,
  'sensação fica gravada na sessão');
select is(
  (select count(*)::int from public.workout_logs where client_ref = '38000000-0000-0000-0000-000000000102'),
  0,
  'a sessão recusada não deixou rastro');

-- Reenvio sem sensação limpa o campo, como já acontece com a observação: o
-- payload da revisão nova é a sessão inteira, e não um remendo sobre a antiga.
set local role anon;
select lives_ok(
  $$ select public.submit_workout_session(
       'pgtap-token-0038', '38000000-0000-0000-0000-000000000101', sets,
       'A', 1, current_date, 'foi puxado', null, 2
     ) from _payload $$,
  'revisão seguinte da mesma sessão é aceita');
reset role;
select is(
  (select feel from public.workout_logs where client_ref = '38000000-0000-0000-0000-000000000101'),
  null::smallint,
  'sem sensação no payload, a sessão fica sem sensação');

set local role anon;
select lives_ok(
  $$ select public.submit_workout_session(
       'pgtap-token-0038', '38000000-0000-0000-0000-000000000103', sets,
       'A', 1, current_date, null, null, 1, 3
     ) from _payload $$,
  'nova sessão registrada com sensação boa');
reset role;
-- Pelo id, e não pela posição: as sessões desta transação têm o mesmo
-- created_at (now() é fixo), e o desempate por UUID aleatório tornava a
-- "mais recente" uma loteria.
select is(
  (select item ->> 'feel'
     from jsonb_array_elements(
            public.get_workout_history_page_for_link('pgtap-token-0038', 30) -> 'items') item
    where (item ->> 'id')::uuid = (select id from public.workout_logs
                                    where client_ref = '38000000-0000-0000-0000-000000000103')),
  '3',
  'histórico do aluno devolve a sensação da sessão');

select is(
  (select public.update_workout_session_for_link(
            'pgtap-token-0038', l.id, l.updated_at, p.sets, l.performed_at, 'corrigido')
       from public.workout_logs l, _payload p
      where l.client_ref = '38000000-0000-0000-0000-000000000103') ->> 'feel',
  '3',
  'corrigir a sessão não apaga nem esconde a sensação já relatada');

select * from finish();
rollback;
