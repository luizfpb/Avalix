-- 0045 — correções da auditoria de 06/10/2026 que estão no banco (A01 e A10).
-- Aplicar depois da 0044. Não altera tabela, coluna, RLS, policy nem dado
-- existente: troca o corpo de três funções, com as mesmas assinaturas e os
-- mesmos grants.
--
-- A01. O link do aluno sobrescrevia uma sessão registrada pelo profissional.
-- Desde a 0043 a sessão do profissional também tem client_ref, e o pacote do
-- aluno (plan_week_log) mostrava a referência de todas as sessões do plano. O
-- envio público (submit_workout_session) procura a sessão por (plan_id,
-- client_ref) sem olhar quem a registrou: com a referência lida do pacote, o
-- portador do link trocava as séries e a observação, e a linha continuava
-- marcada como do profissional. A correção pelo histórico
-- (update_workout_session_for_link) já recusava, porque confere a origem. Agora:
--   - o envio recusa a sessão que não é do aluno, antes de qualquer escrita;
--   - o pacote só mostra a referência das sessões do aluno.
--
-- A10. O aceite da anamnese recebida por link gravava a data da coleta pelo
-- fuso da sessão do banco (UTC): o envio às 22h30 de 05/10 em São Paulo virava
-- anamnese de 06/10, e a revisão no app mostrava 05/10. A data passa a ser a
-- civil de São Paulo, a mesma do app. As anamneses já aceitas não mudam.
begin;

-- ---------------------------------------------------------------- A01: pacote

create or replace function public.get_workout_for_link(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_link public.workout_links;
  v_plan uuid;
  v_current_sessions int := 0;
  -- Últimas sessões CONCLUÍDAS do plano ativo, da mais recente para a mais
  -- antiga, com a identidade de cada uma (ver cabeçalho, item 2).
  v_week_log jsonb := '[]'::jsonb;
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
      from public.workout_logs l
     where l.plan_id = v_plan and not l.in_progress;

    -- A referência sai só nas sessões do aluno (0045): é o que a tela usa
    -- para não contar duas vezes o treino feito no aparelho. A do
    -- profissional (0043) não tem uso aqui, e com ela o link alcançava a
    -- sessão dele pelo envio público.
    select coalesce(jsonb_agg(jsonb_build_object(
             'performed_at', x.performed_at,
             'week_number', x.week_number,
             'client_ref', case when x.source = 'student' then x.client_ref end)
           order by x.performed_at desc, x.created_at desc, x.id desc), '[]'::jsonb)
      into v_week_log
      from (select l.performed_at, l.week_number, l.client_ref, l.source, l.created_at, l.id
              from public.workout_logs l
             where l.plan_id = v_plan and not l.in_progress
             order by l.performed_at desc, l.created_at desc, l.id desc
             limit 40) x;
  end if;

  v_out := jsonb_build_object(
    'org_name', (select o.name from public.organizations o where o.id = v_link.org_id),
    'subject_first_name', (select split_part(s.full_name, ' ', 1)
                             from public.subjects s where s.id = v_link.subject_id),
    'link_expires_at', v_link.expires_at,
    'current_plan_sessions', v_current_sessions,
    'plan_week_log', v_week_log,
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

-- ---------------------------------------------------------------- A01: envio

create or replace function public.submit_workout_session(
  p_token           text,
  p_client_ref      uuid,
  p_sets            jsonb,
  p_day_label       text default null,
  p_week_number     int default null,
  p_performed_at    date default null,
  p_notes           text default null,
  p_plan            uuid default null,
  p_client_revision int default 1,
  p_feel            int default null,
  p_in_progress     boolean default false
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

  -- Sessão registrada pelo profissional não é do link (0045): nem com a
  -- referência certa o envio do aluno troca as séries dela. A correção pelo
  -- histórico já conferia a origem; o envio comum, não.
  if v_log.id is not null and v_log.source is distinct from 'student' then
    raise exception 'registro de treino indisponivel';
  end if;

  -- Uma correção explícita substitui a captura original. Nenhuma revisão da
  -- fila pode voltar a ser a fonte de verdade, nem mesmo com número maior.
  if v_log.corrected_at is not null then
    return jsonb_build_object(
      'ok', true, 'stale', true, 'corrected', true,
      'log_id', v_log.id, 'plan_id', v_plan,
      'client_revision', v_log.client_revision
    );
  end if;

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
    p_notes, v_plan, p_feel, coalesce(p_in_progress, false)
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
  text, uuid, jsonb, text, int, date, text, uuid, int, int, boolean) from public;
grant execute on function public.submit_workout_session(
  text, uuid, jsonb, text, int, date, text, uuid, int, int, boolean) to anon, authenticated;

-- ---------------------------------------------------------------- A10: aceite

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
    -- Data civil da coleta no fuso do app (0045). O cast direto usava o fuso
    -- da sessão do banco (UTC): o envio às 22h30 virava anamnese do dia seguinte.
    (v_intake.org_id, v_subject_id,
     coalesce((v_intake.submitted_at at time zone 'America/Sao_Paulo')::date,
              (now() at time zone 'America/Sao_Paulo')::date),
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

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0045'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
