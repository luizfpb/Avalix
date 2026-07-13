-- Avalix - migration 0020: integridade, privacidade e governanca (jul/2026)
-- Depende de 0001-0019. NAO aplicar isoladamente em producao.
--
-- Rollout coordenado:
--   1. conforme docs/RELEASE_V2_2.md, confirmar 0001-0019 no schema e no
--      historico remoto e, numa janela sem gravacoes, aplicar somente 0020;
--   2. regenerar os types e publicar o frontend que usa termo 1.1/RPCs;
--   3. agendar purge_expired_anamnese_intakes() e purge_client_errors() com
--      service_role, ao menos diariamente;
--   4. testar Storage -> banco: os objetos devem ser removidos antes das rows.
--
-- A migration preserva consentimentos historicos. Snapshots integrais passam
-- a ser obrigatorios para a versao 1.1; versoes anteriores continuam legiveis
-- com a evidencia que ja existia (versao + hash).

begin;

-- =====================================================================
-- TERMO CANONICO 1.1
-- A funcao abaixo deve permanecer byte-a-byte igual a consentText() no TS.
-- O banco compara o hash recebido (prova do texto exibido) e grava seu proprio
-- snapshot/hash, sem confiar em versao ou texto fornecidos pelo cliente.
-- =====================================================================
create or replace function app.canonical_consent_version()
returns text
language sql immutable set search_path = ''
as $$ select '1.1'::text $$;

create or replace function app.canonical_consent_text(p_controller text)
returns text
language sql immutable set search_path = ''
as $$
  select replace($consent$Termo de Consentimento para Tratamento de Dados Pessoais e de Saúde

1. Controlador e alcance deste termo
Ao confirmar, você autoriza {{CONTROLADOR}} (o “Controlador”) a tratar, por meio do Avalix, seus dados pessoais e dados pessoais sensíveis de saúde para as finalidades descritas neste termo.

2. Dados tratados
- Identificação, cadastro e contato: nome, data de nascimento, sexo biológico, telefone, e-mail, responsável legal e relação com o responsável.
- Anamnese e saúde: histórico de saúde, sintomas, dores, lesões, doenças, cirurgias, limitações, medicamentos, gestação ou possibilidade de gravidez, hábitos, prática de atividade física, objetivos e respostas fornecidas nos formulários.
- Avaliação física e postural: peso, altura, dobras cutâneas, circunferências, composição corporal calculada, fotografias do corpo e anotações associadas.
- Acompanhamento: planos e registros de treino, séries, cargas, repetições, percepção de esforço, agenda de avaliações, evolução e observações do profissional.
- Operação e segurança: registros de acesso, auditoria, erros técnicos, dispositivo/navegador e ações de exportação.

3. Finalidades
Os dados são usados para cadastrar e identificar você, realizar anamnese e avaliações físicas ou posturais, verificar cuidados e encaminhamentos necessários, planejar e acompanhar treinos, organizar a agenda, acompanhar sua evolução, manter a segurança e a rastreabilidade do serviço e gerar relatórios ou exportações solicitados.

4. Base legal e liberdade de escolha
O tratamento baseado neste termo utiliza o consentimento previsto na Lei nº 13.709/2018 (LGPD), art. 7º, inciso I, para dados pessoais, e art. 11, inciso I, para dados pessoais sensíveis de saúde. O consentimento é livre e pode ser recusado ou revogado, ciente de que isso pode impedir novas coletas e funcionalidades que dependam desses dados.

5. Compartilhamento e infraestrutura
Os dados não são vendidos. Eles podem ser tratados por profissionais autorizados da organização e por fornecedores de infraestrutura, armazenamento, autenticação, processamento e suporte necessários ao funcionamento do Avalix, sujeitos a deveres de segurança e confidencialidade, além das hipóteses exigidas por lei ou por autoridade competente.

6. PDFs, CSV, Google Agenda e WhatsApp
Relatórios em PDF e exportações em CSV somente são gerados por ação explícita de usuário autorizado. Inclusões no Google Agenda e compartilhamentos pelo WhatsApp também somente ocorrem após ação explícita: o Avalix não envia esses dados automaticamente. Depois do envio a um serviço externo ou destinatário escolhido, o tratamento também fica sujeito às práticas desse terceiro; confira o conteúdo antes de compartilhar.

7. Armazenamento, segurança e retenção
O Controlador deve limitar o acesso a pessoas autorizadas e adotar medidas técnicas e administrativas de segurança. Fotografias processadas pelo aplicativo têm os metadados de localização removidos antes do envio. Os dados são mantidos enquanto forem necessários para o acompanhamento e para as finalidades informadas, durante a relação com o Controlador ou pelos prazos de guarda exigidos por lei ou necessários ao exercício regular de direitos. Encerrada a necessidade, devem ser eliminados ou anonimizados, ressalvadas as hipóteses legais de conservação. Convites cancelados, rejeitados ou expirados têm as respostas e os dados de cadastro anonimizados pelo sistema.

8. Seus direitos e contato
Você pode solicitar ao Controlador confirmação do tratamento, acesso, correção, informação sobre compartilhamentos, anonimização, bloqueio, eliminação ou portabilidade quando aplicável, além de retirar o consentimento e obter informações sobre as consequências da retirada. Solicitações devem ser dirigidas ao Controlador identificado no início deste termo, pelos canais que ele disponibilizar.

9. Revogação
Você pode revogar este consentimento a qualquer momento. A revogação bloqueia novas coletas baseadas nele, mas não invalida tratamentos realizados licitamente antes da retirada. Um novo consentimento, se necessário, gera um novo registro sem apagar o histórico da revogação.

10. Crianças, adolescentes e responsável legal
Para titular menor de 18 anos ou que não possa consentir por si, o aceite deve ser feito pelo responsável legal, no melhor interesse do titular e com observância do art. 14 da LGPD. O responsável declara possuir legitimidade para fornecer o consentimento.

11. Declaração
Declaro que li e compreendi este termo, tive oportunidade de esclarecer dúvidas e forneço informações verdadeiras. Ao digitar meu nome completo e confirmar, manifesto consentimento livre, informado e inequívoco para o tratamento descrito.$consent$,
    '{{CONTROLADOR}}',
    coalesce(
      nullif(btrim(p_controller), ''),
      'o profissional ou a organização responsável pela sua avaliação'
    )
  );
$$;

alter table public.consent_records
  add column if not exists controller_name_snapshot text,
  add column if not exists consent_text_snapshot text,
  add column if not exists source_intake_id uuid
    references public.anamnese_intakes(id);

alter table public.anamnese_intakes
  add column if not exists controller_name_snapshot text,
  add column if not exists consent_text_snapshot text,
  add column if not exists purged_at timestamptz;

alter table public.consent_records
  drop constraint if exists consent_records_v11_snapshot_chk;
alter table public.consent_records
  add constraint consent_records_v11_snapshot_chk check (
    consent_version <> '1.1'
    or (
      controller_name_snapshot is not null
      and consent_text_snapshot is not null
      and consent_text_sha256 = encode(
        sha256(convert_to(consent_text_snapshot, 'UTF8')), 'hex'
      )
    )
  ) not valid;

-- =====================================================================
-- MENORES: o cadastro e o consentimento sao validados no servidor.
-- =====================================================================
create or replace function app.validate_subject_guardian()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.birth_date > current_date - interval '18 years' then
    if char_length(coalesce(btrim(new.guardian_name), '')) < 3
       or char_length(coalesce(btrim(new.guardian_relationship), '')) < 2 then
      raise exception 'menor de idade exige nome e vinculo do responsavel legal';
    end if;
    new.guardian_name := btrim(new.guardian_name);
    new.guardian_relationship := btrim(new.guardian_relationship);
  end if;
  return new;
end;
$$;

drop trigger if exists subjects_b1_guardian on public.subjects;
create trigger subjects_b1_guardian
  before insert or update on public.subjects
  for each row execute function app.validate_subject_guardian();

-- =====================================================================
-- CONSENTIMENTO: um ativo por avaliado, supersessao atomica, snapshots
-- canonicos e revogacao apenas pela RPC.
-- =====================================================================
-- Fecha sobreposicoes historicas antes de criar a unicidade. Cada registro
-- antigo e encerrado no instante do consentimento imediatamente posterior.
with ranked as (
  select c.id,
         row_number() over (
           partition by c.subject_id order by c.granted_at desc, c.id desc
         ) as rn,
         lag(c.granted_at) over (
           partition by c.subject_id order by c.granted_at desc, c.id desc
         ) as superseded_at
    from public.consent_records c
   where c.revoked_at is null
)
update public.consent_records c
   set revoked_at = greatest(c.granted_at, r.superseded_at)
  from ranked r
 where r.id = c.id and r.rn > 1;

drop index if exists public.consent_active_idx;
create unique index if not exists consent_one_active_idx
  on public.consent_records (subject_id)
  where revoked_at is null;
create unique index if not exists consent_source_intake_idx
  on public.consent_records (source_intake_id)
  where source_intake_id is not null;

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
    if lower(btrim(new.signer_name)) <> lower(btrim(v_guardian)) then
      raise exception 'quem assina deve ser o responsavel legal cadastrado';
    end if;
  elsif lower(btrim(new.signer_name)) <> lower(btrim(v_subject_name)) then
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
       or lower(btrim(v_source.signer_name)) is distinct from lower(btrim(new.signer_name))
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

drop trigger if exists consent_b2_canonical on public.consent_records;
create trigger consent_b2_canonical
  before insert on public.consent_records
  for each row execute function app.consent_before_insert();

create or replace function app.consent_update_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.org_id                    is distinct from old.org_id
     or new.subject_id             is distinct from old.subject_id
     or new.consent_version        is distinct from old.consent_version
     or new.consent_text_sha256    is distinct from old.consent_text_sha256
     or new.controller_name_snapshot is distinct from old.controller_name_snapshot
     or new.consent_text_snapshot  is distinct from old.consent_text_snapshot
     or new.source_intake_id       is distinct from old.source_intake_id
     or new.signer_kind            is distinct from old.signer_kind
     or new.signer_name            is distinct from old.signer_name
     or new.collected_by           is distinct from old.collected_by
     or new.user_agent             is distinct from old.user_agent
     or new.granted_at             is distinct from old.granted_at then
    raise exception 'registro de consentimento e imutavel; apenas revoked_at pode ser alterado';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'revoked_at e imutavel apos a revogacao; reconsentir cria um novo registro';
  end if;
  if new.revoked_at is not null and new.revoked_at < old.granted_at then
    raise exception 'revogacao nao pode ser anterior ao consentimento';
  end if;
  return new;
end;
$$;

drop policy if exists consent_update on public.consent_records;

create or replace function public.revoke_consent(p_consent uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_subject uuid;
begin
  if (select auth.uid()) is null or not app.mfa_satisfied() then
    raise exception 'nao autenticado ou MFA pendente';
  end if;
  select c.subject_id into v_subject
    from public.consent_records c
   where c.id = p_consent
   for update;
  if v_subject is null or not app.can_view_subject_id(v_subject) then
    raise exception 'consentimento inexistente ou sem acesso';
  end if;
  update public.consent_records c
     set revoked_at = greatest(now(), c.granted_at)
   where c.subject_id = v_subject and c.revoked_at is null;
end;
$$;

revoke execute on function public.revoke_consent(uuid) from public, anon;
grant execute on function public.revoke_consent(uuid) to authenticated;

-- =====================================================================
-- INTAKES: estados estreitos, evidencia imutavel e minimizacao de retencao.
-- =====================================================================
alter table public.anamnese_intakes
  drop constraint if exists anamnese_intakes_status_check;
alter table public.anamnese_intakes
  add constraint anamnese_intakes_status_check
  check (status in ('pending','submitted','accepted','rejected','canceled','expired'));

alter table public.anamnese_intakes
  drop constraint if exists anamnese_intakes_resulting_subject_id_fkey;
alter table public.anamnese_intakes
  add constraint anamnese_intakes_resulting_subject_id_fkey
  foreign key (resulting_subject_id) references public.subjects(id) on delete cascade;

-- Intake aceito e a evidencia oficial derivada formam o mesmo ciclo de vida.
-- CASCADE evita um ON DELETE SET NULL tentar mutar uma row accepted imutavel.
alter table public.anamnese_intakes
  drop constraint if exists anamnese_intakes_resulting_anamnese_id_fkey;
alter table public.anamnese_intakes
  add constraint anamnese_intakes_resulting_anamnese_id_fkey
  foreign key (resulting_anamnese_id) references public.anamneses(id) on delete cascade;

create or replace function app.anamnese_intake_update_guard()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_transition text := old.status || '->' || new.status;
  v_allowed text[] := array['updated_at'];
  v_legacy_accept boolean := false;
begin
  if new.org_id is distinct from old.org_id
     or new.subject_id is distinct from old.subject_id
     or new.token_hash is distinct from old.token_hash
     or new.created_by is distinct from old.created_by
     or new.kind is distinct from old.kind
     or new.spec_version is distinct from old.spec_version
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at then
    raise exception 'identidade e validade do intake sao imutaveis';
  end if;

  -- Cada transicao tem uma allowlist. Todo o restante, inclusive evidencia,
  -- IDs resultantes e metadados de revisao ja gravados, permanece byte-a-byte.
  case
    when v_transition = 'pending->submitted' then
      v_allowed := v_allowed || array[
        'status','submitted_at','payload','registration','signer_kind','signer_name',
        'consent_version','consent_text_sha256','controller_name_snapshot',
        'consent_text_snapshot','submit_user_agent'
      ];
    when v_transition in ('pending->canceled','pending->expired') then
      v_allowed := v_allowed || array['status','reviewed_at','reviewed_by'];
    when v_transition = 'submitted->accepted' then
      v_allowed := v_allowed || array[
        'status','reviewed_at','reviewed_by',
        'resulting_anamnese_id','resulting_subject_id'
      ];
    when v_transition in (
      'submitted->rejected','submitted->canceled'
    ) then
      v_allowed := v_allowed || array['status','reviewed_at','reviewed_by'];
    when v_transition in ('rejected->rejected','canceled->canceled','expired->expired')
         and (
           old.purged_at is null or old.payload is not null or old.registration is not null
           or old.submitted_at is not null or old.signer_kind is not null
           or old.signer_name is not null or old.consent_version is not null
           or old.consent_text_sha256 is not null
           or old.controller_name_snapshot is not null
           or old.consent_text_snapshot is not null or old.submit_user_agent is not null
           or old.resulting_anamnese_id is not null or old.resulting_subject_id is not null
         ) then
      -- Excecao unica de rollout: anonimiza o passivo terminal pre-0020.
      null;
    else
      raise exception 'transicao de intake invalida ou estado terminal imutavel: %', v_transition;
  end case;

  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'update de intake alterou colunas fora da allowlist de %', v_transition;
  end if;

  if new.status in ('rejected','canceled','expired') then
    new.payload := null;
    new.registration := null;
    new.submitted_at := null;
    new.signer_kind := null;
    new.signer_name := null;
    new.consent_version := null;
    new.consent_text_sha256 := null;
    new.controller_name_snapshot := null;
    new.consent_text_snapshot := null;
    new.submit_user_agent := null;
    new.resulting_anamnese_id := null;
    new.resulting_subject_id := null;
    new.purged_at := coalesce(old.purged_at, now());
  elsif new.purged_at is distinct from old.purged_at then
    raise exception 'purged_at so pode ser definido ao anonimizar intake terminal';
  end if;

  if old.status = 'submitted' and new.status = 'accepted' then
    if new.reviewed_at is null or new.reviewed_by is null
       or new.resulting_anamnese_id is null
       or (new.kind = 'cadastro_anamnese' and new.resulting_subject_id is null) then
      raise exception 'aceite de intake sem metadados e resultados completos';
    end if;

    -- Compatibilidade estrita para formularios 1.0 que ja estavam submitted
    -- durante o rollout. A RPC precisa ter criado antes um consentimento com
    -- provenance para este intake e evidencia byte-a-byte igual.
    if new.consent_version <> app.canonical_consent_version() then
      select exists (
        select 1 from public.consent_records c
         where c.source_intake_id = new.id
           and c.org_id = new.org_id
           and c.subject_id = coalesce(new.resulting_subject_id, new.subject_id)
           and c.consent_version = new.consent_version
           and lower(c.consent_text_sha256) = lower(new.consent_text_sha256)
           and c.signer_kind = new.signer_kind
           and lower(btrim(c.signer_name)) = lower(btrim(new.signer_name))
           and c.controller_name_snapshot is not distinct from new.controller_name_snapshot
           and c.consent_text_snapshot is not distinct from new.consent_text_snapshot
      ) into v_legacy_accept;
    end if;
  end if;

  if new.status in ('submitted','accepted') then
    if new.payload is null or new.submitted_at is null
       or new.signer_kind is null or new.signer_name is null
       or new.consent_version is null or new.consent_text_sha256 is null then
      raise exception 'intake submetido sem evidencia completa';
    end if;
    if new.consent_version = app.canonical_consent_version() then
      if new.controller_name_snapshot is null or new.consent_text_snapshot is null then
        raise exception 'intake submetido sem evidencia completa';
      end if;
    elsif not v_legacy_accept then
      raise exception 'intake legado so pode ser aceito pela RPC com consentimento vinculado';
    end if;
  end if;
  return new;
end;
$$;

create or replace function app.anamnese_intake_insert_guard()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'criacao de intake exige usuario autenticado';
  end if;
  if new.token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token_hash invalido';
  end if;
  if char_length(coalesce(new.spec_version, '')) not between 1 and 40 then
    raise exception 'spec_version invalida';
  end if;
  if new.expires_at <= now() then
    raise exception 'intake deve expirar no futuro';
  end if;

  new.created_by := v_actor;
  new.created_at := now();
  new.updated_at := now();
  new.status := 'pending';
  new.submitted_at := null;
  new.payload := null;
  new.registration := null;
  new.consent_version := null;
  new.consent_text_sha256 := null;
  new.controller_name_snapshot := null;
  new.consent_text_snapshot := null;
  new.signer_kind := null;
  new.signer_name := null;
  new.submit_user_agent := null;
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.resulting_anamnese_id := null;
  new.resulting_subject_id := null;
  new.purged_at := null;
  return new;
end;
$$;

drop trigger if exists anamnese_intakes_b2_create_guard on public.anamnese_intakes;
create trigger anamnese_intakes_b2_create_guard
  before insert on public.anamnese_intakes
  for each row execute function app.anamnese_intake_insert_guard();

drop trigger if exists anamnese_intakes_integrity_guard on public.anamnese_intakes;
create trigger anamnese_intakes_integrity_guard
  before update on public.anamnese_intakes
  for each row execute function app.anamnese_intake_update_guard();

drop policy if exists anamnese_intakes_update on public.anamnese_intakes;
drop policy if exists anamnese_intakes_delete on public.anamnese_intakes;

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
  v_intake    public.anamnese_intakes;
  v_birth     date;
  v_subject_name text;
  v_guardian  text;
  v_relation  text;
  v_controller text;
  v_text      text;
  v_hash      text;
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

revoke execute on function public.submit_anamnese_intake(text, jsonb, text, text, text, text, text, jsonb) from public;
grant execute on function public.submit_anamnese_intake(text, jsonb, text, text, text, text, text, jsonb) to anon, authenticated;

create or replace function public.cancel_anamnese_intake(p_intake uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_row public.anamnese_intakes;
begin
  if (select auth.uid()) is null or not app.mfa_satisfied() then
    raise exception 'nao autenticado ou MFA pendente';
  end if;
  select * into v_row from public.anamnese_intakes i where i.id = p_intake for update;
  if v_row.id is null or v_row.status <> 'pending'
     or not (case when v_row.subject_id is null then app.is_member(v_row.org_id)
                  else app.can_view_subject_id(v_row.subject_id) end) then
    raise exception 'intake pendente inexistente ou sem acesso';
  end if;
  update public.anamnese_intakes
     set status = 'canceled', reviewed_at = now(), reviewed_by = (select auth.uid())
   where id = p_intake;
end;
$$;

create or replace function public.reject_anamnese_intake(p_intake uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_row public.anamnese_intakes;
begin
  if (select auth.uid()) is null or not app.mfa_satisfied() then
    raise exception 'nao autenticado ou MFA pendente';
  end if;
  select * into v_row from public.anamnese_intakes i where i.id = p_intake for update;
  if v_row.id is null or v_row.status <> 'submitted'
     or not (case when v_row.subject_id is null then app.is_member(v_row.org_id)
                  else app.can_view_subject_id(v_row.subject_id) end) then
    raise exception 'intake submetido inexistente ou sem acesso';
  end if;
  update public.anamnese_intakes
     set status = 'rejected', reviewed_at = now(), reviewed_by = (select auth.uid())
   where id = p_intake;
end;
$$;

revoke execute on function public.cancel_anamnese_intake(uuid) from public, anon;
revoke execute on function public.reject_anamnese_intake(uuid) from public, anon;
grant execute on function public.cancel_anamnese_intake(uuid) to authenticated;
grant execute on function public.reject_anamnese_intake(uuid) to authenticated;

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

  -- O contexto local nao e uma autorizacao isolada: o trigger tambem exige
  -- source_intake_id, row submitted travada e evidencia exatamente igual.
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
     v_intake.spec_version, v_intake.payload, p_liberado, p_nivel, p_flag)
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

revoke execute on function public.accept_anamnese_intake(uuid, boolean, text, boolean, jsonb) from public, anon;
grant execute on function public.accept_anamnese_intake(uuid, boolean, text, boolean, jsonb) to authenticated;

create or replace function public.purge_expired_anamnese_intakes(p_limit int default 500)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_limit not between 1 and 5000 then
    raise exception 'limite deve estar entre 1 e 5000';
  end if;
  with expired as (
    select i.id from public.anamnese_intakes i
     where i.status = 'pending' and i.expires_at <= now()
     order by i.expires_at
     limit p_limit for update skip locked
  )
  update public.anamnese_intakes i
     set status = 'expired'
    from expired e where e.id = i.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.purge_expired_anamnese_intakes(int) from public, anon, authenticated;
grant execute on function public.purge_expired_anamnese_intakes(int) to service_role;

-- Anonimiza imediatamente o passivo terminal e marca links ja vencidos.
update public.anamnese_intakes
   set status = status
 where status in ('rejected','canceled')
   and (
     purged_at is null or payload is not null or registration is not null
     or submitted_at is not null or signer_kind is not null or signer_name is not null
     or consent_version is not null or consent_text_sha256 is not null
     or controller_name_snapshot is not null or consent_text_snapshot is not null
     or submit_user_agent is not null or resulting_anamnese_id is not null
     or resulting_subject_id is not null
   );
update public.anamnese_intakes
   set status = 'expired'
 where status = 'pending' and expires_at <= now();

-- =====================================================================
-- STORAGE: metadados pais nao podem desaparecer enquanto houver objetos.
-- Isso garante que a policy do bucket continue capaz de autorizar a remocao.
-- =====================================================================
create or replace function app.block_photo_row_delete_with_objects()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from storage.objects o
     where o.bucket_id = 'photos'
       and o.name in (old.storage_path, old.thumb_path)
  ) then
    raise exception 'remova os arquivos da foto no Storage antes de apagar o registro';
  end if;
  return old;
end;
$$;

drop trigger if exists posture_photos_storage_delete_guard on public.posture_photos;
create trigger posture_photos_storage_delete_guard
  before delete on public.posture_photos
  for each row execute function app.block_photo_row_delete_with_objects();

create or replace function app.block_subject_delete_with_objects()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_prefix text := old.org_id::text || '/' || old.id::text || '/';
begin
  if exists (
    select 1 from storage.objects o
     where o.bucket_id = 'photos'
       and left(o.name, char_length(v_prefix)) = v_prefix
  ) then
    raise exception 'remova todas as fotos do avaliado no Storage antes de exclui-lo';
  end if;
  return old;
end;
$$;

drop trigger if exists subjects_storage_delete_guard on public.subjects;
create trigger subjects_storage_delete_guard
  before delete on public.subjects
  for each row execute function app.block_subject_delete_with_objects();

create or replace function app.block_posture_session_delete_with_objects()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_prefix text;
begin
  select old.org_id::text || '/' || s.subject_id::text || '/' || old.id::text || '/'
    into v_prefix
    from public.posture_sessions s where s.id = old.id;
  if exists (
    select 1 from storage.objects o
     where o.bucket_id = 'photos'
       and left(o.name, char_length(v_prefix)) = v_prefix
  ) then
    raise exception 'remova as fotos da sessao no Storage antes de exclui-la';
  end if;
  return old;
end;
$$;

drop trigger if exists posture_sessions_storage_delete_guard on public.posture_sessions;
create trigger posture_sessions_storage_delete_guard
  before delete on public.posture_sessions
  for each row execute function app.block_posture_session_delete_with_objects();

create or replace function app.block_organization_delete_with_objects()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from storage.objects o
     where o.bucket_id in ('photos','logos')
       and left(o.name, 37) = old.id::text || '/'
  ) then
    raise exception 'remova os arquivos da organizacao no Storage antes de exclui-la';
  end if;
  return old;
end;
$$;

drop trigger if exists organizations_storage_delete_guard on public.organizations;
create trigger organizations_storage_delete_guard
  before delete on public.organizations
  for each row execute function app.block_organization_delete_with_objects();

drop policy if exists subjects_delete on public.subjects;

-- Exclusao definitiva em duas etapas. O preflight devolve somente os paths do
-- avaliado autorizado; o cliente remove e verifica os objetos. A finalizacao
-- relocka/revalida tudo e os guards abaixo recusam a row se restar um objeto.
create or replace function public.prepare_subject_deletion(p_subject uuid)
returns table (storage_path text, thumb_path text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_org uuid;
begin
  if (select auth.uid()) is null or not app.mfa_satisfied() then
    raise exception 'nao autenticado ou MFA pendente';
  end if;
  select s.org_id into v_org from public.subjects s where s.id = p_subject;
  if v_org is null
     or not app.role_in(v_org, array['owner','admin'])
     or not app.can_view_subject_id(p_subject) then
    raise exception 'avaliado inexistente ou exclusao sem acesso de owner/admin';
  end if;

  return query
    select p.storage_path, p.thumb_path
      from public.posture_photos p
      join public.posture_sessions s on s.id = p.session_id
     where s.subject_id = p_subject
     order by p.created_at, p.id;
end;
$$;

create or replace function public.finalize_subject_deletion(p_subject uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid;
begin
  if (select auth.uid()) is null or not app.mfa_satisfied() then
    raise exception 'nao autenticado ou MFA pendente';
  end if;
  select s.org_id into v_org
    from public.subjects s where s.id = p_subject for update;
  if v_org is null
     or not app.role_in(v_org, array['owner','admin'])
     or not app.can_view_subject_id(p_subject) then
    raise exception 'avaliado inexistente ou exclusao sem acesso de owner/admin';
  end if;

  delete from public.subjects s where s.id = p_subject;
  if not found then
    raise exception 'avaliado nao foi excluido';
  end if;
end;
$$;

revoke execute on function public.prepare_subject_deletion(uuid) from public, anon;
revoke execute on function public.finalize_subject_deletion(uuid) from public, anon;
grant execute on function public.prepare_subject_deletion(uuid) to authenticated;
grant execute on function public.finalize_subject_deletion(uuid) to authenticated;

-- =====================================================================
-- GOVERNANCA: admin nao se promove a owner e a org nunca perde seu ultimo
-- owner por update/delete direto. Cascades de uma org ja excluida sao aceitos.
-- =====================================================================
create or replace function app.org_member_governance_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org   uuid;
begin
  if tg_op = 'INSERT' then
    v_org := new.org_id;
  else
    v_org := old.org_id;
  end if;

  -- Operacoes internas (migration/service role sem usuario final) permanecem
  -- possiveis; chamadas autenticadas obedecem as regras abaixo.
  if v_actor is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- Serializa mudancas concorrentes de owners. Na cascata de uma organizacao
  -- ja removida a row pai nao existe e a guarda de ultimo owner nao se aplica.
  if exists (select 1 from public.organizations o where o.id = v_org) then
    perform 1 from public.organizations o where o.id = v_org for update;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'owner' and not app.role_in(new.org_id, array['owner']) then
      -- Bootstrap estreito da create_organization: com a org bloqueada, apenas
      -- o primeiro membro pode nomear a si proprio owner. Depois disso, so um
      -- owner existente consegue criar outro owner.
      if new.user_id <> v_actor or exists (
        select 1 from public.org_members m where m.org_id = new.org_id
      ) then
        raise exception 'somente owner pode nomear outro owner';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id
       or new.user_id is distinct from old.user_id
       or new.created_at is distinct from old.created_at then
      raise exception 'organizacao, usuario e criacao da membership sao imutaveis';
    end if;
    if (old.role = 'owner' or new.role = 'owner')
       and not app.role_in(v_org, array['owner']) then
      raise exception 'somente owner pode alterar o papel owner';
    end if;
    if old.role = 'owner' and new.role <> 'owner'
       and (select count(*) from public.org_members m
             where m.org_id = v_org and m.role = 'owner') <= 1 then
      raise exception 'a organizacao deve manter ao menos um owner';
    end if;
    return new;
  end if;

  if old.role = 'owner'
     and exists (select 1 from public.organizations o where o.id = v_org) then
    if not app.role_in(v_org, array['owner']) then
      raise exception 'somente owner pode remover outro owner';
    end if;
    if (select count(*) from public.org_members m
         where m.org_id = v_org and m.role = 'owner') <= 1 then
      raise exception 'nao e possivel remover o ultimo owner';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists org_members_governance_guard on public.org_members;
create trigger org_members_governance_guard
  before insert or update or delete on public.org_members
  for each row execute function app.org_member_governance_guard();

-- =====================================================================
-- AUDITORIA DE SAIDA/COMPARTILHAMENTO: o cliente escolhe uma acao de uma
-- matriz fechada; usuario, horario, org e acesso ao avaliado sao verificados
-- no servidor. Inserts REST arbitrarios deixam de ser permitidos.
-- =====================================================================
alter table public.audit_logs
  drop constraint if exists audit_logs_action_chk;
alter table public.audit_logs
  add constraint audit_logs_action_chk check (action in (
    'INSERT','UPDATE','DELETE',
    'EXPORT_CSV','EXPORT_JSON','PDF_REPORT','AI_SUMMARY',
    'SHARE_GOOGLE_CALENDAR','SHARE_ICS','SHARE_WHATSAPP','SUBJECT_EXPORT'
  )) not valid;

alter table public.audit_logs
  drop constraint if exists audit_logs_table_name_chk;
alter table public.audit_logs
  add constraint audit_logs_table_name_chk
  check (char_length(table_name) between 1 and 80) not valid;

drop policy if exists audit_insert on public.audit_logs;

create or replace function public.log_data_action(
  p_org        uuid,
  p_action     text,
  p_table_name text,
  p_row_id     uuid default null,
  p_subject_id uuid default null
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_org     uuid;
  v_subject uuid;
begin
  if v_actor is null or not app.mfa_satisfied() or not app.is_member(p_org) then
    raise exception 'nao autenticado, MFA pendente ou organizacao sem acesso';
  end if;

  -- Matriz acao/alvo: evita transformar a RPC numa escrita arbitraria.
  if not (
    (p_action = 'EXPORT_CSV' and p_table_name = 'assessments')
    or (p_action = 'EXPORT_JSON' and p_table_name in ('subjects','assessments'))
    or (p_action = 'PDF_REPORT' and p_table_name in ('assessments','workout_plans'))
    or (p_action = 'AI_SUMMARY' and p_table_name = 'assessments')
    or (p_action in ('SHARE_GOOGLE_CALENDAR','SHARE_ICS')
        and p_table_name = 'appointments' and p_row_id is not null)
    or (p_action = 'SHARE_WHATSAPP'
        and p_table_name = 'workout_plans' and p_row_id is not null)
    or (p_action = 'SUBJECT_EXPORT'
        and p_table_name = 'subjects' and p_row_id is not null)
  ) then
    raise exception 'acao e alvo de auditoria invalidos';
  end if;

  case p_table_name
    when 'subjects' then
      select s.org_id, s.id into v_org, v_subject
        from public.subjects s where s.id = p_row_id;
    when 'assessments' then
      if p_row_id is not null then
        select a.org_id, a.subject_id into v_org, v_subject
          from public.assessments a where a.id = p_row_id;
      else
        select s.org_id, s.id into v_org, v_subject
          from public.subjects s where s.id = p_subject_id;
      end if;
    when 'workout_plans' then
      select w.org_id, w.subject_id into v_org, v_subject
        from public.workout_plans w where w.id = p_row_id;
    when 'appointments' then
      select a.org_id, a.subject_id into v_org, v_subject
        from public.appointments a where a.id = p_row_id;
    else
      raise exception 'tabela de auditoria invalida';
  end case;

  if v_org is null or v_org <> p_org
     or v_subject is null
     or (p_subject_id is not null and p_subject_id <> v_subject)
     or not app.can_view_subject_id(v_subject) then
    raise exception 'alvo de auditoria inexistente ou sem acesso';
  end if;

  insert into public.audit_logs (org_id, user_id, action, table_name, row_id, at)
  values (p_org, v_actor, p_action, p_table_name, p_row_id, now());
end;
$$;

revoke execute on function public.log_data_action(uuid, text, text, uuid, uuid)
  from public, anon;
grant execute on function public.log_data_action(uuid, text, text, uuid, uuid)
  to authenticated;

-- Snapshot de portabilidade. As colecoes sao planas e preservam IDs/FKs para
-- permitir reconstrucao. Fotos incluem metadados e paths privados, nao os
-- binarios do Storage; a exportacao dos objetos deve ser feita por processo
-- separado e autorizado. token_hash nunca sai neste documento.
create or replace function public.export_subject_data(p_subject uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_subject public.subjects;
  v_export  jsonb;
begin
  if v_actor is null or not app.mfa_satisfied() then
    raise exception 'nao autenticado ou MFA pendente';
  end if;
  select * into v_subject from public.subjects s where s.id = p_subject;
  if v_subject.id is null or not app.can_view_subject_id(p_subject) then
    raise exception 'avaliado inexistente ou sem acesso';
  end if;

  v_export := jsonb_build_object(
    'schema_version', '1.0',
    'exported_at', now(),
    'subject', to_jsonb(v_subject),
    'consent_records', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.granted_at, c.id)
        from public.consent_records c where c.subject_id = p_subject
    ), '[]'::jsonb),
    'anamneses', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.assessed_at, a.id)
        from public.anamneses a where a.subject_id = p_subject
    ), '[]'::jsonb),
    'anamnese_intakes', coalesce((
      select jsonb_agg((to_jsonb(i) - 'token_hash') order by i.created_at, i.id)
        from public.anamnese_intakes i
       where i.subject_id = p_subject or i.resulting_subject_id = p_subject
    ), '[]'::jsonb),
    'assessments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.assessed_at, a.id)
        from public.assessments a where a.subject_id = p_subject
    ), '[]'::jsonb),
    'circumference_readings', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at, c.id)
        from public.circumference_readings c
        join public.assessments a on a.id = c.assessment_id
       where a.subject_id = p_subject
    ), '[]'::jsonb),
    'skinfold_readings', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at, s.id)
        from public.skinfold_readings s
        join public.assessments a on a.id = s.assessment_id
       where a.subject_id = p_subject
    ), '[]'::jsonb),
    'posture_sessions', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.taken_at, s.id)
        from public.posture_sessions s where s.subject_id = p_subject
    ), '[]'::jsonb),
    'posture_photos', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at, p.id)
        from public.posture_photos p
        join public.posture_sessions s on s.id = p.session_id
       where s.subject_id = p_subject
    ), '[]'::jsonb),
    'posture_annotations', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at, a.id)
        from public.posture_annotations a
        join public.posture_photos p on p.id = a.photo_id
        join public.posture_sessions s on s.id = p.session_id
       where s.subject_id = p_subject
    ), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.starts_at, a.id)
        from public.appointments a where a.subject_id = p_subject
    ), '[]'::jsonb),
    'workout_plans', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at, p.id)
        from public.workout_plans p where p.subject_id = p_subject
    ), '[]'::jsonb),
    'workout_days', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.plan_id, d.position, d.id)
        from public.workout_days d
        join public.workout_plans p on p.id = d.plan_id
       where p.subject_id = p_subject
    ), '[]'::jsonb),
    'workout_exercises', coalesce((
      select jsonb_agg(to_jsonb(e) order by d.plan_id, d.position, e.position, e.id)
        from public.workout_exercises e
        join public.workout_days d on d.id = e.day_id
        join public.workout_plans p on p.id = d.plan_id
       where p.subject_id = p_subject
    ), '[]'::jsonb),
    'workout_weeks', coalesce((
      select jsonb_agg(to_jsonb(w) order by w.plan_id, w.week_number, w.id)
        from public.workout_weeks w
        join public.workout_plans p on p.id = w.plan_id
       where p.subject_id = p_subject
    ), '[]'::jsonb),
    'workout_week_overrides', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.plan_id, o.week_number, o.id)
        from public.workout_week_overrides o
        join public.workout_plans p on p.id = o.plan_id
       where p.subject_id = p_subject
    ), '[]'::jsonb),
    'workout_logs', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.performed_at, l.id)
        from public.workout_logs l where l.subject_id = p_subject
    ), '[]'::jsonb),
    'workout_log_sets', coalesce((
      select jsonb_agg(to_jsonb(s) order by l.performed_at, s.log_id, s.set_number, s.id)
        from public.workout_log_sets s
        join public.workout_logs l on l.id = s.log_id
       where l.subject_id = p_subject
    ), '[]'::jsonb),
    'exercise_catalog', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.name, e.id)
        from public.exercises e
       where exists (
         select 1
           from public.workout_exercises we
           join public.workout_days d on d.id = we.day_id
           join public.workout_plans p on p.id = d.plan_id
          where p.subject_id = p_subject and we.exercise_id = e.id
       ) or exists (
         select 1
           from public.workout_log_sets ls
           join public.workout_logs l on l.id = ls.log_id
          where l.subject_id = p_subject and ls.exercise_id = e.id
       )
    ), '[]'::jsonb)
  );

  -- O snapshot e o evento nascem na mesma transacao: nao ha exportacao de
  -- dados sem trilha nem duplicidade por uma segunda chamada best-effort.
  insert into public.audit_logs (org_id, user_id, action, table_name, row_id, at)
  values (v_subject.org_id, v_actor, 'SUBJECT_EXPORT', 'subjects', p_subject, now());
  return v_export;
end;
$$;

revoke execute on function public.export_subject_data(uuid) from public, anon;
grant execute on function public.export_subject_data(uuid) to authenticated;

-- =====================================================================
-- CLIENT ERRORS: identidade/horario server-side, URL sensivel redigida,
-- rate limit por usuario e retencao operacional de 90 dias.
-- =====================================================================
create index if not exists client_errors_user_at_idx
  on public.client_errors (user_id, at desc);

create or replace function app.client_error_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not app.is_member(new.org_id) then
    raise exception 'usuario nao pertence a organizacao';
  end if;
  if (select count(*) from public.client_errors e
       where e.user_id = v_actor and e.at > now() - interval '1 hour') >= 120 then
    raise exception 'limite de registros de erro atingido';
  end if;
  new.user_id := v_actor;
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

drop trigger if exists client_errors_b1_guard on public.client_errors;
create trigger client_errors_b1_guard
  before insert on public.client_errors
  for each row execute function app.client_error_guard();

create or replace function public.purge_client_errors(
  p_before timestamptz default (now() - interval '90 days'),
  p_limit int default 5000
)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_limit not between 1 and 20000 or p_before > now() then
    raise exception 'parametros de purge invalidos';
  end if;
  with doomed as (
    select e.id from public.client_errors e
     where e.at < p_before order by e.at limit p_limit
     for update skip locked
  )
  delete from public.client_errors e using doomed d where d.id = e.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.purge_client_errors(timestamptz, int) from public, anon, authenticated;
grant execute on function public.purge_client_errors(timestamptz, int) to service_role;

-- Funcoes internas nao sao API publica, embora triggers possam executa-las.
revoke execute on function app.canonical_consent_version() from public;
revoke execute on function app.canonical_consent_text(text) from public;
revoke execute on function app.validate_subject_guardian() from public;
revoke execute on function app.consent_before_insert() from public;
revoke execute on function app.consent_update_guard() from public;
revoke execute on function app.anamnese_intake_insert_guard() from public;
revoke execute on function app.anamnese_intake_update_guard() from public;
revoke execute on function app.block_photo_row_delete_with_objects() from public;
revoke execute on function app.block_subject_delete_with_objects() from public;
revoke execute on function app.block_posture_session_delete_with_objects() from public;
revoke execute on function app.block_organization_delete_with_objects() from public;
revoke execute on function app.org_member_governance_guard() from public;
revoke execute on function app.client_error_guard() from public;

-- Marcador sem estado para o deploy impedir que um frontend dependente desta
-- migration seja publicado contra um schema remoto ainda desatualizado.
create or replace function public.app_schema_version()
returns text
language sql immutable set search_path = ''
as $$ select '0020'::text $$;

revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;

commit;
