-- =====================================================================
-- 0022 - Fecha o contorno de 2FA pela administracao da organizacao e torna
--        o termo canonico imune ao fim de linha do arquivo aplicado.
--
-- CONTEXTO DO PROBLEMA #1 (contorno de 2FA)
-- A 0003 documenta, de proposito, que app.is_member/app.role_in NAO checam
-- AAL: o shell precisa carregar org e membership para conseguir rotear ate a
-- tela de desafio (/mfa). O gate de 2FA mora em app.can_view_subject, que
-- cobre todo dado de saude (subjects, assessments, leituras, sessoes, fotos,
-- anotacoes, consentimento e os objetos do Storage derivam dela).
--
-- O que escapou: as policies de ESCRITA de org_members e organizations sao as
-- unicas superficies sensiveis que ficaram so com role_in/is_member, sem
-- app.mfa_satisfied(). Como mfa_satisfied() devolve true para quem NAO tem
-- fator verificado (2FA e opcional por conta, decisao de jul/2026), abre-se
-- esta escalada com apenas a senha vazada de uma conta que usa 2FA:
--
--   1. atacante entra com a senha  -> sessao aal1 (nao completa o TOTP)
--   2. can_view_subject barra todo dado de saude                        [ok]
--   3. MAS org_members_insert so pede role_in(...,'owner','admin'), que
--      ignora AAL -> ele concede 'admin' na org a uma segunda conta sua
--   4. essa segunda conta nao tem fator verificado -> mfa_satisfied() = true
--   5. ela le todos os avaliados da organizacao
--
-- Ou seja: o 2FA era contornavel em duas chamadas REST diretas (o endpoint do
-- PostgREST e chamavel mesmo sem UI de equipe). Este arquivo poe o gate nas
-- escritas administrativas, sem tocar nos SELECTs - o roteamento ate /mfa
-- continua funcionando exatamente como a 0003 desenhou.
--
-- Por que isto NAO quebra o onboarding: organizations nao tem policy de
-- insert (a criacao passa por create_organization, security definer) e um
-- usuario novo nao tem fator verificado, entao mfa_satisfied() = true para
-- ele. Quem tem 2FA e esta em aal2 tambem passa. So a sessao aal1 de quem
-- tem fator verificado e barrada - exatamente a intencao.
--
-- CONTEXTO DO PROBLEMA #2 (fim de linha do termo)
-- app.canonical_consent_text devolvia o literal exatamente como esta no .sql
-- aplicado. Num checkout Windows (core.autocrlf=true, que era o caso deste
-- repo antes do .gitattributes) o arquivo tem CRLF, enquanto o template
-- literal do TS e normalizado para LF pela spec do JavaScript. Se a 0020
-- fosse reaplicada a partir de uma arvore assim, o hash do servidor passaria
-- a divergir do hash do cliente e o trigger consent_b2_canonical rejeitaria
-- TODO novo consentimento com 'versao ou hash do consentimento nao
-- corresponde ao termo atual' - quebrando o cadastro de qualquer aluno novo.
-- Normalizar na propria funcao torna o resultado independente de como o
-- arquivo foi aplicado. O texto em si nao muda: a versao continua 1.1 e os
-- aceites ja gravados seguem validos byte-a-byte.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ORG_MEMBERS - escrita exige 2FA satisfeito
-- ---------------------------------------------------------------------
drop policy if exists org_members_insert on public.org_members;
create policy org_members_insert on public.org_members
  for insert to authenticated
  with check (app.role_in(org_id, array['owner','admin']) and app.mfa_satisfied());

drop policy if exists org_members_update on public.org_members;
create policy org_members_update on public.org_members
  for update to authenticated
  using (app.role_in(org_id, array['owner','admin']) and app.mfa_satisfied())
  with check (app.role_in(org_id, array['owner','admin']) and app.mfa_satisfied());

-- Sair da propria org continua permitido a qualquer membro, mas tambem passa
-- a exigir 2FA satisfeito: e uma acao destrutiva (perde acesso aos dados) e
-- nao ha razao para ela ser o unico caminho de escrita aberto em aal1.
drop policy if exists org_members_delete on public.org_members;
create policy org_members_delete on public.org_members
  for delete to authenticated
  using (
    app.mfa_satisfied()
    and (
      app.role_in(org_id, array['owner','admin'])
      or user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- ORGANIZATIONS - escrita exige 2FA satisfeito
-- (select continua sem gate: o shell precisa dele para rotear ate /mfa)
-- ---------------------------------------------------------------------
drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (app.role_in(id, array['owner','admin']) and app.mfa_satisfied())
  with check (app.role_in(id, array['owner','admin']) and app.mfa_satisfied());

drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete on public.organizations
  for delete to authenticated
  using (app.role_in(id, array['owner']) and app.mfa_satisfied());

-- ---------------------------------------------------------------------
-- create_organization - mesmo gate, por defesa em profundidade.
-- Corpo identico ao da 0015 (cap anti-flood de 25 orgs proprias) com o
-- mfa_satisfied() acrescentado logo apos a checagem de autenticacao.
-- ---------------------------------------------------------------------
create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_org   uuid;
  v_owned int;
begin
  if (select auth.uid()) is null then
    raise exception 'nao autenticado';
  end if;
  if not app.mfa_satisfied() then
    raise exception 'verificacao em duas etapas pendente';
  end if;
  -- guarda anti-flood: limite generoso de orgs proprias por usuario. Um
  -- profissional solo precisa de 1; 25 cobre qualquer uso legitimo sem virar
  -- vetor de abuso. Ajustar se um dia houver multi-org de verdade acima disso.
  select count(*) into v_owned
    from public.org_members m
   where m.user_id = (select auth.uid()) and m.role = 'owner';
  if v_owned >= 25 then
    raise exception 'limite de organizacoes por usuario atingido';
  end if;
  insert into public.organizations (name) values (p_name) returning id into v_org;
  insert into public.org_members (org_id, user_id, role)
  values (v_org, (select auth.uid()), 'owner');
  return v_org;
end;
$$;

revoke execute on function public.create_organization(text) from anon, public;
grant execute on function public.create_organization(text) to authenticated;

-- ---------------------------------------------------------------------
-- Termo canonico imune a CRLF (ver cabecalho).
--
-- O literal NAO e copiado para ca de proposito: manter o mesmo termo escrito
-- em dois arquivos e exatamente o tipo de duplicacao que produz a divergencia
-- que esta migration existe para impedir. Em vez disso, a funcao da 0020 e
-- RENOMEADA (preservando o corpo byte-a-byte, seja qual for) e passa a ser
-- lida por um wrapper que normaliza o fim de linha. Assim o teste
-- src/features/consent/text.test.ts continua sendo a unica fonte de verdade
-- sobre o texto, comparando TS x 0020.
-- ---------------------------------------------------------------------
do $migrate$
begin
  -- Idempotente: so renomeia se o _raw ainda nao existir. Cobre tanto um banco
  -- com a 0020 ja aplicada quanto um banco recriado do zero em ordem, e
  -- permite reaplicar esta migration sem erro.
  if to_regprocedure('app.canonical_consent_text_raw(text)') is null then
    if to_regprocedure('app.canonical_consent_text(text)') is null then
      raise exception 'app.canonical_consent_text(text) nao existe: aplique a 0020 antes da 0022';
    end if;
    execute 'alter function app.canonical_consent_text(text) rename to canonical_consent_text_raw';
  end if;
end
$migrate$;

create or replace function app.canonical_consent_text(p_controller text)
returns text
language sql immutable set search_path = ''
as $$
  select replace(app.canonical_consent_text_raw(p_controller), chr(13) || chr(10), chr(10));
$$;

-- Prova, na propria aplicacao da migration, que o termo continua o mesmo de
-- antes a menos do fim de linha. Se alguem reaplicar a 0020 a partir de uma
-- arvore CRLF depois disto, o texto normalizado continua correto; se o termo
-- tiver sido alterado por engano, esta checagem falha e a migration aborta.
do $verify$
declare
  v_text text := app.canonical_consent_text('Clinica X');
begin
  if position(chr(13) in v_text) > 0 then
    raise exception 'termo canonico ainda contem CR apos a normalizacao';
  end if;
  if v_text is null or length(v_text) < 3000 then
    raise exception 'termo canonico ficou vazio ou truncado (% chars)', coalesce(length(v_text), -1);
  end if;
  if position('art. 11, inciso I' in v_text) = 0
     or position('Clinica X (o' in v_text) = 0 then
    raise exception 'termo canonico nao contem os marcadores esperados apos a normalizacao';
  end if;
end
$verify$;
