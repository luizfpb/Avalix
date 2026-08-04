-- Behavioral regression for migration 0022.
-- Run ONLY against a disposable local/CI Supabase stack after its local reset.
-- Never run db reset or this stateful suite with --linked or --db-url.
--   SUPABASE_TELEMETRY_DISABLED=1 npx supabase test db \
--     supabase/tests/0022_mfa_gate_org.test.sql --local
--
-- LIMITE DESTE HARNESS (o mesmo do 0020_integrity_privacy.test.sql): o pg_prove
-- conecta como postgres, que e superusuario e por isso IGNORA RLS. Logo nao da
-- para verificar aqui o EFEITO de uma policy - um insert proibido passaria do
-- mesmo jeito. A primeira versao deste arquivo tentou fazer isso e falhou, com
-- razao.
--
-- O que da para provar aqui, e e o que importa na 0022:
--   1. a SEMANTICA de app.mfa_satisfied(), que e o gate em si. Funcao normal,
--      independe de RLS. E o coracao da correcao: em aal1 com fator verificado
--      ela precisa devolver false, e para quem nao usa 2FA precisa devolver
--      true (senao o onboarding de quem nao tem TOTP quebraria).
--   2. o gate dentro de create_organization, que e um RAISE de plpgsql e
--      dispara para qualquer usuario, superusuario incluido.
--   3. ESTRUTURALMENTE, que as policies de ESCRITA passaram a referenciar o
--      gate e que as de LEITURA continuam sem ele (a 0003 depende dos SELECTs
--      livres para o shell conseguir rotear ate /mfa). Ler pg_policies pega
--      quem remover o gate por engano, que e o risco real de regressao.
--
-- A verificacao ponta a ponta de que o PostgREST recusa a escrita em aal1
-- continua sendo E2E, fora do escopo desta suite.

begin;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end;
$$;
set local search_path = public, extensions, pg_catalog;

select plan(12);

-- ---------------------------------------------------------------------
-- Ator A: usa 2FA (fator TOTP verificado).
-- Ator B: nao usa 2FA (nenhum fator) - e a conta-alvo da escalada.
-- ---------------------------------------------------------------------
insert into auth.users (id, raw_user_meta_data)
values ('11000000-0000-0000-0000-000000000001', '{"full_name":"Owner Com 2FA"}'::jsonb);

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (
  '11000000-0000-0000-0000-0000000000fa',
  '11000000-0000-0000-0000-000000000001',
  'authy', 'totp', 'verified', now(), now()
);

insert into auth.users (id, raw_user_meta_data)
values ('11000000-0000-0000-0000-000000000002', '{"full_name":"Conta Sem 2FA"}'::jsonb);

create or replace function pg_temp.act(p_user uuid, p_aal text)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_user::text, true);
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text,
    true
  );
  select null::void;
$$;

create temporary table _s (key text primary key, value uuid not null);

-- ---------------------------------------------------------------------
-- aal2 com fator verificado: nada pode ter mudado
-- ---------------------------------------------------------------------
select pg_temp.act('11000000-0000-0000-0000-000000000001', 'aal2');

select ok(app.mfa_satisfied(), 'aal2 com fator verificado satisfaz o gate');

select lives_ok(
  $$ insert into pg_temp._s (key, value)
     select 'org', public.create_organization('Org 0022') $$,
  'create_organization continua funcionando em aal2'
);

-- ---------------------------------------------------------------------
-- aal1 com fator verificado: e aqui que a 0022 muda o comportamento
-- ---------------------------------------------------------------------
select pg_temp.act('11000000-0000-0000-0000-000000000001', 'aal1');

select ok(
  not app.mfa_satisfied(),
  'aal1 com fator verificado NAO satisfaz o gate (nucleo da correcao)'
);

select ok(
  app.role_in(
    (select value from pg_temp._s where key = 'org'), array['owner','admin']
  ),
  'role_in continua ignorando AAL de proposito (a 0003 depende disso para rotear ate /mfa)'
);

select throws_ok(
  $$ select public.create_organization('Org proibida') $$,
  'P0001',
  'verificacao em duas etapas pendente',
  'create_organization exige 2FA satisfeito'
);

-- ---------------------------------------------------------------------
-- Conta sem fator nenhum: 2FA e opcional, nada pode ter quebrado
-- ---------------------------------------------------------------------
select pg_temp.act('11000000-0000-0000-0000-000000000002', 'aal1');

select ok(
  app.mfa_satisfied(),
  'quem nao tem fator verificado segue satisfazendo o gate (2FA e opcional por conta)'
);

select lives_ok(
  $$ select public.create_organization('Org sem 2FA') $$,
  'onboarding de quem nao usa 2FA continua intacto'
);

-- ---------------------------------------------------------------------
-- Estrutura das policies: o gate esta declarado onde deve, e ausente onde
-- nao deve. Pega quem remover app.mfa_satisfied() por engano.
-- ---------------------------------------------------------------------
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'org_members'
      and policyname in ('org_members_insert','org_members_update','org_members_delete')
      and coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%mfa_satisfied%'),
  3,
  'as tres policies de escrita de org_members exigem mfa_satisfied'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'organizations'
      and policyname in ('organizations_update','organizations_delete')
      and coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%mfa_satisfied%'),
  2,
  'as duas policies de escrita de organizations exigem mfa_satisfied'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and policyname in ('org_members_select','organizations_select')
      and coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%mfa_satisfied%'),
  0,
  'os SELECTs seguem SEM o gate: o shell precisa deles para rotear ate /mfa'
);

-- ---------------------------------------------------------------------
-- Termo canonico imune a CRLF (segunda parte da 0022)
-- ---------------------------------------------------------------------
select is(
  position(chr(13) in app.canonical_consent_text('Clinica X')),
  0,
  'o termo canonico nao contem CR, entao o hash independe do checkout'
);

select ok(
  length(app.canonical_consent_text('Clinica X')) > 3000
    and position('Clinica X' in app.canonical_consent_text('Clinica X')) > 0,
  'o termo continua integro e com o Controlador interpolado'
);

select * from finish();
rollback;
