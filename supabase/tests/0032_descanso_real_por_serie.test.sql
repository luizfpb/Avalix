-- Descanso realizado: escrita atômica, compatibilidade e histórico.
-- Executar somente no Supabase local/CI descartável: npx supabase test db
begin;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end;
$$;
set local search_path = public, extensions, pg_catalog;

select plan(24);

select col_type_is('public', 'workout_log_sets', 'rest_seconds', 'integer',
  'descanso realizado é inteiro em segundos');
select col_is_null('public', 'workout_log_sets', 'rest_seconds',
  'descanso não informado continua NULL');
select ok(
  not has_function_privilege('anon',
    'public.submit_workout_session_0027_internal(text,uuid,jsonb,text,int,date,text,uuid)', 'execute')
  and not has_function_privilege('authenticated',
    'public.submit_workout_session_0027_internal(text,uuid,jsonb,text,int,date,text,uuid)', 'execute'),
  'implementação interna continua inacessível aos clientes'
);
select ok(
  not (select prosecdef from pg_proc where oid =
    'public.create_workout_log(uuid,jsonb,text,int,date,text)'::regprocedure)
  and not has_function_privilege('anon',
    'public.create_workout_log(uuid,jsonb,text,int,date,text)', 'execute'),
  'escrita profissional mantém RLS e bloqueio de anon'
);

select set_config('request.jwt.claim.sub', '32000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"32000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

insert into auth.users (id, raw_user_meta_data) values
  ('32000000-0000-0000-0000-000000000001', '{"full_name":"Treinador pgTAP 0032"}');
insert into public.organizations (id, name) values
  ('32000000-0000-0000-0000-000000000002', 'Org pgTAP 0032');
insert into public.org_members (org_id, user_id, role) values
  ('32000000-0000-0000-0000-000000000002',
   '32000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects (id, org_id, evaluator_id, full_name, birth_date, sex) values
  ('32000000-0000-0000-0000-000000000003',
   '32000000-0000-0000-0000-000000000002',
   '32000000-0000-0000-0000-000000000001', 'Aluna pgTAP 0032', '1990-01-01', 'F');
insert into public.exercises (id, org_id, name, primary_muscle, equipment, movement_pattern) values
  ('32000000-0000-0000-0000-000000000004',
   '32000000-0000-0000-0000-000000000002',
   'Exercício pgTAP 0032', 'chest', 'barbell', 'horizontal_push');
insert into public.workout_plans
  (id, org_id, subject_id, evaluator_id, name, weeks, status) values
  ('32000000-0000-0000-0000-000000000005',
   '32000000-0000-0000-0000-000000000002',
   '32000000-0000-0000-0000-000000000003',
   '32000000-0000-0000-0000-000000000001', 'Plano pgTAP 0032', 4, 'active');
insert into public.workout_links (org_id, subject_id, created_by, token_hash, expires_at) values
  ('32000000-0000-0000-0000-000000000002',
   '32000000-0000-0000-0000-000000000003',
   '32000000-0000-0000-0000-000000000001',
   encode(sha256(convert_to('pgtap-token-0032', 'UTF8')), 'hex'), now() + interval '30 days');

create temporary table _sets (value jsonb not null);
insert into _sets values
  ('[{"exercise_id":"32000000-0000-0000-0000-000000000004","set_number":1,"weight_kg":40,"reps":10,"rir":2,"rest_seconds":90}]');

select lives_ok(
  $$ select public.create_workout_log('32000000-0000-0000-0000-000000000005',
       value, null, 1, current_date - 1, 'Com descanso') from _sets $$,
  'profissional grava descanso junto da sessão'
);
select is(
  (select s.rest_seconds from public.workout_log_sets s
    join public.workout_logs l on l.id = s.log_id
    where l.plan_id = '32000000-0000-0000-0000-000000000005' and l.notes = 'Com descanso'),
  90, 'valor profissional é persistido'
);

select lives_ok(
  $$ select public.create_workout_log('32000000-0000-0000-0000-000000000005',
       jsonb_build_array((value->0) - 'rest_seconds'), null, 1, current_date - 1, 'Legado') from _sets $$,
  'cliente antigo continua gravando sem descanso'
);
select is(
  (select s.rest_seconds from public.workout_log_sets s
    join public.workout_logs l on l.id = s.log_id
    where l.plan_id = '32000000-0000-0000-0000-000000000005' and l.notes = 'Legado'),
  null::integer, 'ausência não vira zero nem descanso prescrito'
);

select lives_ok(
  $$ select public.submit_workout_session('pgtap-token-0032',
       '32000000-0000-0000-0000-000000000101', value, null, 1, current_date, null,
       '32000000-0000-0000-0000-000000000005', 2) from _sets $$,
  'aluno grava descanso pela fachada com controle de revisão'
);
select is(
  (select s.rest_seconds from public.workout_log_sets s
    join public.workout_logs l on l.id = s.log_id
    where l.client_ref = '32000000-0000-0000-0000-000000000101'),
  90, 'valor do aluno é persistido'
);
select is(
  (public.get_workout_history_page_for_link('pgtap-token-0032')->'items'->0->'sets'->0->>'rest_seconds')::int,
  90, 'histórico paginado devolve descanso realizado'
);
select is(
  (public.get_workout_history_for_link('pgtap-token-0032')->0->'sets'->0->>'rest_seconds')::int,
  90, 'histórico anterior continua compatível e devolve descanso'
);
select is(
  (app.workout_last_sets('32000000-0000-0000-0000-000000000003')->0->>'rest_seconds')::int,
  90, 'última série mantém o descanso daquela série'
);
select is(
  (select public.submit_workout_session('pgtap-token-0032',
     '32000000-0000-0000-0000-000000000101', jsonb_set(value, '{0,rest_seconds}', '30'),
     null, 1, current_date, null, '32000000-0000-0000-0000-000000000005', 1)->>'stale' from _sets),
  'true', 'replay antigo continua sendo reconhecido'
);
select is(
  (select s.rest_seconds from public.workout_log_sets s
    join public.workout_logs l on l.id = s.log_id
    where l.client_ref = '32000000-0000-0000-0000-000000000101'),
  90, 'replay antigo não apaga o descanso mais novo'
);

select throws_ok(
  $$ select public.submit_workout_session('pgtap-token-0032',
       '32000000-0000-0000-0000-000000000101', jsonb_set(value, '{0,rest_seconds}', '-1'),
       null, 1, current_date, null, '32000000-0000-0000-0000-000000000005', 3) from _sets $$,
  '23514', null, 'descanso negativo é recusado no servidor'
);
select is(
  (select s.rest_seconds from public.workout_log_sets s
    join public.workout_logs l on l.id = s.log_id
    where l.client_ref = '32000000-0000-0000-0000-000000000101'),
  90, 'falha em substituição restaura as séries anteriores'
);
select throws_ok(
  $$ select public.create_workout_log('32000000-0000-0000-0000-000000000005',
       jsonb_set(value, '{0,rest_seconds}', '3601')) from _sets $$,
  '23514', null, 'descanso superior a uma hora é recusado'
);
select is(
  (select count(*)::int from public.workout_logs where plan_id = '32000000-0000-0000-0000-000000000005'),
  3, 'falha do descanso reverte também o cabeçalho profissional'
);
select throws_ok(
  $$ select public.create_workout_log('32000000-0000-0000-0000-000000000005',
       jsonb_set(value, '{0,rest_seconds}', '1.5')) from _sets $$,
  '22P02', null, 'fração de segundo não é arredondada silenciosamente'
);

select lives_ok(
  $$ select public.submit_workout_session('pgtap-token-0032',
       '32000000-0000-0000-0000-000000000101',
       jsonb_build_array(
         jsonb_set(value->0, '{rest_seconds}', '0'),
         jsonb_set(jsonb_set(value->0, '{set_number}', '2'), '{rest_seconds}', '3600'),
         jsonb_set(jsonb_set(value->0, '{set_number}', '3'), '{rest_seconds}', 'null')
       ), null, 1, current_date, null, '32000000-0000-0000-0000-000000000005', 3) from _sets $$,
  'nova revisão aceita zero, limite máximo e NULL explícito'
);
select is(
  (select array_agg(s.rest_seconds order by s.set_number) from public.workout_log_sets s
    join public.workout_logs l on l.id = s.log_id
    where l.client_ref = '32000000-0000-0000-0000-000000000101'),
  array[0, 3600, null]::integer[], 'zero e não informado continuam distintos'
);
select is(
  (select count(*)::int from public.workout_logs where client_ref = '32000000-0000-0000-0000-000000000101'),
  1, 'reenvios e revisões não duplicam a sessão'
);
select is(
  (select client_revision from public.workout_logs where client_ref = '32000000-0000-0000-0000-000000000101'),
  3, 'revisão avança somente quando o conjunto de séries é válido'
);

select * from finish();
rollback;
