-- 0055 — a correção de uma sessão registrada também corrige a semana.
-- Aplicar depois da 0054. Não altera tabela, RLS, policy nem dado existente.
--
-- A 0033 deixou plano, divisão e semana fora da correção: eram a referência
-- original da sessão. Na prática a semana é digitada (ou aceita da sugestão)
-- no registro, e quem marcou a semana errada ficava sem saída a não ser
-- apagar o treino e lançar de novo. Desde a 0037 a semana sugerida vem do
-- histórico, então um número errado ainda empurra a sugestão das sessões
-- seguintes.
--
-- update_workout_log e update_workout_session_for_link ganham
-- p_week_number (default NULL = manter a semana atual). Por isso o app antigo
-- em cache, que não manda o argumento, continua funcionando igual. A semana
-- precisa caber no mesociclo do plano da sessão, como na criação
-- (check_workout_log_week da 0039 confere de novo no UPDATE), e a coluna só é
-- tocada quando muda. Plano e
-- divisão continuam fixos. Não há como limpar a semana: sessões sem semana
-- (legado) podem recebê-la, não perdê-la.
--
-- drop antes do create: create or replace com um argumento a mais criaria
-- uma SOBRECARGA, e o PostgREST ficaria ambíguo (mesmo padrão da 0038).
-- Corpos iguais aos da 0033 (profissional) e da 0046 (aluno), fora a semana.
-- Grants reemitidos com a assinatura nova.
begin;

drop function public.update_workout_log(uuid, timestamptz, jsonb, date, text);

create function public.update_workout_log(
  p_log                 uuid,
  p_expected_updated_at timestamptz,
  p_sets                jsonb,
  p_performed_at        date,
  p_notes               text default null,
  p_week_number         int default null
)
returns public.workout_logs
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_log public.workout_logs;
  v_max_sets int;
  v_max_payload int;
  v_max_notes int;
  v_weeks int;
begin
  if p_expected_updated_at is null then
    raise exception 'versao do registro de treino obrigatoria';
  end if;

  select * into v_log from public.workout_logs where id = p_log;
  if v_log.id is null then
    raise exception 'registro de treino indisponivel';
  end if;

  -- A ordem de locks é a mesma da sincronização: plano, chave da sessão, log.
  select weeks into v_weeks from public.workout_plans where id = v_log.plan_id for share;
  if not found then
    raise exception 'registro de treino indisponivel';
  end if;
  if v_log.client_ref is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_log.plan_id::text || ':' || v_log.client_ref::text, 0));
  end if;
  select * into v_log from public.workout_logs where id = p_log for update;
  if v_log.id is null then
    raise exception 'registro de treino indisponivel';
  end if;
  if v_log.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001',
      message = 'registro de treino alterado por outra pessoa; recarregue antes de salvar';
  end if;

  -- A criação profissional anterior não tinha os tetos do link público.
  -- Permitir o tamanho que já existe evita exigir apagar dados para corrigir;
  -- registros maiores não podem crescer indefinidamente a cada edição.
  select greatest(60, count(*)::int),
         greatest(16384, coalesce(pg_column_size(jsonb_agg(to_jsonb(s))), 0))
    into v_max_sets, v_max_payload
    from public.workout_log_sets s where s.log_id = p_log;
  v_max_notes := greatest(600, char_length(coalesce(v_log.notes, '')));

  if p_sets is null or jsonb_typeof(p_sets) <> 'array' then
    raise exception 'series obrigatorias';
  end if;
  if jsonb_array_length(p_sets) not between 1 and v_max_sets then
    raise exception 'quantidade de series fora do limite';
  end if;
  if pg_column_size(p_sets) > v_max_payload then
    raise exception 'payload de series grande demais';
  end if;
  if char_length(coalesce(p_notes, '')) > v_max_notes then
    raise exception 'observacao grande demais';
  end if;
  if p_performed_at is null or p_performed_at > current_date or not isfinite(p_performed_at) then
    raise exception 'data de execucao invalida';
  end if;
  if p_week_number is not null and p_week_number is distinct from v_log.week_number
     and (p_week_number < 1 or p_week_number > v_weeks) then
    raise exception 'semana fora do mesociclo' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_sets) s
     where not exists (
       select 1 from public.exercises x
        where x.id = (s->>'exercise_id')::uuid
          and (x.org_id is null or x.org_id = v_log.org_id))
  ) then
    raise exception 'exercicio desconhecido';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_sets) s
     group by (s->>'exercise_id'), (s->>'set_number') having count(*) > 1
  ) then
    raise exception 'serie repetida no envio';
  end if;

  -- Só toca a coluna quando ela muda: o gatilho da 0039 dispara com a coluna
  -- no SET mesmo sem mudança, e uma sessão antiga numa semana que o plano não
  -- tem mais deixaria de ser corrigível.
  if p_week_number is not null and p_week_number is distinct from v_log.week_number then
    update public.workout_logs set week_number = p_week_number where id = p_log;
  end if;
  update public.workout_logs
     set performed_at = p_performed_at, notes = p_notes, corrected_at = clock_timestamp()
   where id = p_log
   returning * into v_log;
  if v_log.id is null then
    raise exception 'registro de treino indisponivel';
  end if;
  delete from public.workout_log_sets where log_id = p_log;
  insert into public.workout_log_sets
    (org_id, log_id, exercise_id, set_number, weight_kg, reps, rir, rest_seconds, reached_failure)
  select v_log.org_id, p_log, (s->>'exercise_id')::uuid, (s->>'set_number')::int,
         (s->>'weight_kg')::numeric, (s->>'reps')::int, (s->>'rir')::numeric,
         (s->>'rest_seconds')::int, (s->>'reached_failure')::boolean
    from jsonb_array_elements(p_sets) s;

  return v_log;
end;
$$;

revoke execute on function public.update_workout_log(uuid, timestamptz, jsonb, date, text, int)
  from public, anon;
grant execute on function public.update_workout_log(uuid, timestamptz, jsonb, date, text, int)
  to authenticated;

-- ---------------------------------------------------------------- aluno

drop function public.update_workout_session_for_link(text, uuid, timestamptz, jsonb, date, text);

create function public.update_workout_session_for_link(
  p_token               text,
  p_log                 uuid,
  p_expected_updated_at timestamptz,
  p_sets                jsonb,
  p_performed_at        date,
  p_notes               text default null,
  p_week_number         int default null
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_link public.workout_links;
  v_log public.workout_logs;
  v_writes int;
  v_weeks int;
begin
  if p_expected_updated_at is null then
    raise exception 'versao do registro de treino obrigatoria';
  end if;
  select * into v_link from public.workout_links
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and status = 'active' and expires_at > now();
  if v_link.id is null then
    raise exception 'link invalido ou expirado';
  end if;
  select * into v_log from public.workout_logs
   where id = p_log and subject_id = v_link.subject_id and source = 'student';
  if v_log.id is null then
    raise exception 'registro de treino indisponivel';
  end if;

  select weeks into v_weeks from public.workout_plans
   where id = v_log.plan_id and subject_id = v_link.subject_id
     and status in ('active', 'archived') for share;
  if not found then
    raise exception 'registro de treino indisponivel';
  end if;
  if v_log.client_ref is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_log.plan_id::text || ':' || v_log.client_ref::text, 0));
  end if;
  select * into v_log from public.workout_logs
   where id = p_log and subject_id = v_link.subject_id and source = 'student' for update;
  if v_log.id is null then
    raise exception 'registro de treino indisponivel';
  end if;
  if v_log.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001',
      message = 'registro de treino alterado por outra pessoa; recarregue antes de salvar';
  end if;

  -- Revalidar o link sob lock fecha revogação/expiração enquanto a sessão espera.
  select * into v_link from public.workout_links
   where id = v_link.id and status = 'active' and expires_at > clock_timestamp() for update;
  if v_link.id is null then
    raise exception 'link invalido ou expirado';
  end if;
  v_writes := case
    when v_link.write_window_at is null or v_link.write_window_at < now() - interval '1 hour'
      then 0
    else v_link.writes_count
  end;
  if v_writes >= 30 then
    raise exception 'muitas gravacoes; tente de novo mais tarde';
  end if;

  -- Mover uma sessão não abre um contorno do teto da gravação original.
  -- A correção que mantém a data continua possível mesmo em legados maiores.
  if p_performed_at is distinct from v_log.performed_at and (
    select count(*) from public.workout_logs
     where plan_id = v_log.plan_id and source = 'student'
       and performed_at = p_performed_at and id <> p_log
  ) >= 3 then
    raise exception 'limite de sessoes para esta data';
  end if;

  if p_sets is null or jsonb_typeof(p_sets) <> 'array' then
    raise exception 'series obrigatorias';
  end if;
  if jsonb_array_length(p_sets) not between 1 and 60 then
    raise exception 'quantidade de series fora do limite';
  end if;
  if pg_column_size(p_sets) > 16384 then
    raise exception 'payload de series grande demais';
  end if;
  if char_length(coalesce(p_notes, '')) > 600 then
    raise exception 'observacao grande demais';
  end if;
  if p_performed_at is null or p_performed_at > current_date or not isfinite(p_performed_at) then
    raise exception 'data de execucao invalida';
  end if;
  if p_week_number is not null and p_week_number is distinct from v_log.week_number
     and (p_week_number < 1 or p_week_number > v_weeks) then
    raise exception 'semana fora do mesociclo' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_sets) s
     where not exists (
       select 1 from public.exercises x
        where x.id = (s->>'exercise_id')::uuid
          and (x.org_id is null or x.org_id = v_log.org_id))
  ) then
    raise exception 'exercicio desconhecido';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_sets) s
     group by (s->>'exercise_id'), (s->>'set_number') having count(*) > 1
  ) then
    raise exception 'serie repetida no envio';
  end if;

  if p_week_number is not null and p_week_number is distinct from v_log.week_number then
    update public.workout_logs set week_number = p_week_number where id = p_log;
  end if;
  update public.workout_logs
     set performed_at = p_performed_at, notes = p_notes, corrected_at = clock_timestamp()
   where id = p_log returning * into v_log;
  delete from public.workout_log_sets where log_id = p_log;
  insert into public.workout_log_sets
    (org_id, log_id, exercise_id, set_number, weight_kg, reps, rir, rest_seconds, reached_failure)
  select v_log.org_id, p_log, (s->>'exercise_id')::uuid, (s->>'set_number')::int,
         (s->>'weight_kg')::numeric, (s->>'reps')::int, (s->>'rir')::numeric,
         (s->>'rest_seconds')::int, (s->>'reached_failure')::boolean
    from jsonb_array_elements(p_sets) s;

  update public.workout_links
     set writes_count = v_writes + 1, last_write_at = now(),
         write_window_at = case when v_writes = 0 then now() else write_window_at end
   where id = v_link.id;

  return jsonb_build_object(
    'id', v_log.id, 'plan_id', v_log.plan_id, 'performed_at', v_log.performed_at,
    'day_label', v_log.day_label, 'week_number', v_log.week_number,
    'plan_name', (select name from public.workout_plans where id = v_log.plan_id),
    'source', v_log.source, 'notes', v_log.notes, 'feel', v_log.feel,
    'in_progress', v_log.in_progress,
    'updated_at', v_log.updated_at,
    'sets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'exercise_id', st.exercise_id, 'exercise_name', x.name,
        'set_number', st.set_number, 'weight_kg', st.weight_kg,
        'reps', st.reps, 'rir', st.rir, 'rest_seconds', st.rest_seconds,
        'reached_failure', st.reached_failure) order by st.entry_order nulls last, x.name, st.set_number, st.id)
      from public.workout_log_sets st
      join public.exercises x on x.id = st.exercise_id
      where st.log_id = v_log.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.update_workout_session_for_link(text, uuid, timestamptz, jsonb, date, text, int)
  from public;
grant execute on function public.update_workout_session_for_link(text, uuid, timestamptz, jsonb, date, text, int)
  to anon, authenticated;

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0055'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
