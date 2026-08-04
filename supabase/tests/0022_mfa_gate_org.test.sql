-- Behavioral regression for migration 0022.
-- Run ONLY against a disposable local/CI Supabase stack after its local reset.
-- Never run db reset or this stateful suite with --linked or --db-url.
--   SUPABASE_TELEMETRY_DISABLED=1 npx supabase test db \
--     supabase/tests/0022_mfa_gate_org.test.sql --local
--
-- Cobre a escalada que a 0022 fecha: uma sessao aal1 de quem TEM fator TOTP
-- verificado nao pode mais mexer em org_members/organizations, que era o
-- caminho para conceder 'admin' a uma segunda conta sem 2FA e, por ela, ler
-- todos os avaliados. Cobre tambem o que NAO pode ter quebrado: quem nao usa
-- 2FA (fator nenhum) e quem esta em aal2 seguem administrando normalmente.

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
-- Ator A: usa 2FA (fator TOTP verificado). Comeca em aal2.
-- ---------------------------------------------------------------------
insert into auth.users (id, raw_user_meta_data)
values ('11000000-0000-0000-0000-000000000001', '{"full_name":"Owner Com 2FA"}'::jsonb);

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (
  '11000000-0000-0000-0000-0000000000fa',
  '11000000-0000-0000-0000-000000000001',
  'authy', 'totp', 'verified', now(), now()
);

-- Ator B: nao usa 2FA (nenhum fator). Serve de conta-alvo da escalada.
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
-- aal2: tudo funciona como antes
-- ---------------------------------------------------------------------
select pg_temp.act('11000000-0000-0000-0000-000000000001', 'aal2');

select ok(app.mfa_satisfied(), 'aal2 com fator verificado satisfaz o gate');

select lives_ok(
  $$ insert into pg_temp._s (key, value)
     select 'org', public.create_organization('Org 0022') $$,
  'create_organization continua funcionando em aal2'
);

select lives_ok(
  $$ update public.organizations set subject_term = 'aluno'
      where id = (select value from pg_temp._s where key = 'org') $$,
  'owner em aal2 edita a organizacao (caminho do Onboarding)'
);

-- ---------------------------------------------------------------------
-- aal1 com fator verificado: e aqui que a 0022 muda o comportamento
-- ---------------------------------------------------------------------
select pg_temp.act('11000000-0000-0000-0000-000000000001', 'aal1');

select ok(not app.mfa_satisfied(), 'aal1 com fator verificado NAO satisfaz o gate');

select ok(
  app.role_in(
    (select value from pg_temp._s where key = 'org'), array['owner','admin']
  ),
  'role_in continua ignorando AAL de proposito (a 0003 depende disso para rotear ate /mfa)'
);

select isnt_empty(
  $$ select 1 from public.organizations
      where id = (select value from pg_temp._s where key = 'org') $$,
  'o SELECT da organizacao continua liberado em aal1 (shell precisa dele)'
);

-- A escalada em si: conceder admin a outra conta a partir de uma sessao aal1.
select is_empty(
  $$ with tentativa as (
       insert into public.org_members (org_id, user_id, role)
       select value, '11000000-0000-0000-0000-000000000002', 'admin'
         from pg_temp._s where key = 'org'
       returning 1
     ) select * from tentativa $$,
  'aal1 nao consegue mais conceder admin a outra conta (escalada fechada)'
);

select is_empty(
  $$ with tentativa as (
       update public.organizations set subject_term = 'cliente'
        where id = (select value from pg_temp._s where key = 'org')
       returning 1
     ) select * from tentativa $$,
  'aal1 nao consegue mais editar a organizacao'
);

select is_empty(
  $$ with tentativa as (
       delete from public.org_members
        where org_id = (select value from pg_temp._s where key = 'org')
          and user_id = auth.uid()
       returning 1
     ) select * from tentativa $$,
  'aal1 nao consegue mais sair da org (acao destrutiva sob o gate)'
);

select throws_ok(
  $$ select public.create_organization('Org proibida') $$,
  'P0001',
  'verificacao em duas etapas pendente',
  'create_organization tambem exige 2FA satisfeito'
);

-- ---------------------------------------------------------------------
-- Conta sem 2FA nenhum: nada pode ter quebrado (onboarding do dia a dia)
-- ---------------------------------------------------------------------
select pg_temp.act('11000000-0000-0000-0000-000000000002', 'aal1');

select ok(
  app.mfa_satisfied(),
  'quem nao tem fator verificado segue satisfazendo o gate (2FA e opcional)'
);

select lives_ok(
  $$ select public.create_organization('Org sem 2FA') $$,
  'onboarding de quem nao usa 2FA continua intacto'
);

select * from finish();
rollback;
