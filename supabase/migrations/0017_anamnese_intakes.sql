-- Avalix - migration 0017: anamnese respondida pelo aluno via link
-- Depende de 0001-0016. Nao apaga dado; adiciona tabela, RPCs e view.
-- Spec: docs/anamnese_link_aluno_spec.md.
--
-- Ideia: o personal gera um link com um token secreto (256 bits), manda pro
-- aluno, e o aluno responde SEM login. A resposta entra como "submitted"
-- (pendente de revisao); o personal revisa e aceita, e so entao vira uma
-- anamnese oficial. O token e uma credencial de uso unico com validade: o
-- banco guarda so o HASH dele (sha256), nunca o token cru. Isso e diferente de
-- "path dificil de adivinhar" (que a 0002 rejeita): aqui o token e o segredo,
-- como um link de redefinir senha, e a linha que ele destrava nao expoe dado
-- de nenhum outro avaliado.
--
-- Porta pro anonimo: NENHUMA policy aberta pra anon. O anon so alcanca o banco
-- por duas RPCs security definer (get/submit), que validam o token por dentro
-- e rodam com privilegio do dono (bypassa RLS, igual create_organization/audit).
-- O hash e feito em SQL com sha256() nativo (pg_catalog, sem extensao): mesmo
-- hex que o sha256Hex() do front (SHA-256 dos bytes UTF-8, hex minusculo).

begin;

-- =====================================================================
-- TABELA: anamnese_intakes
-- Mesmo padrao das filhas: org_id herdado do subject por trigger, colunas
-- relacionais congeladas, updated_at e auditoria. payload e a fonte de verdade
-- das respostas (igual anamneses.payload); as saidas do gate NAO ficam aqui -
-- sao calculadas no TS (modulo puro) e gravadas na anamnese so no aceite.
-- =====================================================================
create table public.anamnese_intakes (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  subject_id      uuid not null references public.subjects(id) on delete cascade,
  created_by      uuid not null default auth.uid() references public.profiles(id),
  token_hash      text not null unique,          -- sha256(token) hex; token cru nunca e gravado
  status          text not null default 'pending'
                  check (status in ('pending','submitted','accepted','rejected','canceled')),
  expires_at      timestamptz not null,
  spec_version    text not null,

  -- preenchidos no envio (anon), nulos ate la
  submitted_at    timestamptz,
  payload         jsonb,

  -- evidencia do consentimento dado pelo proprio aluno (LGPD): guardamos aqui;
  -- o consent_records oficial e criado no aceite, com collected_by = personal.
  consent_version      text,
  consent_text_sha256  text,
  signer_kind          text check (signer_kind in ('titular','responsavel')),
  signer_name          text,
  submit_user_agent    text,

  -- preenchidos na revisao
  reviewed_at           timestamptz,
  reviewed_by           uuid references public.profiles(id),
  resulting_anamnese_id uuid references public.anamneses(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index anamnese_intakes_subject_idx on public.anamnese_intakes (subject_id, created_at desc);
-- consulta barata do dashboard: quais estao aguardando revisao, por org
create index anamnese_intakes_pending_idx on public.anamnese_intakes (org_id) where status = 'submitted';

create trigger anamnese_intakes_b1_org
  before insert on public.anamnese_intakes
  for each row execute function app.org_from_subject();

create trigger anamnese_intakes_freeze
  before update on public.anamnese_intakes
  for each row execute function app.freeze_columns('org_id', 'subject_id', 'token_hash', 'created_by');

create trigger anamnese_intakes_updated_at
  before update on public.anamnese_intakes
  for each row execute function app.set_updated_at();

-- audit_logs.user_id e nullable: o envio anonimo grava ator nulo, tudo certo.
create trigger anamnese_intakes_audit
  after insert or update or delete on public.anamnese_intakes
  for each row execute function app.audit();

-- =====================================================================
-- RLS: so authenticated, sempre derivada do subject. anon nunca toca a tabela
-- direto (chega so pelas RPCs security definer). Gerar link NAO exige
-- consentimento previo: o consentimento vem do aluno no envio.
-- =====================================================================
alter table public.anamnese_intakes enable row level security;

create policy anamnese_intakes_select on public.anamnese_intakes
  for select to authenticated
  using (app.can_view_subject_id(subject_id));

create policy anamnese_intakes_insert on public.anamnese_intakes
  for insert to authenticated
  with check (
    app.can_view_subject_id(subject_id)
    and created_by = (select auth.uid())
  );

create policy anamnese_intakes_update on public.anamnese_intakes
  for update to authenticated
  using (app.can_view_subject_id(subject_id))
  with check (app.can_view_subject_id(subject_id));

create policy anamnese_intakes_delete on public.anamnese_intakes
  for delete to authenticated
  using (app.can_view_subject_id(subject_id));

-- =====================================================================
-- RPC get_anamnese_intake: anon le o formulario a partir do token.
-- Divulgacao minima: so a marca da org + o minimo que o form precisa
-- (primeiro nome pra saudacao, sexo pra decidir a secao B6). Nada de
-- telefone/email/observacoes/nascimento nem dado de outro avaliado.
-- Token invalido/expirado/ja usado => zero linhas => a pagina mostra
-- "link invalido ou expirado".
-- =====================================================================
create or replace function public.get_anamnese_intake(p_token text)
returns table (
  org_name           text,
  org_logo_path      text,
  subject_first_name text,
  subject_sex        text,
  spec_version       text
)
language sql stable security definer set search_path = ''
as $$
  select o.name,
         o.logo_path,
         split_part(s.full_name, ' ', 1),
         s.sex,
         i.spec_version
    from public.anamnese_intakes i
    join public.subjects s      on s.id = i.subject_id
    join public.organizations o on o.id = i.org_id
   where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and i.status = 'pending'
     and i.expires_at > now();
$$;

revoke execute on function public.get_anamnese_intake(text) from public;
grant execute on function public.get_anamnese_intake(text) to anon, authenticated;

-- =====================================================================
-- RPC submit_anamnese_intake: anon envia as respostas + aceite do termo.
-- Uso unico garantido pelo filtro status='pending' (2o envio nao acha nada).
-- O gate NAO e confiado do cliente do aluno: e recalculado no aceite (no TS
-- do personal), a partir do payload. Consentimento e obrigatorio.
-- =====================================================================
create or replace function public.submit_anamnese_intake(
  p_token               text,
  p_payload             jsonb,
  p_signer_kind         text,
  p_signer_name         text,
  p_consent_version     text,
  p_consent_text_sha256 text,
  p_user_agent          text
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_payload is null then
    raise exception 'payload obrigatorio';
  end if;
  if p_signer_kind not in ('titular', 'responsavel') then
    raise exception 'signer_kind invalido';
  end if;
  if char_length(coalesce(btrim(p_signer_name), '')) < 3 then
    raise exception 'nome de quem assina o consentimento e obrigatorio';
  end if;
  if coalesce(p_consent_version, '') = '' or coalesce(p_consent_text_sha256, '') = '' then
    raise exception 'consentimento obrigatorio';
  end if;

  update public.anamnese_intakes
     set status              = 'submitted',
         submitted_at        = now(),
         payload             = p_payload,
         signer_kind         = p_signer_kind,
         signer_name         = left(btrim(p_signer_name), 160),  -- consent_records exige 3..160
         consent_version     = p_consent_version,
         consent_text_sha256 = p_consent_text_sha256,
         submit_user_agent   = left(p_user_agent, 400)
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and status = 'pending'
     and expires_at > now()
   returning id into v_id;

  if v_id is null then
    raise exception 'link invalido, expirado ou ja utilizado';
  end if;
end;
$$;

revoke execute on function public.submit_anamnese_intake(text, jsonb, text, text, text, text, text) from public;
grant execute on function public.submit_anamnese_intake(text, jsonb, text, text, text, text, text) to anon, authenticated;

-- =====================================================================
-- RPC accept_anamnese_intake: personal aceita a resposta pendente.
-- security INVOKER (a RLS do personal vale por dentro; nada de bypass), no
-- espirito da 0016. Numa transacao: cria o consentimento (dado pelo titular
-- via link; collected_by = quem aceita), cria a anamnese oficial e marca o
-- intake como aceito. O gate vem calculado do TS (mesma confianca do
-- createAnamnese atual, que ja calcula no cliente e grava).
-- Ordem importa: anamneses_insert exige has_active_consent, entao o consent
-- e criado ANTES da anamnese, na mesma transacao.
-- =====================================================================
create or replace function public.accept_anamnese_intake(
  p_intake   uuid,
  p_liberado boolean,
  p_nivel    text,
  p_flag     boolean
)
returns uuid
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_intake      public.anamnese_intakes;
  v_anamnese_id uuid;
begin
  -- select sob RLS: intake invisivel = inexistente pro chamador
  select * into v_intake from public.anamnese_intakes where id = p_intake;
  if v_intake.id is null then
    raise exception 'intake inexistente ou sem acesso';
  end if;
  if v_intake.status <> 'submitted' then
    raise exception 'intake nao esta aguardando revisao';
  end if;

  -- 1) consentimento (org_id recopiado do subject pelo trigger consent_b1_org)
  insert into public.consent_records
    (org_id, subject_id, consent_version, consent_text_sha256,
     signer_kind, signer_name, collected_by, user_agent)
  values
    (v_intake.org_id, v_intake.subject_id, v_intake.consent_version, v_intake.consent_text_sha256,
     v_intake.signer_kind, v_intake.signer_name, (select auth.uid()), v_intake.submit_user_agent);

  -- 2) anamnese oficial (evaluator_id default auth.uid(); org_id via trigger)
  insert into public.anamneses
    (org_id, subject_id, assessed_at, spec_version, payload,
     liberado, nivel_encaminhamento, flag_encaminhamento)
  values
    (v_intake.org_id, v_intake.subject_id, coalesce(v_intake.submitted_at::date, current_date),
     v_intake.spec_version, v_intake.payload, p_liberado, p_nivel, p_flag)
  returning id into v_anamnese_id;

  -- 3) marca aceito
  update public.anamnese_intakes
     set status                = 'accepted',
         reviewed_at           = now(),
         reviewed_by           = (select auth.uid()),
         resulting_anamnese_id = v_anamnese_id
   where id = p_intake;

  return v_anamnese_id;
end;
$$;

revoke execute on function public.accept_anamnese_intake(uuid, boolean, text, boolean) from anon, public;
grant execute on function public.accept_anamnese_intake(uuid, boolean, text, boolean) to authenticated;

-- =====================================================================
-- View pending_anamnese_intakes: alimenta badge/dashboard numa query so.
-- security_invoker: a RLS das tabelas de baixo continua valendo pro chamador.
-- =====================================================================
create or replace view public.pending_anamnese_intakes
with (security_invoker = true) as
  select i.id,
         i.org_id,
         i.subject_id,
         s.full_name as subject_name,
         i.submitted_at
    from public.anamnese_intakes i
    join public.subjects s on s.id = i.subject_id
   where i.status = 'submitted';

commit;
