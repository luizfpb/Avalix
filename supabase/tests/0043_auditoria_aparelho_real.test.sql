-- Somente PostgreSQL/Supabase descartável, com migrations até a 0043.
-- Fixtures fictícias e chamadas reais sob anon e authenticated; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(37);

select ok(public.app_schema_version() >= '0043',
  'schema inclui erros do aluno, nome sem acento e sessão idempotente');

-- =====================================================================
-- Nome de quem aceita o termo
-- =====================================================================
select is(app.person_name_key(E'  JOSÉ   da\tConceição  '), 'jose da conceicao',
  'acento, maiúscula e espaços repetidos não mudam o nome');
select is(app.person_name_key(E'Ünïcôdé Ñandú Çaça'), 'unicode nandu caca',
  'trema, til e cedilha também');
select isnt(app.person_name_key('Maria Souza'), app.person_name_key('Maria da Silva Souza'),
  'nome diferente continua diferente');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
insert into auth.users(id, raw_user_meta_data) values
 ('43000000-0000-0000-0000-000000000001', '{"full_name":"Owner 0043"}'),
 ('43000000-0000-0000-0000-000000000011', '{"full_name":"Owner outra org"}');
-- Cada organização nasce pelas mãos do próprio dono (governança da 0020).
select pg_temp.act('43000000-0000-0000-0000-000000000011', 'aal2');
insert into public.organizations(id, name) values
 ('43000000-0000-0000-0000-000000000012', 'Outra org 0043');
insert into public.org_members(org_id, user_id, role) values
 ('43000000-0000-0000-0000-000000000012', '43000000-0000-0000-0000-000000000011', 'owner');
select pg_temp.act('43000000-0000-0000-0000-000000000001', 'aal2');
insert into public.organizations(id, name) values
 ('43000000-0000-0000-0000-000000000002', 'Org pgTAP 0043');
insert into public.org_members(org_id, user_id, role) values
 ('43000000-0000-0000-0000-000000000002', '43000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects(id, org_id, full_name, birth_date, sex) values
 ('43000000-0000-0000-0000-000000000003', '43000000-0000-0000-0000-000000000002',
  E'José da Conceição', '1990-01-01', 'M');

-- Consentimento colhido pelo profissional, com o nome digitado sem acento.
select lives_ok(
  $$ insert into public.consent_records
       (org_id, subject_id, consent_version, consent_text_sha256,
        signer_kind, signer_name, collected_by)
     values
       ('43000000-0000-0000-0000-000000000002', '43000000-0000-0000-0000-000000000003',
        app.canonical_consent_version(),
        encode(sha256(convert_to(app.canonical_consent_text('Org pgTAP 0043'), 'UTF8')), 'hex'),
        'titular', 'jose  da CONCEICAO', '43000000-0000-0000-0000-000000000001') $$,
  'consentimento aceita o nome do cadastro escrito sem acento');
select throws_ok(
  $$ insert into public.consent_records
       (org_id, subject_id, consent_version, consent_text_sha256,
        signer_kind, signer_name, collected_by)
     values
       ('43000000-0000-0000-0000-000000000002', '43000000-0000-0000-0000-000000000003',
        app.canonical_consent_version(),
        encode(sha256(convert_to(app.canonical_consent_text('Org pgTAP 0043'), 'UTF8')), 'hex'),
        'titular', 'Joao da Conceicao', '43000000-0000-0000-0000-000000000001') $$,
  'quem assina como titular deve ser o avaliado cadastrado',
  'outra pessoa continua recusada');

-- Convites públicos da anamnese do mesmo aluno.
insert into public.anamnese_intakes (org_id, subject_id, token_hash, spec_version, expires_at)
values
 ('43000000-0000-0000-0000-000000000002', '43000000-0000-0000-0000-000000000003',
  encode(sha256(convert_to(repeat('i', 43), 'UTF8')), 'hex'), '1.3', now() + interval '1 day'),
 ('43000000-0000-0000-0000-000000000002', '43000000-0000-0000-0000-000000000003',
  encode(sha256(convert_to(repeat('j', 43), 'UTF8')), 'hex'), '1.3', now() + interval '1 day');

create temporary table _env (payload jsonb, versao text, hash text);
insert into _env values (
  '{"parq": {"cardio_dx": false, "dor_toracica": false, "tontura_sincope": false,
     "condicao_cronica": false, "medicacao_cronica": false, "lesao_atividade": false,
     "supervisao_medica": false},
    "ativo_regular": false, "doenca_cmr": [], "doenca_cmr_confirmada": true,
    "sinais_sintomas": [], "sinais_sintomas_confirmados": true, "red_flags": [],
    "gestante": null, "declaracao_veracidade": true, "consentimento_lgpd": true}'::jsonb,
  app.canonical_consent_version(),
  encode(sha256(convert_to(app.canonical_consent_text('Org pgTAP 0043'), 'UTF8')), 'hex'));
grant select on _env to anon, authenticated;

set local role anon;
select lives_ok(
  $$ select public.submit_anamnese_intake(repeat('i', 43), payload, 'titular',
       '  JOSE   DA conceicao ', versao, hash, 'pgTAP 0043') from _env $$,
  'aluno envia a anamnese com o nome sem acento e com espaços a mais');
select throws_ok(
  $$ select public.submit_anamnese_intake(repeat('j', 43), payload, 'titular',
       'Maria Souza', versao, hash, 'pgTAP 0043') from _env $$,
  'quem assina como titular deve ser o avaliado cadastrado',
  'o envio público ainda exige o titular');
reset role;
select is(
  (select status from public.anamnese_intakes
    where token_hash = encode(sha256(convert_to(repeat('i', 43), 'UTF8')), 'hex')),
  'submitted', 'o envio aceito ficou registrado');

-- =====================================================================
-- Erros das páginas do aluno
-- =====================================================================
insert into public.workout_links (id, subject_id, created_by, token_hash, expires_at)
values ('43000000-0000-0000-0000-000000000020', '43000000-0000-0000-0000-000000000003',
        '43000000-0000-0000-0000-000000000001',
        encode(sha256(convert_to(repeat('t', 43), 'UTF8')), 'hex'), now() + interval '30 days');

select ok(
  has_function_privilege('anon', 'public.report_link_error(text,text,text,text,text)', 'execute')
  and (select prosecdef from pg_proc where oid = 'public.report_link_error(text,text,text,text,text)'::regprocedure),
  'a página anônima do aluno consegue reportar, por uma porta só');

set local role anon;
select lives_ok(
  $$ select public.report_link_error('treino', repeat('t', 43),
       'treino:concluir: Load failed', 'stack de teste', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5)') $$,
  'erro do treino do aluno é aceito pelo token');
select lives_ok(
  $$ select public.report_link_error('treino', repeat('x', 43), 'token inventado') $$,
  'token desconhecido não gera erro na tela');
select lives_ok(
  $$ select public.report_link_error('outro', repeat('t', 43), 'tipo desconhecido') $$,
  'tipo desconhecido também é ignorado em silêncio');
select lives_ok(
  $$ select public.report_link_error('anamnese', repeat('i', 43), 'anamnese:enviar: Load failed') $$,
  'convite recém-enviado ainda reporta (resposta perdida, reenvio)');
select throws_ok(
  $$ insert into public.client_errors (org_id, message) values
       ('43000000-0000-0000-0000-000000000002', 'direto pelo anon') $$,
  '42501', null,
  'anon continua sem inserir direto na tabela');
reset role;

select is(
  (select count(*)::int from public.client_errors where source = 'treino'), 1,
  'só o token válido gravou');
select ok(
  (select user_id is null and url = '/t' and org_id = '43000000-0000-0000-0000-000000000002'
          and source_ref = '43000000-0000-0000-0000-000000000020'
          and user_agent like '%iPhone%'
     from public.client_errors where source = 'treino'),
  'registro sem usuário, na organização dona do link, com o aparelho');
select is(
  (select url from public.client_errors where source = 'anamnese'), '/a',
  'erro da anamnese pública também chega');

do $$ begin
  for i in 1..40 loop
    perform public.report_link_error('treino', repeat('t', 43), 'laço de erro ' || i);
  end loop;
end; $$;
select is(
  (select count(*)::int from public.client_errors where source = 'treino'), 30,
  'um aparelho em laço para no teto de 30 por hora');

select pg_temp.act('43000000-0000-0000-0000-000000000001', 'aal2');
set local role authenticated;
select throws_ok(
  $$ insert into public.client_errors (org_id, message, source, source_ref) values
       ('43000000-0000-0000-0000-000000000002', 'forjado', 'treino',
        '43000000-0000-0000-0000-000000000020') $$,
  'origem do registro de erro invalida',
  'membro não forja erro como se viesse do aluno');
select lives_ok(
  $$ insert into public.client_errors (org_id, message) values
       ('43000000-0000-0000-0000-000000000002', 'erro do profissional') $$,
  'o registro do profissional continua igual');
select ok(
  (select count(*) from public.client_errors where source = 'treino') = 30
  and (select count(*) from public.client_errors where source = 'app') = 1,
  'dono com 2FA lê os erros dos alunos e os seus');
reset role;

select pg_temp.act('43000000-0000-0000-0000-000000000011', 'aal2');
set local role authenticated;
select is(
  (select count(*)::int from public.client_errors), 0,
  'outra organização não vê os erros desta');
reset role;

select throws_ok(
  $$ select set_config('app.reporting_link_error', '43000000-0000-0000-0000-000000000020', true);
     insert into public.client_errors (org_id, message, source, source_ref) values
       ('43000000-0000-0000-0000-000000000012', 'link de outra org', 'treino',
        '43000000-0000-0000-0000-000000000020') $$,
  'registro de erro de link invalido',
  'mesmo no contexto da RPC, o link precisa ser da organização gravada');
select set_config('app.reporting_link_error', '', true);

-- =====================================================================
-- Sessão do profissional idempotente
-- =====================================================================
select ok(
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('create_workout_log', 'save_trainer_workout_session')
           group by n.nspname having count(*) = 2)
  and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('create_workout_log', 'save_trainer_workout_session')
       and (p.prosecdef
            or has_function_privilege('anon', p.oid, 'execute')
            or not has_function_privilege('authenticated', p.oid, 'execute'))),
  'uma versão de cada, security invoker, só para o profissional');

select pg_temp.act('43000000-0000-0000-0000-000000000001', 'aal2');
insert into public.exercises (id, org_id, name, primary_muscle, equipment, movement_pattern)
values ('43000000-0000-0000-0000-000000000005', '43000000-0000-0000-0000-000000000002',
        'Exercício pgTAP 0043', 'chest', 'barbell', 'horizontal_push');
insert into public.workout_plans (id, org_id, subject_id, evaluator_id, name, weeks, status)
values ('43000000-0000-0000-0000-000000000010', '43000000-0000-0000-0000-000000000002',
        '43000000-0000-0000-0000-000000000003', '43000000-0000-0000-0000-000000000001',
        'Plano 0043', 4, 'active');
-- Sessão do aluno com um client_ref: o profissional não pode tomá-la para si.
insert into public.workout_logs (plan_id, performed_at, source, client_ref, notes)
values ('43000000-0000-0000-0000-000000000010', current_date, 'student',
        '43000000-0000-0000-0000-0000000000c3', 'do aluno');

create temporary table _s (uma jsonb, duas jsonb);
insert into _s values (
  '[{"exercise_id":"43000000-0000-0000-0000-000000000005","set_number":1,"weight_kg":40,"reps":10}]',
  '[{"exercise_id":"43000000-0000-0000-0000-000000000005","set_number":1,"weight_kg":42.5,"reps":10},
    {"exercise_id":"43000000-0000-0000-0000-000000000005","set_number":2,"weight_kg":42.5,"reps":8}]');
grant select on _s to authenticated;

set local role authenticated;
select lives_ok(
  $$ select public.create_workout_log('43000000-0000-0000-0000-000000000010', uma,
       p_notes => 'c1', p_client_ref => '43000000-0000-0000-0000-0000000000c1') from _s $$,
  'profissional registra a sessão com a referência da tentativa');
select lives_ok(
  $$ select public.create_workout_log('43000000-0000-0000-0000-000000000010', duas,
       p_notes => 'c1 de novo', p_client_ref => '43000000-0000-0000-0000-0000000000c1') from _s $$,
  'a nova tentativa depois de uma resposta perdida também passa');
select is(
  (select count(*)::int from public.workout_logs
    where client_ref = '43000000-0000-0000-0000-0000000000c1'),
  1, 'nova tentativa não duplica a sessão');
select is(
  (select count(*)::int from public.workout_log_sets s join public.workout_logs l on l.id = s.log_id
    where l.client_ref = '43000000-0000-0000-0000-0000000000c1'),
  2, 'vale o conteúdo da última tentativa');

select lives_ok(
  $$ select public.create_workout_log('43000000-0000-0000-0000-000000000010', uma, p_notes => 'sem ref')
       from _s cross join generate_series(1, 2) $$,
  'sem a referência, como no frontend antigo, cada chamada é uma sessão');
select is(
  (select count(*)::int from public.workout_logs where notes = 'sem ref'), 2,
  'o comportamento anterior continua igual sem o parâmetro');

select lives_ok(
  $$ select public.save_trainer_workout_session('43000000-0000-0000-0000-000000000010', uma, true,
       p_notes => 'c2', p_client_ref => '43000000-0000-0000-0000-0000000000c2')
       from _s cross join generate_series(1, 2) $$,
  '"salvar e continuar" repetido pela rede ruim');
select is(
  (select count(*)::int from public.workout_logs
    where client_ref = '43000000-0000-0000-0000-0000000000c2' and in_progress),
  1, 'continua uma sessão só, em andamento');

select lives_ok(
  $$ select public.create_workout_log('43000000-0000-0000-0000-000000000010', duas,
       p_notes => 'c2', p_client_ref => '43000000-0000-0000-0000-0000000000c2') from _s $$,
  'registrar depois de um "salvar" sem resposta conclui a mesma sessão');
select ok(
  (select count(*) = 1 and bool_and(not in_progress) from public.workout_logs
    where client_ref = '43000000-0000-0000-0000-0000000000c2'),
  'concluída, sem uma segunda sessão');
select throws_ok(
  $$ select public.save_trainer_workout_session('43000000-0000-0000-0000-000000000010', uma, true,
       p_client_ref => '43000000-0000-0000-0000-0000000000c2') from _s $$,
  'esta sessao ja foi concluida; corrija pelo historico de sessoes',
  'sessão concluída não volta a ficar em andamento por uma tentativa atrasada');
select throws_ok(
  $$ select public.create_workout_log('43000000-0000-0000-0000-000000000010', uma,
       p_client_ref => '43000000-0000-0000-0000-0000000000c3') from _s $$,
  'registro de treino indisponivel',
  'a referência de uma sessão do aluno não é sobrescrita pelo profissional');
reset role;

select * from finish();
rollback;
