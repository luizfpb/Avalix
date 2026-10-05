-- 0043 — o que só quebrava no celular, do lado do banco.
-- Aplicar depois da 0042. Não apaga nem reescreve dado existente.
--
-- 1. ERROS DAS PÁGINAS DO ALUNO CHEGAM À AUDITORIA. client_errors só aceitava
--    usuário logado, e a página do treino e a anamnese pública são anônimas: o
--    defeito do IndexedDB do iPhone só apareceu porque uma aluna reclamou. A
--    RPC report_link_error recebe o erro pelo token do link e grava na
--    organização dona dele, sem usuário, com teto por link e por organização.
--    O guard da tabela só aceita essa origem dentro do contexto aberto pela
--    própria RPC, no mesmo padrão de app.accepting_intake_id (0020).
--
-- 2. NOME DE QUEM ACEITA O TERMO. A comparação com o cadastro ignorava só
--    maiúsculas e espaços nas pontas: um acento ou um espaço repetido recusava
--    o consentimento, e o aluno da anamnese pública nunca viu o cadastro.
--    app.person_name_key compara sem acento, sem maiúscula e com espaços
--    internos colapsados, no consentimento (trigger) e no envio público. A
--    identidade continua exigida: "Maria Souza" não passa por "Maria da Silva
--    Souza".
--
-- 3. SESSÃO DO PROFISSIONAL IDEMPOTENTE. Resposta perdida depois do commit e
--    nova tentativa criavam uma segunda sessão (create_workout_log e o primeiro
--    salvamento de save_trainer_workout_session). Com p_client_ref a nova
--    tentativa grava na mesma sessão, pelo mesmo índice (plan_id, client_ref)
--    que dá idempotência ao aluno desde a 0027. Sem o parâmetro tudo segue
--    como antes: o frontend publicado continua funcionando com esta migration.
begin;

-- =====================================================================
-- 2. NOME (antes do resto: o consentimento e o envio dependem da função)
-- =====================================================================
create or replace function app.person_name_key(p_name text)
returns text
language sql immutable set search_path = ''
as $$
  select lower(regexp_replace(btrim(translate(coalesce(p_name, ''),
    'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy')), '\s+', ' ', 'g'))
$$;

revoke execute on function app.person_name_key(text) from public;

-- Versão vigente da 0020, com as três comparações de nome por person_name_key.
create or replace function app.consent_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor      uuid := (select auth.uid());
  v_birth      date;
  v_subject_name text;
  v_guardian   text;
  v_controller text;
  v_text       text;
  v_hash       text;
  v_context_intake uuid;
  v_source     public.anamnese_intakes;
  v_is_legacy  boolean := false;
begin
  -- O lock do subject serializa dois novos consentimentos concorrentes.
  perform 1 from public.subjects s where s.id = new.subject_id for update;
  if not found then
    raise exception 'avaliado inexistente';
  end if;

  select s.birth_date, s.full_name, s.guardian_name, o.name
    into v_birth, v_subject_name, v_guardian, v_controller
    from public.subjects s
    join public.organizations o on o.id = s.org_id
   where s.id = new.subject_id;

  if v_birth > current_date - interval '18 years'
     and new.signer_kind <> 'responsavel' then
    raise exception 'menor de idade: o responsavel legal deve aceitar o termo';
  end if;
  if new.signer_kind = 'responsavel' then
    if char_length(coalesce(btrim(v_guardian), '')) < 3 then
      raise exception 'cadastro nao possui responsavel legal valido';
    end if;
    if app.person_name_key(new.signer_name) <> app.person_name_key(v_guardian) then
      raise exception 'quem assina deve ser o responsavel legal cadastrado';
    end if;
  elsif app.person_name_key(new.signer_name) <> app.person_name_key(v_subject_name) then
    raise exception 'quem assina como titular deve ser o avaliado cadastrado';
  end if;

  v_controller := btrim(v_controller);
  v_text := app.canonical_consent_text(v_controller);
  v_hash := encode(sha256(convert_to(v_text, 'UTF8')), 'hex');

  -- source_intake_id e reservado ao accept_anamnese_intake. O contexto local
  -- e definido somente depois que a RPC autentica, autoriza e trava o intake.
  -- Alem do contexto, todos os campos de evidencia precisam coincidir.
  if new.source_intake_id is not null then
    begin
      v_context_intake := nullif(
        current_setting('app.accepting_intake_id', true), ''
      )::uuid;
    exception when invalid_text_representation then
      v_context_intake := null;
    end;
    if v_context_intake is distinct from new.source_intake_id then
      raise exception 'source_intake_id so pode ser definido pela RPC de aceite';
    end if;

    select * into v_source
      from public.anamnese_intakes i
     where i.id = new.source_intake_id and i.status = 'submitted';
    if v_source.id is null
       or v_source.org_id is distinct from new.org_id
       or v_source.consent_version is distinct from new.consent_version
       or lower(v_source.consent_text_sha256) is distinct from lower(new.consent_text_sha256)
       or v_source.signer_kind is distinct from new.signer_kind
       or app.person_name_key(v_source.signer_name) is distinct from app.person_name_key(new.signer_name)
       or v_source.submit_user_agent is distinct from new.user_agent
       or v_source.controller_name_snapshot is distinct from new.controller_name_snapshot
       or v_source.consent_text_snapshot is distinct from new.consent_text_snapshot
       or v_source.payload is null or v_source.submitted_at is null
       or not (
         v_source.subject_id = new.subject_id
         or (v_source.kind = 'cadastro_anamnese' and v_source.subject_id is null)
       ) then
      raise exception 'consentimento nao corresponde ao intake submetido e travado';
    end if;
    v_is_legacy := v_source.consent_version <> app.canonical_consent_version();
    if v_is_legacy and (
      v_source.controller_name_snapshot is not null
      or v_source.consent_text_snapshot is not null
    ) then
      raise exception 'evidencia legada de intake inconsistente';
    end if;
  end if;

  -- Divergencia significa que o cliente nao exibiu o texto canonico atual.
  if new.consent_version is distinct from app.canonical_consent_version()
     or lower(new.consent_text_sha256) is distinct from v_hash then
    if not v_is_legacy then
      raise exception 'versao ou hash do consentimento nao corresponde ao termo atual';
    end if;
  end if;
  if v_actor is not null and new.collected_by is distinct from v_actor then
    raise exception 'collected_by deve ser o usuario autenticado';
  end if;

  -- Revoga o anterior na mesma transacao antes do insert do novo.
  update public.consent_records c
     set revoked_at = greatest(now(), c.granted_at)
   where c.subject_id = new.subject_id
     and c.revoked_at is null;

  if v_is_legacy then
    -- Nao inventa snapshot nem reescreve a prova 1.0 coletada antes da 0020.
    new.consent_version := v_source.consent_version;
    new.consent_text_sha256 := lower(v_source.consent_text_sha256);
    new.controller_name_snapshot := v_source.controller_name_snapshot;
    new.consent_text_snapshot := v_source.consent_text_snapshot;
  else
    new.consent_version := app.canonical_consent_version();
    new.consent_text_sha256 := v_hash;
    new.controller_name_snapshot := v_controller;
    new.consent_text_snapshot := v_text;
  end if;
  new.granted_at := now();
  new.revoked_at := null;
  new.user_agent := left(new.user_agent, 400);
  return new;
end;
$$;

-- Versão vigente da 0028, com as duas comparações de nome por person_name_key.
-- Assinatura idêntica: os grants continuam valendo.
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
  v_intake      public.anamnese_intakes;
  v_birth       date;
  v_subject_name text;
  v_guardian    text;
  v_relation    text;
  v_controller  text;
  v_text        text;
  v_hash        text;
begin
  if p_token is null or char_length(p_token) not between 32 and 256 then
    raise exception 'token invalido';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload obrigatorio ou invalido';
  end if;
  if pg_column_size(p_payload) > 100000 then
    raise exception 'respostas grandes demais';
  end if;
  perform app.assert_anamnese_payload_complete(p_payload);
  if p_registration is not null and (
    jsonb_typeof(p_registration) <> 'object' or pg_column_size(p_registration) > 20000
  ) then
    raise exception 'cadastro invalido ou grande demais';
  end if;
  if p_signer_kind not in ('titular', 'responsavel') then
    raise exception 'signer_kind invalido';
  end if;
  if char_length(coalesce(btrim(p_signer_name), '')) not between 3 and 160 then
    raise exception 'nome de quem assina o consentimento e invalido';
  end if;

  select * into v_intake
    from public.anamnese_intakes i
   where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and i.status = 'pending'
     and i.expires_at > now()
   for update;
  if v_intake.id is null then
    raise exception 'link invalido, expirado ou ja utilizado';
  end if;
  if v_intake.spec_version <> '1.3' then
    raise exception 'formulario desatualizado; solicite um novo link ao profissional';
  end if;

  select btrim(o.name) into v_controller
    from public.organizations o where o.id = v_intake.org_id;
  v_text := app.canonical_consent_text(v_controller);
  v_hash := encode(sha256(convert_to(v_text, 'UTF8')), 'hex');
  if p_consent_version is distinct from app.canonical_consent_version()
     or lower(p_consent_text_sha256) is distinct from v_hash then
    raise exception 'versao ou hash do consentimento nao corresponde ao termo atual';
  end if;

  if v_intake.kind = 'cadastro_anamnese' then
    if p_registration is null then
      raise exception 'cadastro obrigatorio neste link';
    end if;
    if char_length(coalesce(btrim(p_registration->>'full_name'), '')) not between 1 and 160 then
      raise exception 'nome completo invalido';
    end if;
    if coalesce(p_registration->>'sex', '') not in ('M', 'F') then
      raise exception 'sexo invalido';
    end if;
    begin
      v_birth := (p_registration->>'birth_date')::date;
    exception when others then
      raise exception 'data de nascimento invalida';
    end;
    if v_birth is null or v_birth <= date '1900-01-01' or v_birth > current_date then
      raise exception 'data de nascimento invalida';
    end if;
    v_guardian := nullif(btrim(p_registration->>'guardian_name'), '');
    v_relation := nullif(btrim(p_registration->>'guardian_relationship'), '');
    v_subject_name := btrim(p_registration->>'full_name');
  else
    if p_registration is not null then
      raise exception 'este link nao aceita cadastro';
    end if;
    select s.birth_date, s.full_name, s.guardian_name, s.guardian_relationship
      into v_birth, v_subject_name, v_guardian, v_relation
      from public.subjects s where s.id = v_intake.subject_id;
    if v_birth is null then
      raise exception 'avaliado do intake nao existe';
    end if;
  end if;

  if v_birth > current_date - interval '18 years' then
    if p_signer_kind <> 'responsavel'
       or char_length(coalesce(v_guardian, '')) < 3
       or char_length(coalesce(v_relation, '')) < 2 then
      raise exception 'menor de idade exige aceite e cadastro do responsavel legal';
    end if;
  end if;
  if p_signer_kind = 'responsavel' then
    if char_length(coalesce(v_guardian, '')) < 3
       or app.person_name_key(p_signer_name) <> app.person_name_key(v_guardian) then
      raise exception 'quem assina deve ser o responsavel legal cadastrado';
    end if;
  elsif app.person_name_key(p_signer_name) <> app.person_name_key(v_subject_name) then
    raise exception 'quem assina como titular deve ser o avaliado cadastrado';
  end if;

  update public.anamnese_intakes
     set status                   = 'submitted',
         submitted_at             = now(),
         payload                  = p_payload,
         registration             = p_registration,
         signer_kind              = p_signer_kind,
         signer_name              = btrim(p_signer_name),
         consent_version          = app.canonical_consent_version(),
         consent_text_sha256      = v_hash,
         controller_name_snapshot = v_controller,
         consent_text_snapshot    = v_text,
         submit_user_agent        = left(p_user_agent, 400)
   where id = v_intake.id;
end;
$$;

-- =====================================================================
-- 1. ERROS DAS PÁGINAS DO ALUNO
-- =====================================================================
alter table public.client_errors
  add column source text not null default 'app'
    check (source in ('app', 'treino', 'anamnese')),
  add column source_ref uuid;

alter table public.client_errors
  add constraint client_errors_source_ref_chk
  check ((source = 'app') = (source_ref is null));

create index client_errors_source_ref_at_idx
  on public.client_errors (source_ref, at desc)
  where source_ref is not null;

create or replace function app.client_error_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_link  uuid;
begin
  begin
    v_link := nullif(current_setting('app.reporting_link_error', true), '')::uuid;
  exception when invalid_text_representation then
    v_link := null;
  end;

  if v_link is not null then
    -- Só report_link_error abre este contexto, depois de validar o token. O
    -- link ainda precisa ser da organização gravada.
    if new.source not in ('treino', 'anamnese') or new.source_ref is distinct from v_link
       or (new.source = 'treino' and not exists (
             select 1 from public.workout_links l
              where l.id = v_link and l.org_id = new.org_id))
       or (new.source = 'anamnese' and not exists (
             select 1 from public.anamnese_intakes i
              where i.id = v_link and i.org_id = new.org_id)) then
      raise exception 'registro de erro de link invalido';
    end if;
    new.user_id := null;
  else
    if new.source is distinct from 'app' or new.source_ref is not null then
      raise exception 'origem do registro de erro invalida';
    end if;
    if v_actor is null or not app.is_member(new.org_id) then
      raise exception 'usuario nao pertence a organizacao';
    end if;
    if (select count(*) from public.client_errors e
         where e.user_id = v_actor and e.at > now() - interval '1 hour') >= 120 then
      raise exception 'limite de registros de erro atingido';
    end if;
    new.user_id := v_actor;
  end if;
  new.at := now();
  new.message := btrim(new.message);
  new.url := left(
    regexp_replace(new.url, '(/a/)[^/?#]+', E'\\1[redacted]', 'g'), 300
  );
  new.stack := left(new.stack, 4000);
  new.user_agent := left(new.user_agent, 400);
  return new;
end;
$$;

revoke execute on function app.client_error_guard() from public;

-- Silenciosa em toda recusa: a telemetria não pode virar oráculo de token nem
-- erro na tela de quem já está com problema.
create or replace function public.report_link_error(
  p_kind       text,
  p_token      text,
  p_message    text,
  p_stack      text default null,
  p_user_agent text default null
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hash text;
  v_ref  uuid;
  v_org  uuid;
begin
  if p_kind is null or p_kind not in ('treino', 'anamnese')
     or p_token is null or char_length(p_token) not between 32 and 256
     or char_length(coalesce(btrim(p_message), '')) = 0 then
    return;
  end if;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  if p_kind = 'treino' then
    select l.id, l.org_id into v_ref, v_org
      from public.workout_links l
     where l.token_hash = v_hash and l.status = 'active' and l.expires_at > now();
  else
    -- Depois do envio o convite deixa de ser "pending", mas a tela ainda pode
    -- falhar (resposta perdida, reenvio): um dia de tolerância.
    select i.id, i.org_id into v_ref, v_org
      from public.anamnese_intakes i
     where i.token_hash = v_hash
       and ((i.status = 'pending' and i.expires_at > now())
         or (i.status = 'submitted' and i.submitted_at > now() - interval '1 day'));
  end if;
  if v_ref is null then
    return;
  end if;

  -- Tetos: um aparelho em laço de erro não enche a tabela da organização.
  if (select count(*) from public.client_errors e
       where e.source_ref = v_ref and e.at > now() - interval '1 hour') >= 30
     or (select count(*) from public.client_errors e
          where e.org_id = v_org and e.source <> 'app'
            and e.at > now() - interval '1 hour') >= 300 then
    return;
  end if;

  perform set_config('app.reporting_link_error', v_ref::text, true);
  insert into public.client_errors
    (org_id, user_id, message, stack, url, user_agent, source, source_ref)
  values
    (v_org, null, left(btrim(p_message), 600), left(p_stack, 4000),
     case p_kind when 'treino' then '/t' else '/a' end,
     left(p_user_agent, 400), p_kind, v_ref);
  perform set_config('app.reporting_link_error', '', true);
end;
$$;

revoke execute on function public.report_link_error(text, text, text, text, text) from public;
grant execute on function public.report_link_error(text, text, text, text, text) to anon, authenticated;

-- =====================================================================
-- 3. SESSÃO DO PROFISSIONAL IDEMPOTENTE
-- A assinatura ganha p_client_ref: drop antes do create, para o PostgREST não
-- ficar com duas sobrecargas ambíguas (o mesmo cuidado da 0038).
-- =====================================================================
drop function public.create_workout_log(uuid, jsonb, text, int, date, text);

create function public.create_workout_log(
  p_plan         uuid,
  p_sets         jsonb,
  p_day_label    text default null,
  p_week_number  int default null,
  p_performed_at date default null,
  p_notes        text default null,
  p_client_ref   uuid default null
)
returns public.workout_logs
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_log public.workout_logs;
  v_s   jsonb;
begin
  -- Nova tentativa de uma gravação cuja resposta se perdeu depois do commit:
  -- é a mesma sessão, e o que chega agora é o conteúdo dela.
  if p_client_ref is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(p_plan::text || ':' || p_client_ref::text, 0)
    );
    select * into v_log
      from public.workout_logs l
     where l.plan_id = p_plan and l.client_ref = p_client_ref
     for update;
  end if;

  if v_log.id is null then
    insert into public.workout_logs
      (plan_id, day_label, week_number, performed_at, notes, client_ref)
    values
      (p_plan, p_day_label, p_week_number, coalesce(p_performed_at, current_date),
       p_notes, p_client_ref)
    returning * into v_log;
  else
    if v_log.source <> 'trainer' then
      raise exception 'registro de treino indisponivel';
    end if;
    -- Corrigida pelo histórico depois da gravação original: a correção vale.
    if v_log.corrected_at is not null then
      return v_log;
    end if;
    update public.workout_logs
       set day_label = p_day_label,
           week_number = p_week_number,
           performed_at = coalesce(p_performed_at, v_log.performed_at),
           notes = p_notes,
           in_progress = false
     where id = v_log.id
     returning * into v_log;
    delete from public.workout_log_sets where log_id = v_log.id;
  end if;

  for v_s in select * from jsonb_array_elements(coalesce(p_sets, '[]'::jsonb)) loop
    insert into public.workout_log_sets
      (org_id, log_id, exercise_id, set_number, weight_kg, reps, rir, rest_seconds, reached_failure)
    values
      (v_log.org_id, v_log.id, (v_s->>'exercise_id')::uuid, (v_s->>'set_number')::int,
       (v_s->>'weight_kg')::numeric, (v_s->>'reps')::int, (v_s->>'rir')::numeric,
       (v_s->>'rest_seconds')::int, (v_s->>'reached_failure')::boolean);
  end loop;

  return v_log;
end;
$$;

revoke execute on function public.create_workout_log(uuid, jsonb, text, int, date, text, uuid)
  from public, anon;
grant execute on function public.create_workout_log(uuid, jsonb, text, int, date, text, uuid)
  to authenticated;

drop function public.save_trainer_workout_session(
  uuid, jsonb, boolean, uuid, timestamptz, text, int, date, text);

create function public.save_trainer_workout_session(
  p_plan                uuid,
  p_sets                jsonb,
  p_in_progress         boolean,
  p_log                 uuid default null,
  p_expected_updated_at timestamptz default null,
  p_day_label           text default null,
  p_week_number         int default null,
  p_performed_at        date default null,
  p_notes               text default null,
  p_client_ref          uuid default null
)
returns public.workout_logs
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_log public.workout_logs;
begin
  if p_in_progress is null then
    raise exception 'informe se a sessao continua em andamento';
  end if;
  if p_sets is null or jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) < 1 then
    raise exception 'series obrigatorias';
  end if;
  if p_performed_at is not null and (p_performed_at > current_date or not isfinite(p_performed_at)) then
    raise exception 'data de execucao invalida';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_sets) s
     group by (s->>'exercise_id'), (s->>'set_number') having count(*) > 1
  ) then
    raise exception 'serie repetida no envio';
  end if;

  if p_log is null then
    -- Nova tentativa do primeiro salvamento (resposta perdida): a mesma sessão.
    if p_client_ref is not null then
      perform pg_advisory_xact_lock(
        hashtextextended(p_plan::text || ':' || p_client_ref::text, 0)
      );
      select * into v_log
        from public.workout_logs l
       where l.plan_id = p_plan and l.client_ref = p_client_ref
       for update;
    end if;
    if v_log.id is null then
      insert into public.workout_logs
        (plan_id, day_label, week_number, performed_at, notes, in_progress, client_ref)
      values
        (p_plan, p_day_label, p_week_number, coalesce(p_performed_at, current_date),
         p_notes, p_in_progress, p_client_ref)
      returning * into v_log;
    else
      if v_log.source <> 'trainer' then
        raise exception 'registro de treino indisponivel';
      end if;
      if not v_log.in_progress then
        raise exception 'esta sessao ja foi concluida; corrija pelo historico de sessoes';
      end if;
      update public.workout_logs
         set day_label = p_day_label,
             week_number = p_week_number,
             performed_at = coalesce(p_performed_at, v_log.performed_at),
             notes = p_notes,
             in_progress = p_in_progress
       where id = v_log.id
       returning * into v_log;
      delete from public.workout_log_sets where log_id = v_log.id;
    end if;
  else
    if p_expected_updated_at is null then
      raise exception 'versao do registro de treino obrigatoria';
    end if;
    select * into v_log from public.workout_logs where id = p_log for update;
    if v_log.id is null or v_log.plan_id is distinct from p_plan then
      raise exception 'registro de treino indisponivel';
    end if;
    if v_log.source <> 'trainer' or not v_log.in_progress then
      raise exception 'esta sessao ja foi concluida; corrija pelo historico de sessoes';
    end if;
    if v_log.updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = '40001',
        message = 'esta sessao foi salva em outro aparelho; abra-a de novo antes de continuar';
    end if;
    update public.workout_logs
       set day_label = p_day_label,
           week_number = p_week_number,
           performed_at = coalesce(p_performed_at, v_log.performed_at),
           notes = p_notes,
           in_progress = p_in_progress
     where id = p_log
     returning * into v_log;
    delete from public.workout_log_sets where log_id = v_log.id;
  end if;

  insert into public.workout_log_sets
    (org_id, log_id, exercise_id, set_number, weight_kg, reps, rir, rest_seconds, reached_failure)
  select v_log.org_id, v_log.id,
         (s->>'exercise_id')::uuid, (s->>'set_number')::int,
         (s->>'weight_kg')::numeric, (s->>'reps')::int, (s->>'rir')::numeric,
         (s->>'rest_seconds')::int, (s->>'reached_failure')::boolean
    from jsonb_array_elements(p_sets) s;

  return v_log;
end;
$$;

revoke execute on function public.save_trainer_workout_session(
  uuid, jsonb, boolean, uuid, timestamptz, text, int, date, text, uuid) from public, anon;
grant execute on function public.save_trainer_workout_session(
  uuid, jsonb, boolean, uuid, timestamptz, text, int, date, text, uuid) to authenticated;

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0043'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
