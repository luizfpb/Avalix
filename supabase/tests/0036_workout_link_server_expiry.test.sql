-- Somente PostgreSQL/Supabase descartável, com migrations até a 0036.
-- Fixtures fictícias e chamadas reais sob authenticated/anon; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(31);

select ok(public.app_schema_version() >= '0036', 'schema inclui a validade pelo servidor');
select ok(
  (select not prosecdef and proconfig @> array['search_path=""'] from pg_proc
    where oid = 'public.issue_workout_link(uuid,text,timestamptz)'::regprocedure),
  'emissão continua security invoker com search_path vazio');
select ok(
  has_function_privilege('authenticated', 'public.issue_workout_link(uuid,text,timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.issue_workout_link(uuid,text,timestamptz)', 'execute'),
  'mesma assinatura permanece exclusiva do profissional');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
insert into auth.users(id, raw_user_meta_data) values
 ('36000000-0000-0000-0000-000000000001', '{"full_name":"Owner teste"}'),
 ('36000000-0000-0000-0000-000000000099', '{"full_name":"Outra conta"}');
select pg_temp.act('36000000-0000-0000-0000-000000000001', 'aal2');
insert into public.organizations(id, name) values
 ('36000000-0000-0000-0000-000000000002', 'Org teste 0036');
insert into public.org_members(org_id, user_id, role) values
 ('36000000-0000-0000-0000-000000000002', '36000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects(id, org_id, full_name, birth_date, sex) values
 ('36000000-0000-0000-0000-000000000003', '36000000-0000-0000-0000-000000000002', 'Titular teste', '1990-01-01', 'F'),
 ('36000000-0000-0000-0000-000000000004', '36000000-0000-0000-0000-000000000002', 'Outro titular', '1990-01-01', 'M');

set local role authenticated;
select lives_ok($$select public.issue_workout_link(
 '36000000-0000-0000-0000-000000000003', repeat('1', 64))$$,
 'novo cliente emite omitindo a data de expiração');
select is((select expires_at from public.workout_links where token_hash = repeat('1', 64)),
 now() + interval '180 days', 'prazo padrão usa exatamente os 180 dias do servidor');
select ok((select expires_at = created_at + interval '180 days'
  and org_id = '36000000-0000-0000-0000-000000000002'
  and created_by = '36000000-0000-0000-0000-000000000001'
 from public.workout_links where token_hash = repeat('1', 64)),
 'emissão respeita o check e mantém organização e autoria do profissional');

select lives_ok($$select public.issue_workout_link(
 '36000000-0000-0000-0000-000000000003', repeat('2', 64), null)$$,
 'data explicitamente nula também usa o padrão do servidor');
select is((select expires_at from public.workout_links where token_hash = repeat('2', 64)),
 now() + interval '180 days', 'null recebe o mesmo prazo padrão');
select ok((select status = 'revoked' from public.workout_links where token_hash = repeat('1', 64))
 and (select count(*) = 1 from public.workout_links
       where subject_id = '36000000-0000-0000-0000-000000000003' and status = 'active'),
 'reemissão revoga o anterior e mantém apenas um link ativo');

-- Antes da 0036, a primeira chamada abaixo reproduzia exatamente o erro
-- workout_links_ttl_chk: o aparelho estava só um segundo à frente do banco.
select lives_ok($$select public.issue_workout_link(
 '36000000-0000-0000-0000-000000000003', repeat('3', 64), now() + interval '180 days 1 second')$$,
 'cliente legado com relógio um segundo adiantado consegue emitir');
select is((select expires_at from public.workout_links where token_hash = repeat('3', 64)),
 now() + interval '180 days', 'excesso do relógio local é limitado ao teto do banco');
select lives_ok($$select public.issue_workout_link(
 '36000000-0000-0000-0000-000000000003', repeat('4', 64), now() + interval '180 days 1 hour')$$,
 'hora extra produzida por mudança de horário de verão não bloqueia emissão legada');
select is((select expires_at from public.workout_links where token_hash = repeat('4', 64)),
 now() + interval '180 days', 'hora extra também é limitada sem ampliar os 180 dias');

select lives_ok($$select public.issue_workout_link(
 '36000000-0000-0000-0000-000000000003', repeat('5', 64), now() + interval '30 days')$$,
 'cliente legado ainda pode pedir prazo menor');
select is((select expires_at from public.workout_links where token_hash = repeat('5', 64)),
 now() + interval '30 days', 'prazo menor é preservado sem ser estendido');

select throws_ok($$select public.issue_workout_link(
 '36000000-0000-0000-0000-000000000003', repeat('6', 64), now() - interval '1 second')$$,
 'P0001', 'A validade do link de treino deve estar no futuro.', 'prazo vencido é recusado');
select throws_ok($$select public.issue_workout_link(
 '36000000-0000-0000-0000-000000000003', repeat('7', 64), now())$$,
 'P0001', 'A validade do link de treino deve estar no futuro.', 'prazo igual ao instante da emissão é recusado');
select ok((select status = 'active' and expires_at = now() + interval '30 days'
 from public.workout_links where token_hash = repeat('5', 64)),
 'pedidos vencidos preservam status e validade do link anterior');

select throws_ok($$select public.issue_workout_link(
 '36000000-0000-0000-0000-000000000003', 'hash-invalido')$$,
 'P0001', 'token_hash invalido', 'emissão padrão continua validando o hash');
-- A colisão ocorre no INSERT, depois do UPDATE que revoga o link anterior.
-- Sua recusa deve reverter a revogação dentro da própria chamada da RPC.
select throws_ok($$select public.issue_workout_link(
 '36000000-0000-0000-0000-000000000003', repeat('5', 64))$$,
 '23505', null, 'colisão de hash é recusada após tentar revogar o anterior');
select ok((select status = 'active' from public.workout_links where token_hash = repeat('5', 64))
 and (select count(*) = 5 from public.workout_links
       where subject_id = '36000000-0000-0000-0000-000000000003'),
 'falha de reemissão desfaz a revogação e não deixa linha parcial');

select throws_ok($$insert into public.workout_links(subject_id, token_hash, expires_at)
 values ('36000000-0000-0000-0000-000000000004', repeat('8', 64), now() + interval '181 days')$$,
 '23514', 'new row for relation "workout_links" violates check constraint "workout_links_ttl_chk"',
 'INSERT direto continua sujeito ao teto de segurança de 180 dias');

select pg_temp.act('36000000-0000-0000-0000-000000000099', 'aal2');
select throws_ok($$select public.issue_workout_link(
 '36000000-0000-0000-0000-000000000003', repeat('9', 64))$$,
 'P0001', 'avaliado inexistente ou sem acesso', 'outra conta não emite link para o titular');
select is((select count(*)::int from public.workout_links
 where subject_id = '36000000-0000-0000-0000-000000000003'),
 0, 'RLS também esconde os links existentes da outra conta');
reset role;

set local role anon;
select throws_ok($$select public.issue_workout_link(
 '36000000-0000-0000-0000-000000000003', repeat('a', 64))$$,
 '42501', 'permission denied for function issue_workout_link', 'anon não emite omitindo a data');
select throws_ok($$select public.issue_workout_link(
 '36000000-0000-0000-0000-000000000003', repeat('a', 64), now() + interval '30 days')$$,
 '42501', 'permission denied for function issue_workout_link', 'anon também não emite pela chamada legada');
reset role;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, created_at, updated_at)
 values ('36000000-0000-0000-0000-000000000020', '36000000-0000-0000-0000-000000000001',
         'teste', 'totp', 'verified', now(), now());
select pg_temp.act('36000000-0000-0000-0000-000000000001', 'aal1');
set local role authenticated;
select throws_ok($$select public.issue_workout_link(
 '36000000-0000-0000-0000-000000000003', repeat('b', 64))$$,
 'P0001', 'avaliado inexistente ou sem acesso', 'MFA pendente continua bloqueando emissão pela RLS');
select is((select count(*)::int from public.workout_links
 where subject_id = '36000000-0000-0000-0000-000000000003'),
 0, 'MFA pendente não permite ler o link anterior');
select pg_temp.act('36000000-0000-0000-0000-000000000001', 'aal2');
select ok((select status = 'active' and expires_at = now() + interval '30 days'
 from public.workout_links where token_hash = repeat('5', 64)),
 'recusas de acesso preservam o link disponível ao profissional autorizado');
select is((select count(*)::int from public.workout_links
 where subject_id = '36000000-0000-0000-0000-000000000003'),
 5, 'recusas de acesso não criam nem removem links');
select is((select count(*)::int from public.workout_links
 where subject_id = '36000000-0000-0000-0000-000000000004'),
 0, 'tentativa de contornar o teto não deixa link para o outro titular');

select * from finish();
rollback;
