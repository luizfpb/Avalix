-- Somente PostgreSQL/Supabase descartável, com migrations até a 0046.
-- Fixtures fictícias e chamadas reais sob anon e authenticated; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(13);

select ok(public.app_schema_version() >= '0046',
  'schema inclui a ordem dos exercícios na sessão');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
insert into auth.users(id, raw_user_meta_data) values
 ('46000000-0000-0000-0000-000000000001', '{"full_name":"Owner 0046"}');
select pg_temp.act('46000000-0000-0000-0000-000000000001', 'aal2');
insert into public.organizations(id, name) values ('46000000-0000-0000-0000-000000000002', 'Org pgTAP 0046');
insert into public.org_members(org_id, user_id, role) values
 ('46000000-0000-0000-0000-000000000002', '46000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects(id, org_id, full_name, birth_date, sex) values
 ('46000000-0000-0000-0000-000000000003', '46000000-0000-0000-0000-000000000002',
  'Aluno 0046', '1990-01-01', 'M');
-- A ordem alfabética (Agachamento, Remada, Supino) é diferente da ordem feita.
insert into public.exercises (id, org_id, name, primary_muscle, equipment, movement_pattern) values
 ('46000000-0000-0000-0000-00000000000a', '46000000-0000-0000-0000-000000000002',
  'Supino 0046', 'chest', 'barbell', 'horizontal_push'),
 ('46000000-0000-0000-0000-00000000000b', '46000000-0000-0000-0000-000000000002',
  'Agachamento 0046', 'quads', 'barbell', 'squat'),
 ('46000000-0000-0000-0000-00000000000c', '46000000-0000-0000-0000-000000000002',
  'Remada 0046', 'upper_back', 'barbell', 'horizontal_pull');
insert into public.workout_plans (id, org_id, subject_id, evaluator_id, name, weeks, status) values
 ('46000000-0000-0000-0000-000000000010', '46000000-0000-0000-0000-000000000002',
  '46000000-0000-0000-0000-000000000003', '46000000-0000-0000-0000-000000000001',
  'Plano 0046', 4, 'active');
insert into public.workout_links (subject_id, created_by, token_hash, expires_at)
values ('46000000-0000-0000-0000-000000000003', '46000000-0000-0000-0000-000000000001',
        encode(sha256(convert_to(repeat('o', 43), 'UTF8')), 'hex'), now() + interval '30 days');

create function pg_temp.serie(p_ex text, p_n int) returns jsonb language sql as $$
  select jsonb_build_object('exercise_id', '46000000-0000-0000-0000-00000000000' || p_ex,
                            'set_number', p_n, 'weight_kg', 20, 'reps', 10)
$$;
-- Nomes das séries de uma sessão na ordem gravada.
create function pg_temp.ordem(p_log uuid) returns text language sql as $$
  select string_agg(split_part(x.name, ' ', 1) || s.set_number, ' ' order by s.entry_order)
    from public.workout_log_sets s join public.exercises x on x.id = s.exercise_id
   where s.log_id = p_log
$$;
-- Nomes das séries de uma sessão como o histórico do aluno devolve.
create function pg_temp.lidas(p_sets jsonb) returns text language sql as $$
  select string_agg(split_part(e->>'exercise_name', ' ', 1) || (e->>'set_number'), ' ' order by i)
    from jsonb_array_elements(p_sets) with ordinality t(e, i)
$$;

-- =====================================================================
-- Sessão do profissional (security invoker: o default usa a sequência)
-- =====================================================================
create temporary table _ids (nome text primary key, id uuid, versao timestamptz);
grant all on _ids to anon, authenticated;

set local role authenticated;
select lives_ok(
  $$ insert into _ids select 'prof', id, updated_at from public.create_workout_log(
       '46000000-0000-0000-0000-000000000010',
       jsonb_build_array(pg_temp.serie('a', 1), pg_temp.serie('a', 2),
                         pg_temp.serie('b', 1), pg_temp.serie('c', 1))) $$,
  'o profissional registra a sessão como authenticated');
reset role;
select is(pg_temp.ordem((select id from _ids where nome = 'prof')),
  'Supino1 Supino2 Agachamento1 Remada1',
  'a sessão guarda a ordem em que os exercícios foram enviados');

set local role authenticated;
select lives_ok(
  $$ select public.update_workout_log(
       (select id from _ids where nome = 'prof'), (select versao from _ids where nome = 'prof'),
       jsonb_build_array(pg_temp.serie('c', 1), pg_temp.serie('a', 1),
                         pg_temp.serie('a', 2), pg_temp.serie('b', 1)),
       current_date, null) $$,
  'o profissional corrige a sessão mudando a ordem');
reset role;
select is(pg_temp.ordem((select id from _ids where nome = 'prof')),
  'Remada1 Supino1 Supino2 Agachamento1',
  'a correção regrava a ordem');

-- =====================================================================
-- Histórico do aluno
-- =====================================================================
select pg_temp.act(null, 'aal1');
set local role anon;
create temporary table _hist1 as
  select public.get_workout_history_page_for_link(repeat('o', 43)) h;
reset role;
select is(pg_temp.lidas((select h->'items'->0->'sets' from _hist1)),
  'Remada1 Supino1 Supino2 Agachamento1',
  'o histórico do aluno mostra a sessão do profissional na ordem feita, não na alfabética');

set local role anon;
select lives_ok(
  $$ select public.submit_workout_session(repeat('o', 43),
       '46000000-0000-0000-0000-0000000000b1',
       jsonb_build_array(pg_temp.serie('b', 1), pg_temp.serie('a', 1), pg_temp.serie('c', 1)),
       p_plan => '46000000-0000-0000-0000-000000000010', p_client_revision => 1) $$,
  'o aluno registra a própria sessão');
reset role;
insert into _ids select 'aluno', id, updated_at from public.workout_logs
 where client_ref = '46000000-0000-0000-0000-0000000000b1';
select is(pg_temp.ordem((select id from _ids where nome = 'aluno')),
  'Agachamento1 Supino1 Remada1',
  'a sessão do aluno também guarda a ordem');

set local role anon;
create temporary table _corr as
  select public.update_workout_session_for_link(repeat('o', 43),
           (select id from _ids where nome = 'aluno'), (select versao from _ids where nome = 'aluno'),
           jsonb_build_array(pg_temp.serie('c', 1), pg_temp.serie('b', 1), pg_temp.serie('a', 1)),
           current_date) r;
reset role;
select is(pg_temp.lidas((select r->'sets' from _corr)),
  'Remada1 Agachamento1 Supino1',
  'a correção pelo link devolve as séries na nova ordem');
select is(pg_temp.ordem((select id from _ids where nome = 'aluno')),
  'Remada1 Agachamento1 Supino1',
  'e grava a nova ordem');

-- =====================================================================
-- Sessão anterior à 0046: sem ordem, o histórico lê como antes
-- =====================================================================
update public.workout_log_sets set entry_order = null
 where log_id = (select id from _ids where nome = 'prof');
set local role anon;
create temporary table _hist2 as
  select public.get_workout_history_page_for_link(repeat('o', 43)) h;
reset role;
select is(
  (select pg_temp.lidas(i->'sets') from _hist2, jsonb_array_elements(h->'items') i
    where (i->>'id')::uuid = (select id from _ids where nome = 'prof')),
  'Agachamento1 Remada1 Supino1 Supino2',
  'sessão sem entry_order continua em ordem alfabética');

select ok(
  not has_sequence_privilege('anon', 'public.workout_log_sets_entry_order_seq', 'usage'),
  'anon não usa a sequência diretamente');
select ok(
  has_sequence_privilege('authenticated', 'public.workout_log_sets_entry_order_seq', 'usage'),
  'authenticated usa a sequência (as RPCs do profissional são security invoker)');

select * from finish();
rollback;
