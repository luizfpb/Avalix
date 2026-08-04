-- =====================================================================
-- 0024 - Canal de contato do Controlador (LGPD art. 9, IV).
--
-- O titular tem direito de saber a quem dirigir pedido de acesso, correcao,
-- portabilidade, revogacao e eliminacao. O termo ja diz "Solicitacoes devem ser
-- dirigidas ao Controlador", e o codigo se recusa a INVENTAR um contato quando
-- nao ha um (ha teste para isso) - mas nao existia lugar nenhum para o
-- profissional informar qual e o contato dele. Estas colunas fecham essa lacuna.
--
-- NAO altera o termo canonico nem a versao do consentimento (segue 1.1). Isso
-- e deliberado: mudar o texto exige bumpar a versao e reescrever a funcao de
-- validacao junto com o trigger consent_b2_canonical da 0020, e um erro ali
-- rejeita TODO consentimento novo (nenhum aluno novo conseguiria ser
-- cadastrado). O contato passa a ser exibido ao titular na tela publica e no
-- rodape dos documentos, que e o que atende a finalidade pratica do art. 9.
-- Re-versionar o termo para 1.2 fica como decisao do Luiz, com migration
-- propria e testada num banco descartavel antes.
-- =====================================================================

alter table public.organizations
  add column if not exists contact_email text
    check (contact_email is null or (
      char_length(contact_email) between 5 and 254
      and position('@' in contact_email) > 1
    )),
  add column if not exists contact_phone text
    check (contact_phone is null or char_length(contact_phone) between 8 and 30);

comment on column public.organizations.contact_email is
  'Canal de contato do Controlador para exercicio de direitos do titular (LGPD art. 9, IV e art. 18). Exibido ao titular; nunca preenchido automaticamente.';
comment on column public.organizations.contact_phone is
  'Telefone/WhatsApp de contato do Controlador. Mesma finalidade do contact_email.';

-- As policies de organizations ja restringem update a owner/admin com 2FA
-- satisfeito (0022); estas colunas herdam isso sem regra nova. O SELECT segue
-- disponivel a quem e membro.

-- ---------------------------------------------------------------------
-- A RPC anonima do intake devolve um subconjunto EXPLICITO de campos ao aluno
-- (divulgacao minima). O contato entra nesse subconjunto de proposito: quem
-- mais precisa dele e justamente o titular, que le o termo nessa tela e nao
-- tem sessao no app. Corpo identico ao da 0019 com dois campos acrescentados;
-- nenhum outro dado da organizacao passa a ser exposto.
--
-- drop + create porque o tipo de retorno muda (nao da para create or replace
-- alterando a lista de colunas de uma funcao que retorna table).
-- ---------------------------------------------------------------------
drop function if exists public.get_anamnese_intake(text);

create function public.get_anamnese_intake(p_token text)
returns table (
  kind               text,
  org_name           text,
  subject_first_name text,
  subject_sex        text,
  spec_version       text,
  org_contact_email  text,
  org_contact_phone  text
)
language sql stable security definer set search_path = ''
as $$
  select i.kind,
         o.name,
         split_part(s.full_name, ' ', 1),
         s.sex,
         i.spec_version,
         o.contact_email,
         o.contact_phone
    from public.anamnese_intakes i
    left join public.subjects s   on s.id = i.subject_id
    join public.organizations o   on o.id = i.org_id
   where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and i.status = 'pending'
     and i.expires_at > now();
$$;

revoke execute on function public.get_anamnese_intake(text) from public;
grant execute on function public.get_anamnese_intake(text) to anon, authenticated;

create or replace function public.app_schema_version()
returns text
language sql immutable set search_path = ''
as $$ select '0024'::text $$;

revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
