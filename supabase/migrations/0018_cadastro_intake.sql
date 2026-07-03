-- Avalix - migration 0018: cadastro feito pelo proprio aluno via link
-- Depende de 0001-0017. Nao apaga dado; estende anamnese_intakes e as RPCs.
-- Spec: docs/anamnese_link_aluno_spec.md (secao "cadastro pelo aluno").
--
-- Ideia: alem do link de anamnese amarrado a um avaliado existente (0017),
-- o personal pode gerar um link de CADASTRO: o aluno preenche os proprios
-- dados (nome, nascimento, sexo, etc.) E a anamnese numa pagina so. Nada
-- vira registro oficial no envio: o cadastro fica no jsonb `registration`
-- do intake e o avaliado (subjects) so e criado no ACEITE do personal, na
-- mesma transacao que cria consentimento + anamnese. Mesmo checkpoint humano
-- da 0017 (D1), mesmo token capability de uso unico (D2/D3).
--
-- Convivencia dos dois tipos na mesma tabela via coluna `kind`:
--   kind = 'anamnese'          -> subject_id obrigatorio (fluxo 0017, intacto)
--   kind = 'cadastro_anamnese' -> subject_id nulo; org_id vem do gerador do
--                                 link; o avaliado nasce no aceite e fica em
--                                 resulting_subject_id.

begin;

-- =====================================================================
-- TABELA: colunas novas + subject_id opcional
-- =====================================================================
alter table public.anamnese_intakes
  add column kind text not null default 'anamnese'
    check (kind in ('anamnese', 'cadastro_anamnese')),
  -- dados do cadastro preenchidos pelo aluno, no formato do formulario
  -- (strings, mesmo shape do SubjectFormValues do front). Fonte de verdade
  -- ate o aceite; revalidado com zod no cliente do personal antes de aceitar.
  add column registration jsonb,
  add column resulting_subject_id uuid references public.subjects(id) on delete set null;

alter table public.anamnese_intakes
  alter column subject_id drop not null;

-- kind e subject_id andam juntos: anamnese pura sempre tem avaliado,
-- cadastro nunca tem (o resultado vai em resulting_subject_id).
alter table public.anamnese_intakes
  add constraint anamnese_intakes_kind_subject_chk
  check ((kind = 'anamnese') = (subject_id is not null));

-- listagem barata dos convites de cadastro "vivos" na tela de avaliados
create index anamnese_intakes_registration_idx
  on public.anamnese_intakes (org_id, created_at desc)
  where kind = 'cadastro_anamnese' and status in ('pending', 'submitted');

-- =====================================================================
-- TRIGGER b1: org_from_subject exige subject; agora o subject e opcional.
-- Com avaliado: copia a org dele (ignora o que veio do cliente), como antes.
-- Sem avaliado: mantem o org_id enviado — a policy de INSERT (abaixo) e quem
-- valida que o criador e membro dessa org.
-- =====================================================================
create or replace function app.intake_org()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.subject_id is not null then
    select s.org_id into new.org_id from public.subjects s where s.id = new.subject_id;
    if new.org_id is null then
      raise exception 'subject inexistente';
    end if;
  elsif new.org_id is null then
    raise exception 'org_id e obrigatorio em intake sem avaliado';
  end if;
  return new;
end;
$$;

drop trigger anamnese_intakes_b1_org on public.anamnese_intakes;
create trigger anamnese_intakes_b1_org
  before insert on public.anamnese_intakes
  for each row execute function app.intake_org();

-- kind tambem congela (mudar o tipo depois de criado nao faz sentido)
drop trigger anamnese_intakes_freeze on public.anamnese_intakes;
create trigger anamnese_intakes_freeze
  before update on public.anamnese_intakes
  for each row execute function app.freeze_columns('org_id', 'subject_id', 'token_hash', 'created_by', 'kind');

-- =====================================================================
-- RLS: intake sem avaliado nao passa em can_view_subject_id (subject nulo).
-- Nessa variante a visibilidade e por org (is_member + mfa, o mesmo rigor que
-- can_view_subject aplica desde a 0003). V1 opera solo; quando houver equipe,
-- todo membro ve os convites de cadastro da org — aceitavel, o conteudo e um
-- cadastro que ainda nem existe e quem aceita vira o avaliador responsavel.
-- =====================================================================
drop policy anamnese_intakes_select on public.anamnese_intakes;
create policy anamnese_intakes_select on public.anamnese_intakes
  for select to authenticated
  using (
    case when subject_id is null
         then app.is_member(org_id) and app.mfa_satisfied()
         else app.can_view_subject_id(subject_id)
    end
  );

drop policy anamnese_intakes_insert on public.anamnese_intakes;
create policy anamnese_intakes_insert on public.anamnese_intakes
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and case when subject_id is null
             then app.is_member(org_id) and app.mfa_satisfied()
             else app.can_view_subject_id(subject_id)
        end
  );

drop policy anamnese_intakes_update on public.anamnese_intakes;
create policy anamnese_intakes_update on public.anamnese_intakes
  for update to authenticated
  using (
    case when subject_id is null
         then app.is_member(org_id) and app.mfa_satisfied()
         else app.can_view_subject_id(subject_id)
    end
  )
  with check (
    case when subject_id is null
         then app.is_member(org_id) and app.mfa_satisfied()
         else app.can_view_subject_id(subject_id)
    end
  );

drop policy anamnese_intakes_delete on public.anamnese_intakes;
create policy anamnese_intakes_delete on public.anamnese_intakes
  for delete to authenticated
  using (
    case when subject_id is null
         then app.is_member(org_id) and app.mfa_satisfied()
         else app.can_view_subject_id(subject_id)
    end
  );

-- =====================================================================
-- RPC get_anamnese_intake: passa a devolver o kind e a tolerar intake sem
-- avaliado (left join; nome/sexo nulos no cadastro — o proprio aluno informa
-- o sexo no formulario). Divulgacao minima continua igual (D5).
-- Return type mudou => drop + create.
-- =====================================================================
drop function public.get_anamnese_intake(text);
create function public.get_anamnese_intake(p_token text)
returns table (
  kind               text,
  org_name           text,
  org_logo_path      text,
  subject_first_name text,
  subject_sex        text,
  spec_version       text
)
language sql stable security definer set search_path = ''
as $$
  select i.kind,
         o.name,
         o.logo_path,
         split_part(s.full_name, ' ', 1),
         s.sex,
         i.spec_version
    from public.anamnese_intakes i
    left join public.subjects s   on s.id = i.subject_id
    join public.organizations o   on o.id = i.org_id
   where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and i.status = 'pending'
     and i.expires_at > now();
$$;

revoke execute on function public.get_anamnese_intake(text) from public;
grant execute on function public.get_anamnese_intake(text) to anon, authenticated;

-- =====================================================================
-- RPC submit_anamnese_intake: ganha p_registration (obrigatorio no cadastro,
-- proibido na anamnese pura). Validacao server-side minima do cadastro (nome,
-- nascimento, sexo) + trava legal: menor de idade exige responsavel no termo.
-- Validacao profunda continua no zod (envio) e e REVALIDADA no aceite; as
-- constraints de subjects sao a rede final quando o avaliado e criado.
-- Assinatura mudou => drop + create (senao viraria overload).
-- =====================================================================
drop function public.submit_anamnese_intake(text, jsonb, text, text, text, text, text);
create function public.submit_anamnese_intake(
  p_token               text,
  p_payload             jsonb,
  p_signer_kind         text,
  p_signer_name         text,
  p_consent_version     text,
  p_consent_text_sha256 text,
  p_user_agent          text,
  p_registration        jsonb default null
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_intake public.anamnese_intakes;
  v_birth  date;
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

  -- for update: dois envios simultaneos do mesmo link nao passam os dois
  select * into v_intake
    from public.anamnese_intakes
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and status = 'pending'
     and expires_at > now()
   for update;

  if v_intake.id is null then
    raise exception 'link invalido, expirado ou ja utilizado';
  end if;

  if v_intake.kind = 'cadastro_anamnese' then
    if p_registration is null then
      raise exception 'cadastro obrigatorio neste link';
    end if;
    if char_length(coalesce(btrim(p_registration->>'full_name'), '')) < 1 then
      raise exception 'nome completo e obrigatorio';
    end if;
    if coalesce(p_registration->>'sex', '') not in ('M', 'F') then
      raise exception 'sexo invalido';
    end if;
    begin
      v_birth := (p_registration->>'birth_date')::date;
    exception when others then
      raise exception 'data de nascimento invalida';
    end;
    if v_birth is null then
      raise exception 'data de nascimento e obrigatoria';
    end if;
    if v_birth > current_date - interval '18 years' and p_signer_kind <> 'responsavel' then
      raise exception 'menor de idade: o responsavel legal deve aceitar o termo';
    end if;
  elsif p_registration is not null then
    raise exception 'este link nao aceita cadastro';
  end if;

  update public.anamnese_intakes
     set status              = 'submitted',
         submitted_at        = now(),
         payload             = p_payload,
         registration        = p_registration,
         signer_kind         = p_signer_kind,
         signer_name         = left(btrim(p_signer_name), 160),  -- consent_records exige 3..160
         consent_version     = p_consent_version,
         consent_text_sha256 = p_consent_text_sha256,
         submit_user_agent   = left(p_user_agent, 400)
   where id = v_intake.id;
end;
$$;

revoke execute on function public.submit_anamnese_intake(text, jsonb, text, text, text, text, text, jsonb) from public;
grant execute on function public.submit_anamnese_intake(text, jsonb, text, text, text, text, text, jsonb) to anon, authenticated;

-- =====================================================================
-- RPC accept_anamnese_intake: no cadastro, cria o avaliado ANTES do consent
-- e da anamnese, tudo na mesma transacao. security INVOKER: a policy
-- subjects_insert (is_member + mfa) e o trigger check_evaluator valem por
-- dentro — quem aceita vira o avaliador responsavel (default auth.uid()).
-- p_subject vem do TS ja validado pelo MESMO zod do cadastro manual e
-- convertido por formToInsert (a org e sempre a do intake, nao a do cliente).
-- Return/assinatura mudaram => drop + create; devolve tambem o subject pro
-- front navegar ate o avaliado recem-criado.
-- =====================================================================
drop function public.accept_anamnese_intake(uuid, boolean, text, boolean);
create function public.accept_anamnese_intake(
  p_intake   uuid,
  p_liberado boolean,
  p_nivel    text,
  p_flag     boolean,
  p_subject  jsonb default null
)
returns table (subject_id uuid, anamnese_id uuid)
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_intake      public.anamnese_intakes;
  v_subject_id  uuid;
  v_anamnese_id uuid;
begin
  -- select sob RLS: intake invisivel = inexistente pro chamador
  select * into v_intake from public.anamnese_intakes i where i.id = p_intake;
  if v_intake.id is null then
    raise exception 'intake inexistente ou sem acesso';
  end if;
  if v_intake.status <> 'submitted' then
    raise exception 'intake nao esta aguardando revisao';
  end if;

  if v_intake.kind = 'cadastro_anamnese' then
    if p_subject is null then
      raise exception 'dados do cadastro sao obrigatorios no aceite';
    end if;
    -- 0) avaliado (constraints da tabela validam dominio; evaluator = quem aceita)
    insert into public.subjects
      (org_id, full_name, birth_date, sex, height_cm, phone, email, notes,
       guardian_name, guardian_relationship)
    values
      (v_intake.org_id,
       btrim(p_subject->>'full_name'),
       (p_subject->>'birth_date')::date,
       p_subject->>'sex',
       nullif(coalesce(p_subject->>'height_cm', ''), '')::numeric,
       nullif(btrim(coalesce(p_subject->>'phone', '')), ''),
       nullif(btrim(coalesce(p_subject->>'email', '')), ''),
       nullif(btrim(coalesce(p_subject->>'notes', '')), ''),
       nullif(btrim(coalesce(p_subject->>'guardian_name', '')), ''),
       nullif(btrim(coalesce(p_subject->>'guardian_relationship', '')), ''))
    returning id into v_subject_id;
  else
    if p_subject is not null then
      raise exception 'este intake ja pertence a um avaliado';
    end if;
    v_subject_id := v_intake.subject_id;
  end if;

  -- 1) consentimento (org_id recopiado do subject pelo trigger consent_b1_org)
  insert into public.consent_records
    (org_id, subject_id, consent_version, consent_text_sha256,
     signer_kind, signer_name, collected_by, user_agent)
  values
    (v_intake.org_id, v_subject_id, v_intake.consent_version, v_intake.consent_text_sha256,
     v_intake.signer_kind, v_intake.signer_name, (select auth.uid()), v_intake.submit_user_agent);

  -- 2) anamnese oficial (evaluator_id default auth.uid(); org_id via trigger)
  insert into public.anamneses
    (org_id, subject_id, assessed_at, spec_version, payload,
     liberado, nivel_encaminhamento, flag_encaminhamento)
  values
    (v_intake.org_id, v_subject_id, coalesce(v_intake.submitted_at::date, current_date),
     v_intake.spec_version, v_intake.payload, p_liberado, p_nivel, p_flag)
  returning id into v_anamnese_id;

  -- 3) marca aceito (subject_id do intake fica nulo/congelado; o resultado
  --    mora em resulting_subject_id)
  update public.anamnese_intakes
     set status                = 'accepted',
         reviewed_at           = now(),
         reviewed_by           = (select auth.uid()),
         resulting_anamnese_id = v_anamnese_id,
         resulting_subject_id  = case when v_intake.kind = 'cadastro_anamnese'
                                      then v_subject_id else null end
   where id = p_intake;

  return query select v_subject_id, v_anamnese_id;
end;
$$;

revoke execute on function public.accept_anamnese_intake(uuid, boolean, text, boolean, jsonb) from anon, public;
grant execute on function public.accept_anamnese_intake(uuid, boolean, text, boolean, jsonb) to authenticated;

-- =====================================================================
-- View pending_anamnese_intakes: cadastros pendentes tambem aparecem no
-- badge/dashboard. Sem avaliado, o nome vem do registration. `kind` entra
-- no fim (create or replace so permite acrescentar coluna no final).
-- =====================================================================
create or replace view public.pending_anamnese_intakes
with (security_invoker = true) as
  select i.id,
         i.org_id,
         i.subject_id,
         coalesce(s.full_name, i.registration->>'full_name') as subject_name,
         i.submitted_at,
         i.kind
    from public.anamnese_intakes i
    left join public.subjects s on s.id = i.subject_id
   where i.status = 'submitted';

commit;
