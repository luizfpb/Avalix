-- 0041 — o profissional salva a sessão no meio e continua depois.
-- Aplicar depois da 0040. Não altera tabela, RLS, policies nem dado existente.
--
-- A Execução só gravava no servidor ao "Registrar treino", com a sessão
-- inteira. O rascunho automático fica NO APARELHO: não acompanha quem troca do
-- celular para o computador, some no logout, e nada na tela dizia que ele
-- existia — o aviso de saída falava em "sair sem salvar". Quem precisava parar
-- no meio perdia a sessão ou registrava um treino incompleto como feito.
--
-- A 0039 já separa sessão em andamento (`workout_logs.in_progress`) de sessão
-- concluída para o aluno. Esta função dá o mesmo caminho ao profissional:
--   - sem p_log: cria a sessão, em andamento ou já concluída;
--   - com p_log: continua uma sessão DO PROFISSIONAL ainda em andamento —
--     regrava cabeçalho e séries e, com p_in_progress = false, conclui.
-- Concorrência otimista pelo updated_at, como as demais edições de sessão:
-- dois aparelhos continuando a mesma sessão não se sobrescrevem calados.
--
-- security invoker: RLS e MFA das tabelas valem como no create_workout_log.
-- Sessão concluída ou do aluno não passa por aqui; corrigir sessão registrada
-- continua sendo update_workout_log.
begin;

create or replace function public.save_trainer_workout_session(
  p_plan                uuid,
  p_sets                jsonb,
  p_in_progress         boolean,
  p_log                 uuid default null,
  p_expected_updated_at timestamptz default null,
  p_day_label           text default null,
  p_week_number         int default null,
  p_performed_at        date default null,
  p_notes               text default null
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
    insert into public.workout_logs
      (plan_id, day_label, week_number, performed_at, notes, in_progress)
    values
      (p_plan, p_day_label, p_week_number, coalesce(p_performed_at, current_date), p_notes, p_in_progress)
    returning * into v_log;
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
  uuid, jsonb, boolean, uuid, timestamptz, text, int, date, text) from public, anon;
grant execute on function public.save_trainer_workout_session(
  uuid, jsonb, boolean, uuid, timestamptz, text, int, date, text) to authenticated;

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0041'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
