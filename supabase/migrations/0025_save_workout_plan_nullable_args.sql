-- =====================================================================
-- 0025 - Corrige a assinatura de save_workout_plan para seguir a convencao
--        de argumentos anulaveis do projeto.
--
-- O QUE ESTAVA ERRADO NA 0023
-- p_goal, p_starts_on e p_notes correspondem a colunas NULLABLE
-- (workout_plans.goal, starts_on, notes) mas foram declarados sem DEFAULT.
-- O gerador de tipos do Supabase nao modela "parametro que aceita NULL": ele
-- olha se existe DEFAULT. Sem default, ele emite `p_goal: string` (obrigatorio
-- e NAO anulavel), e o frontend nao consegue mais limpar esses campos sem
-- burlar o tipo.
--
-- Isso ja tinha sido resolvido no projeto: a 0019 declarou p_medications e
-- p_notes do save_assessment com `default null` exatamente por isso, e a
-- decisao esta registrada no DECISIONS ("args anulaveis via default null (gen
-- types futuros ficam compativeis)"). A 0023 nao seguiu a convencao; esta
-- migration alinha.
--
-- COMO
-- Os tres parametros anulaveis vao para o FIM da lista com `default null`,
-- porque o Postgres exige que todo parametro apos um com default tambem tenha
-- default - nao da para adicionar default so no meio da lista. Como a ordem
-- posicional muda, e drop + create (assinatura nova), nao create or replace.
-- O CORPO E IDENTICO ao da 0023, sem uma linha de diferenca de comportamento.
--
-- Semantica no cliente: omitir a chave passa a significar "limpar o campo",
-- que e o mesmo que o PostgREST ja faz no save_assessment. Nenhum plano
-- existente muda; a proxima gravacao usa a assinatura nova.
--
-- Seguro aplicar: o frontend com a assinatura antiga ainda NAO foi publicado
-- (o deploy e bloqueado por check:remote-schema), entao nao existe cliente em
-- producao chamando save_workout_plan.
-- =====================================================================

drop function if exists public.save_workout_plan(
  uuid, text, text, int, date, text, text, jsonb, jsonb, text, jsonb, jsonb, jsonb, uuid, uuid, timestamptz
);

create function public.save_workout_plan(
  p_plan            uuid,
  p_name            text,
  p_weeks           int,
  p_status          text,
  p_weekly_schedule jsonb,
  p_volume          jsonb,
  p_volume_engine_version text,
  p_days            jsonb,
  p_overrides       jsonb,
  p_weeks_meta      jsonb,
  -- Anulaveis: default null para o tipo gerado sair opcional (ver cabecalho).
  p_goal            text default null,
  p_starts_on       date default null,
  p_notes           text default null,
  p_source_assessment_id      uuid default null,
  p_source_posture_session_id uuid default null,
  p_expected_updated_at timestamptz default null
)
returns public.workout_plans
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_row   public.workout_plans;
  v_atual timestamptz;
begin
  select updated_at into v_atual
    from public.workout_plans
   where id = p_plan
     for update;

  if v_atual is null then
    raise exception 'plano inexistente ou sem acesso';
  end if;

  if p_expected_updated_at is not null and v_atual is distinct from p_expected_updated_at then
    raise exception using
      errcode = '40001',
      message = 'Este plano foi alterado em outro dispositivo depois que voce abriu esta tela. Recarregue para ver a versao atual antes de salvar.';
  end if;

  update public.workout_plans
     set name                  = p_name,
         goal                  = p_goal,
         weeks                 = p_weeks,
         starts_on             = p_starts_on,
         notes                 = p_notes,
         status                = p_status,
         -- weekly_schedule e text[] NOT NULL; array(select ...) devolve array
         -- vazio (nunca null) quando a lista vem vazia.
         weekly_schedule       = array(
                                   select jsonb_array_elements_text(
                                     coalesce(p_weekly_schedule, '[]'::jsonb)
                                   )
                                 ),
         volume                = p_volume,
         volume_engine_version = p_volume_engine_version,
         source_assessment_id  = p_source_assessment_id,
         source_posture_session_id = p_source_posture_session_id
   where id = p_plan
   returning * into v_row;

  if v_row.id is null then
    raise exception 'plano inexistente ou sem acesso';
  end if;

  -- Mesma transacao: cabecalho e estrutura filha nunca mais divergem.
  perform public.replace_workout_plan_children(p_plan, p_days, p_overrides, p_weeks_meta);
  return v_row;
end;
$$;

revoke execute on function public.save_workout_plan(
  uuid, text, int, text, jsonb, jsonb, text, jsonb, jsonb, jsonb, text, date, text, uuid, uuid, timestamptz
) from anon, public;
grant execute on function public.save_workout_plan(
  uuid, text, int, text, jsonb, jsonb, text, jsonb, jsonb, jsonb, text, date, text, uuid, uuid, timestamptz
) to authenticated;

create or replace function public.app_schema_version()
returns text
language sql immutable set search_path = ''
as $$ select '0025'::text $$;

revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
