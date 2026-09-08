-- Executar somente em Supabase local/CI descartável: npx supabase test db
begin;
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end;
$$;
set local search_path = public, extensions, pg_catalog;
select plan(54);

select col_type_is('public', 'workout_log_sets', 'reached_failure', 'boolean', 'falha é boolean explícito');
select col_is_null('public', 'workout_log_sets', 'reached_failure', 'falha desconhecida continua NULL');
select ok(
  not has_function_privilege('anon', 'public.update_workout_log(uuid,timestamptz,jsonb,date,text)', 'execute')
  and has_function_privilege('authenticated', 'public.update_workout_log(uuid,timestamptz,jsonb,date,text)', 'execute')
  and not (select prosecdef from pg_proc where oid = 'public.update_workout_log(uuid,timestamptz,jsonb,date,text)'::regprocedure),
  'edição profissional preserva invoker/RLS e é fechada para anon'
);
select ok(
  has_function_privilege('anon', 'public.update_workout_session_for_link(text,uuid,timestamptz,jsonb,date,text)', 'execute')
  and not has_function_privilege('anon', 'public.submit_workout_session_0027_internal(text,uuid,jsonb,text,int,date,text,uuid)', 'execute'),
  'aluno usa apenas as fachadas autorizadas'
);

select set_config('request.jwt.claim.sub', '33000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"33000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
insert into auth.users (id, raw_user_meta_data) values
  ('33000000-0000-0000-0000-000000000001', '{"full_name":"Treinador pgTAP 0033"}');
insert into public.organizations (id, name) values
  ('33000000-0000-0000-0000-000000000002', 'Org pgTAP 0033');
insert into public.org_members (org_id, user_id, role) values
  ('33000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects (id, org_id, evaluator_id, full_name, birth_date, sex) values
  ('33000000-0000-0000-0000-000000000003', '33000000-0000-0000-0000-000000000002',
   '33000000-0000-0000-0000-000000000001', 'Aluna pgTAP 0033', '1990-01-01', 'F'),
  ('33000000-0000-0000-0000-000000000006', '33000000-0000-0000-0000-000000000002',
   '33000000-0000-0000-0000-000000000001', 'Outra aluna pgTAP 0033', '1990-01-01', 'F');
insert into public.exercises (id, org_id, name, primary_muscle, equipment, movement_pattern) values
  ('33000000-0000-0000-0000-000000000004', '33000000-0000-0000-0000-000000000002',
   'Exercício pgTAP 0033', 'chest', 'barbell', 'horizontal_push');
insert into public.workout_plans (id, org_id, subject_id, evaluator_id, name, weeks, status) values
  ('33000000-0000-0000-0000-000000000005', '33000000-0000-0000-0000-000000000002',
   '33000000-0000-0000-0000-000000000003', '33000000-0000-0000-0000-000000000001', 'Plano pgTAP 0033', 4, 'active'),
  ('33000000-0000-0000-0000-000000000007', '33000000-0000-0000-0000-000000000002',
   '33000000-0000-0000-0000-000000000006', '33000000-0000-0000-0000-000000000001', 'Outro plano pgTAP 0033', 4, 'active');
insert into public.workout_links (org_id, subject_id, created_by, token_hash, expires_at) values
  ('33000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000003',
   '33000000-0000-0000-0000-000000000001', encode(sha256(convert_to('pgtap-token-0033', 'UTF8')), 'hex'), now() + interval '30 days');

create temporary table _sets (value jsonb not null);
insert into _sets values
  ('[{"exercise_id":"33000000-0000-0000-0000-000000000004","set_number":1,"weight_kg":40,"reps":10,"rir":0,"rest_seconds":90}]');
create temporary table _state (name text primary key, log_id uuid, version timestamptz, result jsonb);
grant select on _sets to anon, authenticated;
grant select, insert, update on _state to anon, authenticated;

set local role authenticated;
insert into _state (name, log_id, version)
select 'trainer', l.id, l.updated_at from _sets s
cross join lateral public.create_workout_log('33000000-0000-0000-0000-000000000005',
  jsonb_set(s.value, '{0,reached_failure}', 'false'), null, 1, current_date, 'Original treinador') l;
reset role;
insert into public.workout_logs (id, plan_id, source, client_ref, week_number, notes)
values ('33000000-0000-0000-0000-000000000108', '33000000-0000-0000-0000-000000000007',
        'student', '33000000-0000-0000-0000-000000000109', 1, 'Outra aluna');
insert into _state (name, log_id, version)
select 'other', id, updated_at from public.workout_logs where id = '33000000-0000-0000-0000-000000000108';

set local role anon;
select lives_ok(
  $$ select public.submit_workout_session('pgtap-token-0033', '33000000-0000-0000-0000-000000000101',
       value, null, 1, current_date - 1, 'Original aluno', '33000000-0000-0000-0000-000000000005', 1) from _sets $$,
  'aluno legado continua enviando RIR zero sem declarar falha'
);
reset role;
insert into _state (name, log_id, version)
select 'student', id, updated_at from public.workout_logs where client_ref = '33000000-0000-0000-0000-000000000101';

select is(
  (select reached_failure from public.workout_log_sets where log_id = (select log_id from _state where name = 'student')),
  null::boolean, 'RIR zero antigo não é convertido em falha'
);
select is(
  (select reached_failure from public.workout_log_sets where log_id = (select log_id from _state where name = 'trainer')),
  false, 'RIR zero com falha desmarcada fica distinto de falha'
);
select throws_ok(
  $$ select public.create_workout_log('33000000-0000-0000-0000-000000000005',
       jsonb_set(jsonb_set(value, '{0,reached_failure}', 'true'), '{0,rir}', '2')) from _sets $$,
  '23514', null, 'falha com RIR positivo é recusada'
);
select throws_ok(
  $$ select public.create_workout_log('33000000-0000-0000-0000-000000000005',
       jsonb_set(jsonb_set(value, '{0,reached_failure}', 'true'), '{0,rir}', 'null')) from _sets $$,
  '23514', null, 'falha sem RIR é recusada'
);
select is((select count(*)::int from public.workout_logs where plan_id = '33000000-0000-0000-0000-000000000005'),
  2, 'falha inválida reverte a criação inteira');

set local role authenticated;
select lives_ok(
  $$ update _state set result = to_jsonb(public.update_workout_log(log_id, version,
       (select jsonb_set(value, '{0,reached_failure}', 'true') from _sets), current_date - 20)) where name = 'trainer' $$,
  'profissional corrige data antiga e marca falha com RIR zero'
);
reset role;
select is((select notes from public.workout_logs where id = (select log_id from _state where name = 'trainer')),
  null::text, 'p_notes omitido limpa observações na edição');
select ok((select (result->>'updated_at')::timestamptz > version from _state where name = 'trainer'),
  'CAS recebe uma versão nova mesmo na mesma transação');
select ok((select corrected_at is not null from public.workout_logs where id = (select log_id from _state where name = 'trainer')),
  'correção profissional sela a sessão');
select throws_ok(
  $$ select public.update_workout_log(log_id, version, (select value from _sets), current_date) from _state where name = 'trainer' $$,
  '40001', 'registro de treino alterado por outra pessoa; recarregue antes de salvar', 'versão profissional antiga é recusada'
);
select throws_ok(
  $$ select public.update_workout_log(log_id, null, (select value from _sets), current_date) from _state where name = 'trainer' $$,
  'P0001', 'versao do registro de treino obrigatoria', 'edição profissional exige CAS'
);

set local role anon;
select throws_ok(
  $$ select public.update_workout_session_for_link('pgtap-token-0033', log_id, version,
       (select value from _sets), current_date) from _state where name = 'trainer' $$,
  'P0001', 'registro de treino indisponivel', 'aluno não pode editar sessão do treinador'
);
select throws_ok(
  $$ select public.update_workout_session_for_link('pgtap-token-0033', log_id, version,
       (select value from _sets), current_date) from _state where name = 'other' $$,
  'P0001', 'registro de treino indisponivel', 'token não edita sessão de outro aluno da mesma organização'
);
select throws_ok(
  $$ select public.update_workout_session_for_link('token-invalido', log_id, version,
       (select value from _sets), current_date) from _state where name = 'student' $$,
  'P0001', 'link invalido ou expirado', 'token inválido é recusado'
);
select throws_ok(
  $$ select public.update_workout_session_for_link('pgtap-token-0033', log_id, null,
       (select value from _sets), current_date) from _state where name = 'student' $$,
  'P0001', 'versao do registro de treino obrigatoria', 'edição do aluno exige CAS'
);
select lives_ok(
  $$ update _state set result = public.update_workout_session_for_link('pgtap-token-0033', log_id, version,
       (select jsonb_build_array(
         jsonb_set(value->0, '{reached_failure}', 'true'),
         jsonb_set(jsonb_set(value->0, '{set_number}', '2'), '{reached_failure}', 'false')
       ) from _sets), current_date - 30, 'Corrigido aluno') where name = 'student' $$,
  'aluno corrige sessão antiga e adiciona série atomicamente'
);
reset role;
select is((select jsonb_array_length(result->'sets') from _state where name = 'student'),
  2, 'retorno da edição contém as séries atualizadas');
select is((select result->'sets'->0->>'reached_failure' from _state where name = 'student'),
  'true', 'retorno da edição distingue falha declarada');
select is((select result->'sets'->0->>'rest_seconds' from _state where name = 'student'),
  '90', 'edição preserva o descanso realizado');
select is((select result->>'notes' from _state where name = 'student'), 'Corrigido aluno', 'retorno possui observações atualizadas');
select is((select result->>'plan_id' from _state where name = 'student'),
  '33000000-0000-0000-0000-000000000005', 'retorno identifica o plano original para incluir exercícios faltantes');
select ok((select (result->>'updated_at')::timestamptz > version from _state where name = 'student'),
  'retorno público fornece nova versão para a próxima edição');
select is((select performed_at from public.workout_logs where id = (select log_id from _state where name = 'student')),
  current_date - 30, 'correção explícita de data passa da janela original de sete dias');
select ok((select source = 'student' and week_number = 1 and day_label is null
    and plan_id = '33000000-0000-0000-0000-000000000005'
    and client_ref = '33000000-0000-0000-0000-000000000101'
    from public.workout_logs where id = (select log_id from _state where name = 'student')),
  'edição preserva autoria, plano, semana, divisão e identidade da sessão');
select is(
  (select public.submit_workout_session('pgtap-token-0033', '33000000-0000-0000-0000-000000000101', value,
     null, 1, current_date - 1, 'Replay', '33000000-0000-0000-0000-000000000005', 999)->>'corrected' from _sets),
  'true', 'replay com revisão maior reconhece sessão corrigida'
);
select is((select notes from public.workout_logs where id = (select log_id from _state where name = 'student')),
  'Corrigido aluno', 'replay não sobrescreve a correção');
select is((select count(*)::int from public.workout_log_sets where log_id = (select log_id from _state where name = 'student')),
  2, 'replay não substitui as séries corrigidas');
select throws_ok(
  $$ select public.update_workout_session_for_link('pgtap-token-0033', log_id, version,
       (select value from _sets), current_date) from _state where name = 'student' $$,
  '40001', 'registro de treino alterado por outra pessoa; recarregue antes de salvar', 'edição pública antiga é recusada'
);

-- A partir daqui, as tentativas inválidas usam a versão atual, sem contornar CAS.
update _state set version = (result->>'updated_at')::timestamptz where name in ('student', 'trainer');
select throws_ok(
  $$ select public.update_workout_session_for_link('pgtap-token-0033', log_id, version,
       (select jsonb_set(jsonb_set(value, '{0,reached_failure}', 'true'), '{0,rir}', '2') from _sets),
       current_date, 'Não deve gravar') from _state where name = 'student' $$,
  '23514', null, 'falha inconsistente também é barrada ao corrigir'
);
select ok((select notes = 'Corrigido aluno' and performed_at = current_date - 30 and updated_at = s.version
    from public.workout_logs l join _state s on s.log_id = l.id where s.name = 'student'),
  'falha em série restaura cabeçalho, data e versão da sessão');
select throws_ok(
  $$ select public.update_workout_session_for_link('pgtap-token-0033', log_id, version,
       '[]'::jsonb, current_date) from _state where name = 'student' $$,
  'P0001', 'quantidade de series fora do limite', 'não é possível apagar todas as séries na edição'
);
select throws_ok(
  $$ select public.update_workout_session_for_link('pgtap-token-0033', log_id, version,
       (select value from _sets), current_date + 1) from _state where name = 'student' $$,
  'P0001', 'data de execucao invalida', 'data futura é recusada'
);
select throws_ok(
  $$ select public.update_workout_log(log_id, version, (select value from _sets), current_date, repeat('x',601))
       from _state where name = 'trainer' $$,
  'P0001', 'observacao grande demais', 'correção profissional respeita teto de observações'
);
select throws_ok(
  $$ select public.update_workout_log(log_id, version, (select value || value from _sets), current_date)
       from _state where name = 'trainer' $$,
  'P0001', 'serie repetida no envio', 'série repetida é recusada na correção profissional'
);
select throws_ok(
  $$ select public.update_workout_session_for_link('pgtap-token-0033', log_id, version,
       (select jsonb_set(value, '{0,exercise_id}', '"33000000-0000-0000-0000-000000000999"') from _sets),
       current_date) from _state where name = 'student' $$,
  'P0001', 'exercicio desconhecido', 'correção mantém validação do catálogo'
);

update public.workout_plans set status = 'archived' where id = '33000000-0000-0000-0000-000000000005';
set local role anon;
select lives_ok(
  $$ update _state set result = public.update_workout_session_for_link('pgtap-token-0033', log_id, version,
       (select jsonb_set(value, '{0,reached_failure}', 'true') from _sets), current_date - 30, 'Arquivado') where name = 'student' $$,
  'aluno corrige sessão de plano arquivado e remove série'
);
reset role;
select is((select jsonb_array_length(result->'sets') from _state where name = 'student'), 1, 'remoção de série foi persistida');
select ok(
  (select item->>'updated_at' is not null and item->'sets'->0->>'reached_failure' = 'true'
       and item->>'plan_id' = '33000000-0000-0000-0000-000000000005'
     from jsonb_array_elements(public.get_workout_history_page_for_link('pgtap-token-0033')->'items') item
     where item->>'id' = (select log_id::text from _state where name = 'student')),
  'histórico paginado fornece falha e versão da sessão corrigida'
);
select ok(
  (select item->>'updated_at' is not null and item->'sets'->0->>'reached_failure' = 'true'
       and item->>'plan_id' = '33000000-0000-0000-0000-000000000005'
     from jsonb_array_elements(public.get_workout_history_for_link('pgtap-token-0033')) item
     where item->>'id' = (select log_id::text from _state where name = 'student')),
  'histórico anterior fornece o mesmo contrato de edição'
);
select is(app.workout_last_sets('33000000-0000-0000-0000-000000000003')->0->>'reached_failure',
  'true', 'última série fornece falha explicitamente registrada');

-- O profissional já podia registrar mais de 60 séries e notas maiores que 600.
insert into public.exercises (id, org_id, name, primary_muscle, equipment, movement_pattern) values
  ('33000000-0000-0000-0000-000000000009', '33000000-0000-0000-0000-000000000002',
   'Segundo exercício pgTAP 0033', 'chest', 'barbell', 'horizontal_push');
create temporary table _legacy_sets as
select jsonb_agg(jsonb_build_object(
  'exercise_id', case when n <= 50 then '33000000-0000-0000-0000-000000000004' else '33000000-0000-0000-0000-000000000009' end,
  'set_number', case when n <= 50 then n else n - 50 end,
  'weight_kg', 40, 'reps', 10, 'rir', 0, 'rest_seconds', 90, 'reached_failure', false
) order by n) as value from generate_series(1,61) n;
grant select on _legacy_sets to authenticated;
set local role authenticated;
insert into _state (name, log_id, version)
select 'legacy', l.id, l.updated_at from _legacy_sets s
cross join lateral public.create_workout_log('33000000-0000-0000-0000-000000000005',
  s.value, null, 1, current_date, repeat('a',700)) l;
select lives_ok(
  $$ update _state set result = to_jsonb(public.update_workout_log(log_id, version,
       (select value from _legacy_sets), current_date, repeat('b',700))) where name = 'legacy' $$,
  'profissional consegue corrigir registro legado com 61 séries e nota de 700 caracteres'
);
reset role;
update _state set version = (result->>'updated_at')::timestamptz where name = 'legacy';
select is((select count(*)::int from public.workout_log_sets where log_id = (select log_id from _state where name = 'legacy')),
  61, 'editar legado maior preserva todas as séries');
select throws_ok(
  $$ select public.update_workout_log(log_id, version, (select value from _legacy_sets), current_date, repeat('c',701))
       from _state where name = 'legacy' $$,
  'P0001', 'observacao grande demais', 'tolerância de legado não permite crescimento indefinido da nota'
);
select throws_ok(
  $$ select public.update_workout_log(log_id, version,
       (select value || jsonb_build_array(jsonb_set(value->60, '{set_number}', '12')) from _legacy_sets), current_date, repeat('c',700))
       from _state where name = 'legacy' $$,
  'P0001', 'quantidade de series fora do limite', 'tolerância de legado não permite crescimento indefinido de séries'
);

-- Corrigir uma data não permite contornar as três sessões do aluno naquele dia.
insert into public.workout_logs (plan_id, source, client_ref)
select '33000000-0000-0000-0000-000000000005', 'student', gen_random_uuid() from generate_series(1,3);
update _state set version = (result->>'updated_at')::timestamptz where name = 'student';
select throws_ok(
  $$ select public.update_workout_session_for_link('pgtap-token-0033', log_id, version,
       (select value from _sets), current_date) from _state where name = 'student' $$,
  'P0001', 'limite de sessoes para esta data', 'mover sessão respeita teto de três sessões do aluno por dia'
);

-- O gate de MFA deve atuar dentro da RPC invoker, mesmo chamada por REST.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  ('33000000-0000-0000-0000-000000000201', '33000000-0000-0000-0000-000000000001', 'pgTAP', 'totp', 'verified', now(), now());
select set_config('request.jwt.claims',
  '{"sub":"33000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.update_workout_log(log_id, version, (select value from _sets), current_date) from _state where name = 'trainer' $$,
  'P0001', 'registro de treino indisponivel', 'RPC profissional não contorna MFA'
);
reset role;

update _state set version = (result->>'updated_at')::timestamptz where name = 'student';
update public.workout_links set writes_count = 30, write_window_at = now()
  where subject_id = '33000000-0000-0000-0000-000000000003';
select throws_ok(
  $$ select public.update_workout_session_for_link('pgtap-token-0033', log_id, version,
       (select value from _sets), current_date) from _state where name = 'student' $$,
  'P0001', 'muitas gravacoes; tente de novo mais tarde', 'correções públicas respeitam limite de gravações por link'
);
update public.workout_links set status = 'revoked'
  where subject_id = '33000000-0000-0000-0000-000000000003';
select throws_ok(
  $$ select public.update_workout_session_for_link('pgtap-token-0033', log_id, version,
       (select value from _sets), current_date) from _state where name = 'student' $$,
  'P0001', 'link invalido ou expirado', 'link revogado perde também acesso à correção'
);

select ok(public.app_schema_version() >= '0033', 'carimbo confirma a 0033 ou versão posterior');
select * from finish();
rollback;
