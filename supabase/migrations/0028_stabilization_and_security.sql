-- Avalix - migration 0028: estabilização, integridade e limites de segurança
-- Depende de 0001-0027. Aplicar antes de publicar o frontend correspondente.
--
-- Esta migration fecha, numa única janela compatível de rollout:
--   * MFA na leitura administrativa e na escrita de logos;
--   * namespace canônico e limitado para logos;
--   * autoria confiável dos registros de treino;
--   * serialização do limite de organizações;
--   * triagem de anamnese validada e derivada no servidor;
--   * criação atômica de avaliações;
--   * unicidade de exercício por divisão;
--   * histórico público com cursor composto e referências determinísticas;
--   * revogação/expiração observável pelo cliente público.

begin;

-- =====================================================================
-- 1. MFA EM DADOS ADMINISTRATIVOS
-- app.mfa_satisfied() preserva o fluxo de contas sem fator cadastrado e exige
-- AAL2 quando a conta possui MFA, conforme a regra inaugurada na 0003.
-- =====================================================================
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs
  for select to authenticated
  using (
    app.role_in(org_id, array['owner','admin'])
    and app.mfa_satisfied()
  );

drop policy if exists client_errors_select on public.client_errors;
create policy client_errors_select on public.client_errors
  for select to authenticated
  using (
    app.role_in(org_id, array['owner','admin'])
    and app.mfa_satisfied()
  );

drop policy if exists client_errors_delete on public.client_errors;
create policy client_errors_delete on public.client_errors
  for delete to authenticated
  using (
    app.role_in(org_id, array['owner','admin'])
    and app.mfa_satisfied()
  );

-- client_errors_insert permanece deliberadamente sem MFA: erros do próprio
-- fluxo de elevação AAL1 -> AAL2 também precisam poder ser diagnosticados.

-- =====================================================================
-- 2. LOGOS: SOMENTE TRÊS CHAVES CANÔNICAS POR ORGANIZAÇÃO
-- SELECT e DELETE ainda reconhecem paths legados por prefixo para que o app
-- consiga exibir e limpar o passivo. Toda criação/destino de UPDATE, porém,
-- aceita exclusivamente <uuid>/logo.png|jpg|webp.
-- =====================================================================
create or replace function app.canonical_logo_org_id(p_name text)
returns uuid
language sql immutable set search_path = ''
as $$
  select case
    when cardinality(string_to_array(p_name, '/')) = 2
     and split_part(p_name, '/', 1)
         = coalesce(app.uuid_or_null(split_part(p_name, '/', 1))::text, '')
     and split_part(p_name, '/', 2) in ('logo.png', 'logo.jpg', 'logo.webp')
    then app.uuid_or_null(split_part(p_name, '/', 1))
    else null
  end;
$$;

revoke execute on function app.canonical_logo_org_id(text) from public, anon;
grant execute on function app.canonical_logo_org_id(text) to authenticated;

drop policy if exists storage_logos_select on storage.objects;
create policy storage_logos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'logos'
    and app.is_member(app.uuid_or_null((storage.foldername(name))[1]))
  );

drop policy if exists storage_logos_insert on storage.objects;
create policy storage_logos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and app.role_in(app.canonical_logo_org_id(name), array['owner','admin'])
    and app.mfa_satisfied()
  );

drop policy if exists storage_logos_update on storage.objects;
create policy storage_logos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos'
    and app.role_in(app.uuid_or_null((storage.foldername(name))[1]), array['owner','admin'])
    and app.mfa_satisfied()
  )
  with check (
    bucket_id = 'logos'
    and app.role_in(app.canonical_logo_org_id(name), array['owner','admin'])
    and app.mfa_satisfied()
  );

drop policy if exists storage_logos_delete on storage.objects;
create policy storage_logos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos'
    and app.role_in(app.uuid_or_null((storage.foldername(name))[1]), array['owner','admin'])
    and app.mfa_satisfied()
  );

-- =====================================================================
-- 3. AUTORIA DOS TREINOS
-- INSERT REST autenticado representa o profissional. A única escrita legítima
-- source='student' continua sendo submit_workout_session(), security definer.
-- =====================================================================
alter table public.workout_logs
  add column if not exists client_revision integer not null default 0;

alter table public.workout_logs
  drop constraint if exists workout_logs_client_revision_check;
alter table public.workout_logs
  add constraint workout_logs_client_revision_check
  check (client_revision between 0 and 1000000);

drop policy if exists workout_logs_insert on public.workout_logs;
create policy workout_logs_insert on public.workout_logs
  for insert to authenticated
  with check (
    app.can_view_subject_id(subject_id)
    and source = 'trainer'
  );

-- Defesa central para qualquer RPC presente ou futura: uma sessão de aluno não
-- pode nascer ligada a plano draft. Archived permanece aceito para filas
-- offline que sincronizam depois de o treinador publicar um plano novo.
create or replace function app.workout_log_student_plan_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
begin
  if new.source = 'student' then
    select p.status into v_status
      from public.workout_plans p
     where p.id = new.plan_id;
    if v_status is null or v_status not in ('active','archived') then
      raise exception 'sessao do aluno exige plano ativo ou arquivado';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function app.workout_log_student_plan_guard() from public, anon, authenticated;

drop trigger if exists workout_logs_b2_student_plan on public.workout_logs;
create trigger workout_logs_b2_student_plan
  before insert or update on public.workout_logs
  for each row execute function app.workout_log_student_plan_guard();

-- A 0027 já concentra toda a validação de payload, limites e idempotência.
-- Ela vira implementação interna; a fachada 0028 acrescenta uma revisão
-- monotônica e trava plano/sessão antes de delegar. Assim um replay antigo da
-- fila nunca substitui séries mais novas, mesmo vindo de outra aba/dispositivo.
alter function public.submit_workout_session(
  text, uuid, jsonb, text, int, date, text, uuid
) rename to submit_workout_session_0027_internal;

revoke execute on function public.submit_workout_session_0027_internal(
  text, uuid, jsonb, text, int, date, text, uuid
) from public, anon, authenticated;

create function public.submit_workout_session(
  p_token           text,
  p_client_ref      uuid,
  p_sets            jsonb,
  p_day_label       text default null,
  p_week_number     int default null,
  p_performed_at    date default null,
  p_notes           text default null,
  p_plan            uuid default null,
  p_client_revision int default 1
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_subject  uuid;
  v_plan     uuid;
  v_status   text;
  v_log      public.workout_logs;
  v_result   jsonb;
begin
  if p_client_ref is null then
    raise exception 'client_ref obrigatorio';
  end if;
  if p_client_revision is null or p_client_revision not between 1 and 1000000 then
    raise exception 'revisao da sessao fora do limite';
  end if;

  select l.subject_id into v_subject
    from public.workout_links l
   where l.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and l.status = 'active'
     and l.expires_at > now();
  if v_subject is null then
    raise exception 'link invalido ou expirado';
  end if;

  if p_plan is null then
    select p.id, p.status into v_plan, v_status
      from public.workout_plans p
     where p.subject_id = v_subject and p.status = 'active'
     for share;
  else
    select p.id, p.status into v_plan, v_status
      from public.workout_plans p
     where p.id = p_plan and p.subject_id = v_subject
     for share;
    if v_plan is null then
      raise exception 'plano nao pertence a este aluno';
    end if;
  end if;

  if v_plan is null then
    raise exception 'sem treino vigente';
  end if;
  if v_status not in ('active', 'archived') then
    raise exception 'sessao do aluno exige plano ativo ou arquivado';
  end if;

  -- Também cobre a corrida em que duas primeiras gravações ainda não possuem
  -- linha para bloquear. O lock é transacional e não depende de estado global.
  perform pg_advisory_xact_lock(
    hashtextextended(v_plan::text || ':' || p_client_ref::text, 0)
  );

  select * into v_log
    from public.workout_logs l
   where l.plan_id = v_plan and l.client_ref = p_client_ref
   for update;

  if v_log.id is not null and v_log.client_revision > p_client_revision then
    return jsonb_build_object(
      'ok', true,
      'stale', true,
      'log_id', v_log.id,
      'plan_id', v_plan,
      'client_revision', v_log.client_revision
    );
  end if;

  -- A data faz parte da chave de ordenacao do cursor do historico. Depois que
  -- uma sessao existe, mantê-la imutavel impede que uma revisao em voo mova a
  -- linha entre paginas e provoque omissao ou repeticao durante a paginacao.
  v_result := public.submit_workout_session_0027_internal(
    p_token, p_client_ref, p_sets, p_day_label, p_week_number,
    case when v_log.id is null then p_performed_at else v_log.performed_at end,
    p_notes, v_plan
  );

  update public.workout_logs
     set client_revision = p_client_revision
   where id = (v_result->>'log_id')::uuid;

  return v_result || jsonb_build_object(
    'stale', false,
    'client_revision', p_client_revision
  );
end;
$$;

revoke execute on function public.submit_workout_session(
  text, uuid, jsonb, text, int, date, text, uuid, int
) from public;
grant execute on function public.submit_workout_session(
  text, uuid, jsonb, text, int, date, text, uuid, int
) to anon, authenticated;

-- =====================================================================
-- 4. LIMITE DE ORGANIZAÇÕES SEM RACE
-- A linha de profiles é o mutex natural por ator: chamadas concorrentes do
-- mesmo usuário aguardam o mesmo lock antes de contar e inserir.
-- =====================================================================
create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org   uuid;
  v_owned int;
begin
  if v_actor is null then
    raise exception 'nao autenticado';
  end if;
  if not app.mfa_satisfied() then
    raise exception 'verificacao em duas etapas pendente';
  end if;

  perform 1 from public.profiles p where p.id = v_actor for update;
  if not found then
    raise exception 'perfil autenticado inexistente';
  end if;

  select count(*) into v_owned
    from public.org_members m
   where m.user_id = v_actor and m.role = 'owner';
  if v_owned >= 25 then
    raise exception 'limite de organizacoes por usuario atingido';
  end if;

  insert into public.organizations (name) values (p_name) returning id into v_org;
  insert into public.org_members (org_id, user_id, role)
  values (v_org, v_actor, 'owner');
  return v_org;
end;
$$;

revoke execute on function public.create_organization(text) from anon, public;
grant execute on function public.create_organization(text) to authenticated;

-- =====================================================================
-- 5. ANAMNESE: PAYLOAD COMPLETO E GATE DERIVADO NO SERVIDOR
-- A aplicação continua calculando o gate para feedback imediato, mas o banco
-- valida os campos clínicos mínimos e é a autoridade das três colunas.
-- =====================================================================
create or replace function app.assert_anamnese_payload_complete(p_payload jsonb)
returns void
language plpgsql immutable set search_path = ''
as $$
declare
  v_key text;
  v_item jsonb;
  v_text text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload de anamnese deve ser um objeto';
  end if;

  if jsonb_typeof(p_payload->'parq') is distinct from 'object' then
    raise exception 'PAR-Q deve conter exatamente as sete respostas';
  end if;
  if (select count(*) from jsonb_object_keys(p_payload->'parq')) <> 7 then
    raise exception 'PAR-Q deve conter exatamente as sete respostas';
  end if;
  foreach v_key in array array[
    'cardio_dx','dor_toracica','tontura_sincope','condicao_cronica',
    'medicacao_cronica','lesao_atividade','supervisao_medica'
  ] loop
    if not ((p_payload->'parq') ? v_key)
       or jsonb_typeof((p_payload->'parq')->v_key) is distinct from 'boolean' then
      raise exception 'resposta PAR-Q ausente ou invalida: %', v_key;
    end if;
  end loop;

  if jsonb_typeof(p_payload->'ativo_regular') is distinct from 'boolean' then
    raise exception 'pratica regular de exercicio deve ser confirmada';
  end if;
  if p_payload->'doenca_cmr_confirmada' is distinct from 'true'::jsonb then
    raise exception 'doencas cardiovasculares, metabolicas e renais devem ser confirmadas';
  end if;
  if p_payload->'sinais_sintomas_confirmados' is distinct from 'true'::jsonb then
    raise exception 'sinais e sintomas devem ser confirmados';
  end if;

  if jsonb_typeof(p_payload->'doenca_cmr') is distinct from 'array' then
    raise exception 'lista de doencas CMR invalida';
  end if;
  for v_item in select value from jsonb_array_elements(p_payload->'doenca_cmr') loop
    if jsonb_typeof(v_item) is distinct from 'string' then
      raise exception 'lista de doencas CMR deve conter textos';
    end if;
    v_text := v_item #>> '{}';
    if v_text not in ('cardiovascular','metabolica','renal') then
      raise exception 'doenca CMR invalida: %', v_text;
    end if;
  end loop;
  if jsonb_array_length(p_payload->'doenca_cmr') <> (
    select count(distinct value #>> '{}') from jsonb_array_elements(p_payload->'doenca_cmr')
  ) then
    raise exception 'lista de doencas CMR contem duplicatas';
  end if;

  if jsonb_typeof(p_payload->'sinais_sintomas') is distinct from 'array' then
    raise exception 'lista de sinais e sintomas invalida';
  end if;
  for v_item in select value from jsonb_array_elements(p_payload->'sinais_sintomas') loop
    if jsonb_typeof(v_item) is distinct from 'string' then
      raise exception 'lista de sinais e sintomas deve conter textos';
    end if;
    v_text := v_item #>> '{}';
    if v_text not in (
      'dor_toracica','dispneia','tontura_sincope','ortopneia','edema',
      'palpitacoes','claudicacao','sopro','fadiga'
    ) then
      raise exception 'sinal ou sintoma invalido: %', v_text;
    end if;
  end loop;
  if jsonb_array_length(p_payload->'sinais_sintomas') <> (
    select count(distinct value #>> '{}') from jsonb_array_elements(p_payload->'sinais_sintomas')
  ) then
    raise exception 'lista de sinais e sintomas contem duplicatas';
  end if;

  if jsonb_typeof(p_payload->'red_flags') is distinct from 'array' then
    raise exception 'lista de sinais de alerta invalida';
  end if;
  for v_item in select value from jsonb_array_elements(p_payload->'red_flags') loop
    if jsonb_typeof(v_item) is distinct from 'string' then
      raise exception 'lista de sinais de alerta deve conter textos';
    end if;
    v_text := v_item #>> '{}';
    if v_text not in (
      'dor_noturna','perda_peso','deficit_neuro','febre','cancer','esfincter','trauma'
    ) then
      raise exception 'sinal de alerta invalido: %', v_text;
    end if;
  end loop;
  if jsonb_array_length(p_payload->'red_flags') <> (
    select count(distinct value #>> '{}') from jsonb_array_elements(p_payload->'red_flags')
  ) then
    raise exception 'lista de sinais de alerta contem duplicatas';
  end if;

  if p_payload ? 'gestante'
     and jsonb_typeof(p_payload->'gestante') not in ('null','boolean') then
    raise exception 'gestacao deve ser sim, nao ou nao aplicavel';
  end if;
  if p_payload->'declaracao_veracidade' is distinct from 'true'::jsonb
     or p_payload->'consentimento_lgpd' is distinct from 'true'::jsonb then
    raise exception 'declaracao de veracidade e consentimento sao obrigatorios';
  end if;
end;
$$;

create or replace function app.compute_anamnese_gate(p_payload jsonb)
returns table (liberado boolean, nivel text, flag boolean)
language plpgsql immutable set search_path = ''
as $$
declare
  v_parq_yes boolean;
  v_sintomas boolean;
  v_cmr      boolean;
  v_ativo    boolean;
  v_red      boolean;
  v_gestante boolean;
begin
  perform app.assert_anamnese_payload_complete(p_payload);

  select exists (
    select 1 from jsonb_each(p_payload->'parq') e where e.value = 'true'::jsonb
  ) into v_parq_yes;
  v_sintomas := jsonb_array_length(p_payload->'sinais_sintomas') > 0;
  v_cmr := jsonb_array_length(p_payload->'doenca_cmr') > 0;
  v_ativo := (p_payload->>'ativo_regular')::boolean;
  v_red := jsonb_array_length(p_payload->'red_flags') > 0;
  v_gestante := coalesce((p_payload->>'gestante')::boolean, false);

  return query select
    not v_parq_yes,
    case
      when v_sintomas or (v_cmr and not v_ativo) then 'antes_iniciar'
      when v_cmr and v_ativo then 'antes_vigorosa'
      else 'liberado'
    end,
    v_parq_yes or v_sintomas or v_cmr or v_red or v_gestante;
end;
$$;

revoke execute on function app.assert_anamnese_payload_complete(jsonb) from public, anon, authenticated;
revoke execute on function app.compute_anamnese_gate(jsonb) from public, anon, authenticated;

create or replace function app.anamnese_gate_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_gate record;
begin
  select * into strict v_gate from app.compute_anamnese_gate(new.payload);
  new.spec_version := '1.3';
  new.liberado := v_gate.liberado;
  new.nivel_encaminhamento := v_gate.nivel;
  new.flag_encaminhamento := v_gate.flag;
  return new;
end;
$$;

revoke execute on function app.anamnese_gate_guard() from public, anon, authenticated;

drop trigger if exists anamneses_b3_gate_guard on public.anamneses;
create trigger anamneses_b3_gate_guard
  before insert or update of payload, spec_version, liberado,
    nivel_encaminhamento, flag_encaminhamento
  on public.anamneses
  for each row execute function app.anamnese_gate_guard();

-- Versão vigente da RPC anônima da 0020, agora com validação clínica no
-- servidor. A assinatura permanece idêntica para rollout sem ambiguidade.
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
       or lower(btrim(p_signer_name)) <> lower(btrim(v_guardian)) then
      raise exception 'quem assina deve ser o responsavel legal cadastrado';
    end if;
  elsif lower(btrim(p_signer_name)) <> lower(btrim(v_subject_name)) then
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

revoke execute on function public.submit_anamnese_intake(
  text, jsonb, text, text, text, text, text, jsonb
) from public;
grant execute on function public.submit_anamnese_intake(
  text, jsonb, text, text, text, text, text, jsonb
) to anon, authenticated;

-- Aceite continua com a mesma assinatura. Os parâmetros legados de gate são
-- conferidos para detectar frontends divergentes, mas somente o resultado
-- derivado no banco é persistido.
create or replace function public.accept_anamnese_intake(
  p_intake   uuid,
  p_liberado boolean,
  p_nivel    text,
  p_flag     boolean,
  p_subject  jsonb default null
)
returns table (subject_id uuid, anamnese_id uuid)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_intake      public.anamnese_intakes;
  v_subject_id  uuid;
  v_anamnese_id uuid;
  v_actor       uuid := (select auth.uid());
  v_gate        record;
begin
  if v_actor is null or not app.mfa_satisfied() then
    raise exception 'nao autenticado ou MFA pendente';
  end if;
  select * into v_intake
    from public.anamnese_intakes i where i.id = p_intake for update;
  if v_intake.id is null or v_intake.status <> 'submitted'
     or not (case when v_intake.subject_id is null then app.is_member(v_intake.org_id)
                  else app.can_view_subject_id(v_intake.subject_id) end) then
    raise exception 'intake submetido inexistente ou sem acesso';
  end if;
  if v_intake.spec_version <> '1.3' then
    raise exception 'formulario desatualizado; rejeite e emita um novo link';
  end if;

  select * into strict v_gate from app.compute_anamnese_gate(v_intake.payload);
  if p_liberado is distinct from v_gate.liberado
     or p_nivel is distinct from v_gate.nivel
     or p_flag is distinct from v_gate.flag then
    raise exception 'resultado da triagem diverge do payload; recarregue a revisao';
  end if;

  if v_intake.kind = 'cadastro_anamnese' then
    if p_subject is null or jsonb_typeof(p_subject) <> 'object'
       or pg_column_size(p_subject) > 20000 then
      raise exception 'dados do cadastro sao obrigatorios ou invalidos';
    end if;
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

  perform set_config('app.accepting_intake_id', v_intake.id::text, true);
  insert into public.consent_records
    (org_id, subject_id, consent_version, consent_text_sha256,
     signer_kind, signer_name, collected_by, user_agent,
     controller_name_snapshot, consent_text_snapshot, source_intake_id)
  values
    (v_intake.org_id, v_subject_id, v_intake.consent_version,
     v_intake.consent_text_sha256, v_intake.signer_kind, v_intake.signer_name,
     v_actor, v_intake.submit_user_agent, v_intake.controller_name_snapshot,
     v_intake.consent_text_snapshot, v_intake.id);
  perform set_config('app.accepting_intake_id', '', true);

  insert into public.anamneses
    (org_id, subject_id, assessed_at, spec_version, payload,
     liberado, nivel_encaminhamento, flag_encaminhamento)
  values
    (v_intake.org_id, v_subject_id, coalesce(v_intake.submitted_at::date, current_date),
     '1.3', v_intake.payload, v_gate.liberado, v_gate.nivel, v_gate.flag)
  returning id into v_anamnese_id;

  update public.anamnese_intakes
     set status = 'accepted', reviewed_at = now(), reviewed_by = v_actor,
         resulting_anamnese_id = v_anamnese_id,
         resulting_subject_id = case when v_intake.kind = 'cadastro_anamnese'
                                     then v_subject_id else null end
   where id = p_intake;
  return query select v_subject_id, v_anamnese_id;
end;
$$;

revoke execute on function public.accept_anamnese_intake(
  uuid, boolean, text, boolean, jsonb
) from public, anon;
grant execute on function public.accept_anamnese_intake(
  uuid, boolean, text, boolean, jsonb
) to authenticated;

-- =====================================================================
-- 6. AVALIAÇÃO: CRIAÇÃO DO CABEÇALHO E LEITURAS EM UMA TRANSAÇÃO
-- =====================================================================
create or replace function public.create_assessment(
  p_subject       uuid,
  p_assessed_at   date,
  p_protocol_id   text,
  p_weight_kg     numeric,
  p_height_cm     numeric,
  p_results       jsonb,
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
  insert into public.assessments
    (subject_id, assessed_at, protocol_id, weight_kg, height_cm,
     medications, notes, results, engine_version)
  values
    (p_subject, p_assessed_at, p_protocol_id, p_weight_kg, p_height_cm,
     p_medications, p_notes, p_results, p_engine_version)
  returning * into v_row;

  perform public.replace_assessment_readings(v_row.id, p_skinfolds, p_circumferences);
  return v_row;
end;
$$;

revoke execute on function public.create_assessment(
  uuid, date, text, numeric, numeric, jsonb, text, jsonb, jsonb, text, text
) from public, anon;
grant execute on function public.create_assessment(
  uuid, date, text, numeric, numeric, jsonb, text, jsonb, jsonb, text, text
) to authenticated;

create index if not exists assessments_subject_timeline_idx
  on public.assessments (subject_id, assessed_at desc, created_at desc, id desc);

-- =====================================================================
-- 7. PLANO: UM EXERCÍCIO POR DIVISÃO
-- A migration falha de forma explícita se houver passivo: não escolhe nem
-- remove prescrição clínica em silêncio. O preflight 0028 lista as linhas para
-- que o profissional as corrija antes de reaplicar.
-- =====================================================================
do $duplicates$
begin
  if exists (
    select 1 from public.workout_exercises
     group by day_id, exercise_id
    having count(*) > 1
  ) then
    raise exception
      '0028: existem exercicios repetidos na mesma divisao; execute scripts/0028-stabilization-preflight.sql e corrija-os antes de aplicar';
  end if;
end
$duplicates$;

alter table public.workout_exercises
  drop constraint if exists workout_exercises_day_exercise_key;
alter table public.workout_exercises
  add constraint workout_exercises_day_exercise_key unique (day_id, exercise_id);

-- =====================================================================
-- 8. RPCs DO TREINO PÚBLICO
-- =====================================================================
create or replace function app.workout_last_sets(p_subject uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'exercise_id', ranked.exercise_id,
        'performed_at', ranked.performed_at,
        'weight_kg', ranked.weight_kg,
        'reps', ranked.reps,
        'rir', ranked.rir
      ) order by ranked.exercise_id
    ),
    '[]'::jsonb
  )
  from (
    select chosen.exercise_id, chosen.performed_at,
           chosen.weight_kg, chosen.reps, chosen.rir
      from (
        select s.exercise_id, l.performed_at, s.weight_kg, s.reps, s.rir,
               row_number() over (
                 partition by s.exercise_id
                 order by l.performed_at desc, l.created_at desc, l.id desc,
                          s.weight_kg desc nulls last,
                          s.reps desc nulls last,
                          s.set_number desc, s.id desc
               ) as position
          from public.workout_log_sets s
          join public.workout_logs l on l.id = s.log_id
         where l.subject_id = p_subject
      ) chosen
     where chosen.position = 1
  ) ranked;
$$;

revoke execute on function app.workout_plan_payload(uuid)
  from public, anon, authenticated;
revoke execute on function app.workout_last_sets(uuid)
  from public, anon, authenticated;

create or replace function public.get_workout_for_link(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_link public.workout_links;
  v_plan uuid;
  v_current_sessions int := 0;
  v_out  jsonb;
begin
  select * into v_link
    from public.workout_links
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and status = 'active'
     and expires_at > now();
  if v_link.id is null then
    return null;
  end if;

  if v_link.last_seen_at is null or v_link.last_seen_at < now() - interval '1 hour' then
    update public.workout_links set last_seen_at = now() where id = v_link.id;
  end if;

  select id into v_plan
    from public.workout_plans
   where subject_id = v_link.subject_id and status = 'active';

  if v_plan is not null then
    select count(*)::int into v_current_sessions
      from public.workout_logs l where l.plan_id = v_plan;
  end if;

  v_out := jsonb_build_object(
    'org_name', (select o.name from public.organizations o where o.id = v_link.org_id),
    'subject_first_name', (select split_part(s.full_name, ' ', 1)
                             from public.subjects s where s.id = v_link.subject_id),
    'link_expires_at', v_link.expires_at,
    'current_plan_sessions', v_current_sessions,
    'last_sets', app.workout_last_sets(v_link.subject_id),
    'history_plans', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name, 'goal', p.goal, 'weeks', p.weeks,
               'starts_on', p.starts_on, 'status', p.status,
               'sessions', (select count(*) from public.workout_logs l where l.plan_id = p.id))
             order by coalesce(p.starts_on, p.created_at::date) desc,
                      p.created_at desc, p.id desc)
        from (select * from public.workout_plans
               where subject_id = v_link.subject_id
                 and (v_plan is null or id <> v_plan)
                 and status <> 'draft'
               order by coalesce(starts_on, created_at::date) desc,
                        created_at desc, id desc
               limit 24) p
    ), '[]'::jsonb)
  );

  if v_plan is null then
    return v_out || jsonb_build_object(
      'plan', null, 'days', '[]'::jsonb, 'exercises', '[]'::jsonb,
      'weeks', '[]'::jsonb, 'overrides', '[]'::jsonb);
  end if;
  return v_out || app.workout_plan_payload(v_plan);
end;
$$;

revoke execute on function public.get_workout_for_link(text) from public;
grant execute on function public.get_workout_for_link(text) to anon, authenticated;

create or replace function public.get_workout_plan_for_link(p_token text, p_plan uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_subject uuid;
begin
  select subject_id into v_subject
    from public.workout_links
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and status = 'active'
     and expires_at > now();
  if v_subject is null then
    return null;
  end if;

  perform 1 from public.workout_plans
   where id = p_plan
     and subject_id = v_subject
     and status = 'archived';
  if not found then
    return null;
  end if;

  return app.workout_plan_payload(p_plan);
end;
$$;

revoke execute on function public.get_workout_plan_for_link(text, uuid) from public;
grant execute on function public.get_workout_plan_for_link(text, uuid) to anon, authenticated;

-- Cursor composto evita perder ou repetir sessões que compartilham a mesma
-- data. A RPC antiga permanece durante a janela de rollout; o frontend 0028
-- passa a usar somente esta versão paginada.
create or replace function public.get_workout_history_page_for_link(
  p_token               text,
  p_limit               int default 30,
  p_before_performed_at date default null,
  p_before_created_at   timestamptz default null,
  p_before_id           uuid default null
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_subject uuid;
  v_limit   int := least(greatest(coalesce(p_limit, 30), 1), 60);
  v_cursor_complete boolean := p_before_performed_at is not null
                               and p_before_created_at is not null
                               and p_before_id is not null;
  v_cursor_empty boolean := p_before_performed_at is null
                            and p_before_created_at is null
                            and p_before_id is null;
  v_result jsonb;
begin
  if not v_cursor_complete and not v_cursor_empty then
    raise exception 'cursor de historico incompleto';
  end if;

  select subject_id into v_subject
    from public.workout_links
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and status = 'active'
     and expires_at > now();
  if v_subject is null then
    return null;
  end if;

  with page as materialized (
    select l.id, l.performed_at, l.day_label, l.week_number, l.notes,
           l.source, l.created_at, p.name as plan_name
      from public.workout_logs l
      join public.workout_plans p on p.id = l.plan_id
     where l.subject_id = v_subject
       and (
         v_cursor_empty
         or (l.performed_at, l.created_at, l.id)
            < (p_before_performed_at, p_before_created_at, p_before_id)
       )
     order by l.performed_at desc, l.created_at desc, l.id desc
     limit v_limit + 1
  ), visible as (
    select * from page
     order by performed_at desc, created_at desc, id desc
     limit v_limit
  ), payload as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', s.id,
             'performed_at', s.performed_at,
             'day_label', s.day_label,
             'week_number', s.week_number,
             'plan_name', s.plan_name,
             'source', s.source,
             'notes', s.notes,
             'sets', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'exercise_id', st.exercise_id,
                        'exercise_name', x.name,
                        'set_number', st.set_number,
                        'weight_kg', st.weight_kg,
                        'reps', st.reps,
                        'rir', st.rir)
                      order by x.name, st.set_number, st.id)
                 from public.workout_log_sets st
                 join public.exercises x on x.id = st.exercise_id
                where st.log_id = s.id
             ), '[]'::jsonb)
           ) order by s.performed_at desc, s.created_at desc, s.id desc), '[]'::jsonb) as items
      from visible s
  )
  select jsonb_build_object(
           'items', payload.items,
           'next_cursor', case
             when (select count(*) from page) > v_limit then (
               select jsonb_build_object(
                        'performed_at', v.performed_at,
                        'created_at', v.created_at,
                        'id', v.id)
                 from visible v
                order by v.performed_at, v.created_at, v.id
                limit 1
             )
             else null
           end
         )
    into v_result
    from payload;

  return v_result;
end;
$$;

revoke execute on function public.get_workout_history_page_for_link(
  text, int, date, timestamptz, uuid
) from public;
grant execute on function public.get_workout_history_page_for_link(
  text, int, date, timestamptz, uuid
) to anon, authenticated;

-- Índices que sustentam o cursor e a resolução determinística da última série.
create index if not exists workout_logs_subject_timeline_idx
  on public.workout_logs (subject_id, performed_at desc, created_at desc, id desc);

-- =====================================================================
-- 9. CARIMBO DE SCHEMA
-- =====================================================================
create or replace function public.app_schema_version()
returns text
language sql immutable set search_path = ''
as $$ select '0028'::text $$;

revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;

commit;
