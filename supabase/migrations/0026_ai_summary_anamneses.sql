-- =====================================================================
-- 0026 - Estende a auditoria AI_SUMMARY para a tabela anamneses.
--
-- POR QUE
-- A v2.5 passa a gerar prompts de parecer para IA externa: o app monta um
-- texto com o material do avaliado, o profissional copia e cola na IA que ele
-- ja usa. O app nao chama IA nenhuma e nada e enviado por ele, mas o ato de
-- copiar e uma saida de dado de saude do sistema e precisa ficar na trilha,
-- pelo mesmo motivo que PDF_REPORT e EXPORT_CSV ja ficam.
--
-- A acao 'AI_SUMMARY' ja existe no CHECK de audit_logs.action desde a 0020, e
-- a matriz acao/alvo de log_data_action ja aceita o par (AI_SUMMARY,
-- assessments) - isso cobre os prompts de avaliacao isolada, de serie e o
-- briefing. Falta so o par (AI_SUMMARY, anamneses), do prompt de anamnese.
--
-- COMO
-- create or replace da log_data_action com a MESMA assinatura da 0020 (sem
-- drop, sem mudanca de argumento, os grants seguem valendo). Duas linhas
-- entram:
--   1. na matriz acao/alvo, o par (AI_SUMMARY, anamneses);
--   2. no case por tabela, a resolucao de org_id/subject_id via
--      public.anamneses, igual ao que ja e feito para assessments.
-- Todo o resto do corpo e identico ao da 0020, incluindo o gate de MFA, a
-- checagem de organizacao e o can_view_subject_id.
--
-- Nao ha mudanca de esquema, de dado ou de RLS. Sem esta migration o app
-- funciona igual: logDataAction so registra um warn no console quando a RPC
-- recusa o alvo, e a copia do prompt acontece do mesmo jeito. O que se perde
-- e a linha na auditoria.
-- =====================================================================

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
    or (p_action = 'AI_SUMMARY' and p_table_name in ('assessments','anamneses'))
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
    when 'anamneses' then
      -- mesma forma do assessments: com row_id resolve pela propria anamnese;
      -- sem row_id (prompt de um material que ainda nao virou registro) cai no
      -- subject informado.
      if p_row_id is not null then
        select an.org_id, an.subject_id into v_org, v_subject
          from public.anamneses an where an.id = p_row_id;
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

-- A 0020 ja revogou de public/anon e concedeu a authenticated; create or
-- replace preserva os grants. Reafirmados aqui para a migration ser
-- auto-suficiente se rodada isolada num banco novo.
revoke execute on function public.log_data_action(uuid, text, text, uuid, uuid)
  from public, anon;
grant execute on function public.log_data_action(uuid, text, text, uuid, uuid)
  to authenticated;

-- Convencao do projeto: toda migration reescreve o carimbo de versao, e o
-- gate de deploy (scripts/check-schema-version.mjs) compara com
-- EXPECTED_SCHEMA_VERSION. Os dois sobem juntos nesta entrega, entao publicar
-- o frontend antes de aplicar esta migration falha no CI de proposito.
create or replace function public.app_schema_version()
returns text
language sql immutable set search_path = ''
as $$ select '0026'::text $$;

revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
