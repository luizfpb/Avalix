-- Avalix - migration 0019: v2.0 - correcoes da auditoria tecnica (jul/2026)
-- Depende de 0001-0018. Nao apaga dado; troca funcoes, adiciona constraint,
-- RPCs atomicas e a tabela client_errors.
-- ATENCAO: aplicar ANTES de subir o codigo da v2.0 (igual 0013/0016/0017/0018):
--   * get_anamnese_intake muda o TIPO DE RETORNO (drop + create);
--   * o app passa a chamar save_assessment e create_workout_log.
--
-- Cobre 6 achados da auditoria:
--   #4 accept_anamnese_intake sem "for update" -> dois aceites simultaneos
--      passavam ambos (duplicando subject/consent/anamnese no cadastro).
--   #5 payload anonimo sem limite de tamanho -> cap por pg_column_size.
--   #6 menor de idade no fluxo de anamnese pura (subject existente) nao tinha
--      trava server-side (so o cadastro tinha) -> agora checa o birth_date do
--      subject e exige signer 'responsavel' (LGPD art. 14).
--   #7 get_anamnese_intake devolvia o logo_path ({org_id}/logo.ext) pro anonimo
--      -> divulgacao desnecessaria do uuid da org; o front nem usava.
--   #8 expires_at do intake era definido so no cliente -> teto de 30 dias no
--      banco (o desenho de seguranca do token mora aqui, nao no front).
--   #3 saves multi-chamada que ficaram fora da 0016: save_assessment (header +
--      leituras numa transacao; antes o snapshot novo podia ficar com leituras
--      velhas se a 2a chamada falhasse) e create_workout_log (log + series;
--      antes uma falha nas series deixava sessao vazia contando na adesao).
--
-- E o achado de observabilidade (pergunta #5 da auditoria): client_errors,
-- registro minimo de erros de runtime do front (sem servico externo, free tier).

begin;

-- =====================================================================
-- #8 - teto de validade do link de intake (o cliente define 7 dias; o
-- banco garante que nenhum cliente/bug crie link eterno)
-- =====================================================================
alter table public.anamnese_intakes
  add constraint anamnese_intakes_ttl_chk
  check (expires_at <= created_at + interval '30 days');

-- =====================================================================
-- #7 - get_anamnese_intake sem logo_path (divulgacao minima de verdade).
-- Tipo de retorno mudou => drop + create.
-- =====================================================================
drop function public.get_anamnese_intake(text);
create function public.get_anamnese_intake(p_token text)
returns table (
  kind               text,
  org_name           text,
  subject_first_name text,
  subject_sex        text,
  spec_version       text
)
language sql stable security definer set search_path = ''
as $$
  select i.kind,
         o.name,
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
-- #5 + #6 - submit_anamnese_intake: cap de tamanho nos jsonb (o token e a
-- credencial, mas o portador controla o request) e trava de menor tambem no
-- fluxo de anamnese pura (le o birth_date do subject; security definer pode).
-- Mesma assinatura => create or replace.
-- =====================================================================
create or replace function public.submit_anamnese_intake(
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
  -- caps de tamanho: as respostas reais tem poucos KB; 100/20 KB e folga
  -- generosa que corta abuso de armazenamento por link vazado
  if pg_column_size(p_payload) > 100000 then
    raise exception 'respostas grandes demais';
  end if;
  if p_registration is not null and pg_column_size(p_registration) > 20000 then
    raise exception 'cadastro grande demais';
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
  else
    if p_registration is not null then
      raise exception 'este link nao aceita cadastro';
    end if;
    -- #6: subject existente menor de idade exige responsavel no termo. A RPC
    -- publica nao devolve o nascimento (divulgacao minima), entao a trava so
    -- pode morar aqui no servidor.
    select s.birth_date into v_birth
      from public.subjects s
     where s.id = v_intake.subject_id;
    if v_birth is not null
       and v_birth > current_date - interval '18 years'
       and p_signer_kind <> 'responsavel' then
      raise exception 'menor de idade: o responsavel legal deve aceitar o termo';
    end if;
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
-- #4 - accept_anamnese_intake com "for update": dois aceites simultaneos
-- (duas abas, aceitar+recusar) nao passam os dois. Mesma assinatura =>
-- create or replace; corpo identico ao da 0018 fora o lock.
-- =====================================================================
create or replace function public.accept_anamnese_intake(
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
  -- select sob RLS + lock: intake invisivel = inexistente pro chamador;
  -- aceite/recusa concorrente espera o lock e cai no check de status
  select * into v_intake from public.anamnese_intakes i where i.id = p_intake for update;
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
-- #3a - save_assessment: header + leituras numa transacao so. A 0016 tornou
-- atomico o delete+reinsert das filhas; faltava amarrar o update do header
-- (snapshot results) na MESMA transacao - falha nas leituras nao pode deixar
-- snapshot novo com leituras velhas (PDF e evolucao divergiriam).
-- SECURITY INVOKER: RLS do chamador vale; triggers (freeze/updated_at/audit)
-- disparam normalmente. Reusa replace_assessment_readings por dentro.
-- =====================================================================
-- p_medications/p_notes com default null: omitido = limpa o campo, e o gen
-- types futuro os emite como opcionais (o front pode simplesmente nao enviar)
create or replace function public.save_assessment(
  p_assessment     uuid,
  p_assessed_at    date,
  p_protocol_id    text,
  p_weight_kg      numeric,
  p_height_cm      numeric,
  p_results        jsonb,
  p_engine_version text,
  p_skinfolds      jsonb,
  p_circumferences jsonb,
  p_medications    text default null,
  p_notes          text default null
)
returns public.assessments
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_row public.assessments;
begin
  update public.assessments
     set assessed_at    = p_assessed_at,
         protocol_id    = p_protocol_id,
         weight_kg      = p_weight_kg,
         height_cm      = p_height_cm,
         medications    = p_medications,
         notes          = p_notes,
         results        = p_results,
         engine_version = p_engine_version
   where id = p_assessment
   returning * into v_row;

  if v_row.id is null then
    raise exception 'avaliacao inexistente ou sem acesso';
  end if;

  perform public.replace_assessment_readings(p_assessment, p_skinfolds, p_circumferences);
  return v_row;
end;
$$;

revoke execute on function public.save_assessment(uuid, date, text, numeric, numeric, jsonb, text, jsonb, jsonb, text, text) from anon, public;
grant execute on function public.save_assessment(uuid, date, text, numeric, numeric, jsonb, text, jsonb, jsonb, text, text) to authenticated;

-- =====================================================================
-- #3b - create_workout_log: log + series numa transacao. Antes, series
-- falhando deixavam sessao vazia que contava na adesao. org_id/subject_id
-- vem do plano pelo trigger b1 (org_subject_from_plan) antes do NOT NULL.
-- p_sets: [{exercise_id, set_number, weight_kg, reps, rir}]
-- =====================================================================
create or replace function public.create_workout_log(
  p_plan         uuid,
  p_sets         jsonb,
  p_day_label    text default null,
  p_week_number  int default null,
  p_performed_at date default null,
  p_notes        text default null
)
returns public.workout_logs
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_log public.workout_logs;
  v_s   jsonb;
begin
  insert into public.workout_logs (plan_id, day_label, week_number, performed_at, notes)
  values (p_plan, p_day_label, p_week_number, coalesce(p_performed_at, current_date), p_notes)
  returning * into v_log;

  for v_s in select * from jsonb_array_elements(coalesce(p_sets, '[]'::jsonb)) loop
    insert into public.workout_log_sets
      (org_id, log_id, exercise_id, set_number, weight_kg, reps, rir)
    values
      (v_log.org_id, v_log.id, (v_s->>'exercise_id')::uuid, (v_s->>'set_number')::int,
       (v_s->>'weight_kg')::numeric, (v_s->>'reps')::int, (v_s->>'rir')::numeric);
  end loop;

  return v_log;
end;
$$;

revoke execute on function public.create_workout_log(uuid, jsonb, text, int, date, text) from anon, public;
grant execute on function public.create_workout_log(uuid, jsonb, text, int, date, text) to authenticated;

-- =====================================================================
-- Observabilidade minima (pergunta #5 da auditoria): erros de runtime do
-- front, sem servico externo. O app grava (throttle no cliente); owner/admin
-- le numa pagina propria. Sem update; delete pra limpeza pelo owner/admin.
-- PII: so mensagem/stack/url - nada de payload de formulario.
-- =====================================================================
create table public.client_errors (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  message     text not null check (char_length(message) between 1 and 600),
  stack       text check (stack is null or char_length(stack) <= 4000),
  url         text check (url is null or char_length(url) <= 300),
  user_agent  text check (user_agent is null or char_length(user_agent) <= 400),
  at          timestamptz not null default now()
);

create index client_errors_org_at_idx on public.client_errors (org_id, at desc);

alter table public.client_errors enable row level security;

create policy client_errors_insert on public.client_errors
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and app.is_member(org_id)
  );

create policy client_errors_select on public.client_errors
  for select to authenticated
  using (app.role_in(org_id, array['owner','admin']));

create policy client_errors_delete on public.client_errors
  for delete to authenticated
  using (app.role_in(org_id, array['owner','admin']));

commit;
