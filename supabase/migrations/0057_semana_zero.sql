-- 0057 — semana 0 do mesociclo: a semana de adaptação antes da semana 1.
-- Aplicar depois da 0056. Não altera dado existente, RLS nem policy.
--
-- A semana 0 fica fora da contagem do mesociclo: workout_plans.weeks continua
-- sendo o total de semanas 1..N, e a semana 0 vale em todo plano. Ela pode ter
-- rótulo, deload, observação e overrides no plano (workout_weeks e
-- workout_week_overrides), ser escolhida ao registrar a sessão e ao corrigir
-- uma sessão registrada.
--
-- Mudanças:
-- - checks de week_number em workout_weeks, workout_week_overrides e
--   workout_logs passam de >= 1 para >= 0. Os checks são localizados pelo
--   catálogo (nome gerado pelo Postgres na 0006/0009) e recriados com nome
--   explícito. Os gatilhos check_week_within_plan (0006) e
--   check_workout_log_week (0039) só conferem o teto, então seguem iguais.
-- - submit_workout_session_0027_internal (corpo da 0039),
--   update_workout_log e update_workout_session_for_link (corpos da 0055)
--   aceitam a semana 0. Mesma assinatura: create or replace, sem sobrecarga,
--   e os grants existentes continuam valendo. Nada além do limite inferior
--   muda nesses corpos.
-- - create_workout_log e save_trainer_workout_session (0043) não conferem o
--   piso por conta própria; o check da tabela era quem barrava.
begin;

do $$
declare
  v_tab text;
  v_con record;
begin
  foreach v_tab in array array['workout_weeks', 'workout_week_overrides', 'workout_logs'] loop
    for v_con in
      select c.conname
        from pg_constraint c
       where c.conrelid = ('public.' || v_tab)::regclass
         and c.contype = 'c'
         and pg_get_constraintdef(c.oid) ~ 'week_number >= 1'
    loop
      execute format('alter table public.%I drop constraint %I', v_tab, v_con.conname);
    end loop;
  end loop;
end;
$$;

alter table public.workout_weeks
  add constraint workout_weeks_week_number_check check (week_number >= 0);
alter table public.workout_week_overrides
  add constraint workout_week_overrides_week_number_check check (week_number >= 0);
alter table public.workout_logs
  add constraint workout_logs_week_number_check check (week_number is null or week_number >= 0);

-- ------------------------------------------------- registro pelo link (aluno)

create or replace function public.submit_workout_session_0027_internal(
  p_token        text,
  p_client_ref   uuid,
  p_sets         jsonb,
  p_day_label    text default null,
  p_week_number  int default null,
  p_performed_at date default null,
  p_notes        text default null,
  p_plan         uuid default null,  -- plano de origem (fila offline); confere, nao escolhe
  p_feel         int default null,   -- 1 dificil, 2 normal, 3 bem (0038); nulo = nao respondeu
  p_in_progress  boolean default false -- salvo para continuar depois (0039)
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_link      public.workout_links;
  v_plan      uuid;
  v_weeks     int;
  v_log       public.workout_logs;
  v_data      date := coalesce(p_performed_at, current_date);
  v_novo      boolean := false;
  v_writes    int;
  v_sessoes   int;
begin
  if p_client_ref is null then
    raise exception 'client_ref obrigatorio';
  end if;

  select * into v_link
    from public.workout_links
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and status = 'active'
     and expires_at > now()
     for update;
  if v_link.id is null then
    raise exception 'link invalido ou expirado';
  end if;

  -- plano: o vigente do aluno. p_plan so pode APONTAR para outro plano DO MESMO
  -- aluno (o caso da fila offline, quando o treinador publicou um plano novo
  -- enquanto a sessao esperava para subir): quem delimita o universo continua
  -- sendo o token, nunca o cliente.
  select id into v_plan
    from public.workout_plans
   where subject_id = v_link.subject_id and status = 'active';

  if p_plan is not null then
    perform 1 from public.workout_plans
     where id = p_plan and subject_id = v_link.subject_id;
    if not found then
      raise exception 'plano nao pertence a este aluno';
    end if;
    v_plan := p_plan;
  end if;

  if v_plan is null then
    raise exception 'sem treino vigente';
  end if;

  -- rate limit: janela de 1 hora na propria linha do link
  if v_link.write_window_at is null or v_link.write_window_at < now() - interval '1 hour' then
    update public.workout_links
       set write_window_at = now(), writes_count = 0
     where id = v_link.id
     returning writes_count into v_writes;
  else
    v_writes := v_link.writes_count;
  end if;
  if v_writes >= 30 then
    raise exception 'muitas gravacoes; tente de novo mais tarde';
  end if;

  -- tetos de tamanho (o token e a credencial, mas o portador controla o request)
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
  -- O check da coluna ja garante o dominio; aqui o erro sai legivel antes de
  -- qualquer escrita, como as demais validacoes de payload desta funcao.
  if p_feel is not null and p_feel not between 1 and 3 then
    raise exception 'sensacao da sessao invalida';
  end if;

  -- data: janela de 7 dias por causa da fila offline (quem treinou sem sinal
  -- sobe a sessao dias depois, e com a data em que ela aconteceu)
  if v_data > current_date or v_data < current_date - 7 then
    raise exception 'data de execucao fora da janela permitida';
  end if;

  if p_day_label is not null then
    perform 1 from public.workout_days
     where plan_id = v_plan and label = p_day_label;
    if not found then
      raise exception 'divisao inexistente neste plano';
    end if;
  end if;

  select weeks into v_weeks from public.workout_plans where id = v_plan;
  if p_week_number is not null and p_week_number not between 0 and v_weeks then
    raise exception 'semana fora do mesociclo';
  end if;

  -- Escopo do exercicio: existe e nao e custom de OUTRA organizacao (mesma
  -- regra do trigger check_exercise_scope, antecipada para o erro sair legivel).
  -- Nao exige que o exercicio esteja no PLANO: ver 0038.
  if exists (
    select 1 from jsonb_array_elements(p_sets) s
     where not exists (
       select 1 from public.exercises x
        where x.id = (s->>'exercise_id')::uuid
          and (x.org_id is null or x.org_id = v_link.org_id))
  ) then
    raise exception 'exercicio desconhecido';
  end if;

  -- (exercicio, numero da serie) repetido no payload: a unique de
  -- workout_log_sets barraria, mas com erro ilegivel para o aluno
  if exists (
    select 1 from jsonb_array_elements(p_sets) s
     group by (s->>'exercise_id'), (s->>'set_number')
    having count(*) > 1
  ) then
    raise exception 'serie repetida no envio';
  end if;

  -- teto por DATA DE EXECUCAO, nao por data de gravacao: contar pela gravacao
  -- faria a sincronizacao de uma semana offline bater no limite.
  select count(*) into v_sessoes
    from public.workout_logs
   where plan_id = v_plan
     and performed_at = v_data
     and source = 'student'
     and client_ref is distinct from p_client_ref;
  if v_sessoes >= 3 then
    raise exception 'limite de sessoes para esta data';
  end if;

  -- upsert idempotente por (plan_id, client_ref)
  select * into v_log
    from public.workout_logs
   where plan_id = v_plan and client_ref = p_client_ref
     for update;

  if v_log.id is null then
    insert into public.workout_logs
      (plan_id, day_label, week_number, performed_at, notes, source, client_ref, feel, in_progress)
    values
      (v_plan, p_day_label, p_week_number, v_data, p_notes, 'student', p_client_ref, p_feel,
       coalesce(p_in_progress, false))
    returning * into v_log;
    v_novo := true;
  else
    update public.workout_logs
       set day_label = p_day_label, week_number = p_week_number,
           performed_at = v_data, notes = p_notes, feel = p_feel,
           in_progress = coalesce(p_in_progress, false)
     where id = v_log.id;
  end if;

  -- apaga filhas e regrava, o mesmo padrao de save_workout_plan
  delete from public.workout_log_sets where log_id = v_log.id;

  insert into public.workout_log_sets
    (org_id, log_id, exercise_id, set_number, weight_kg, reps, rir, rest_seconds, reached_failure)
  select v_log.org_id, v_log.id,
         (s->>'exercise_id')::uuid, (s->>'set_number')::int,
         (s->>'weight_kg')::numeric, (s->>'reps')::int, (s->>'rir')::numeric,
         (s->>'rest_seconds')::int, (s->>'reached_failure')::boolean
    from jsonb_array_elements(p_sets) s;

  update public.workout_links
     set writes_count    = v_writes + 1,
         last_write_at   = now(),
         sessions_count  = sessions_count + (case when v_novo then 1 else 0 end)
   where id = v_link.id;

  return jsonb_build_object('ok', true, 'log_id', v_log.id, 'plan_id', v_plan);
end;
$$;


-- ------------------------------------------------- correção (profissional)

create or replace function public.update_workout_log(
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
     and (p_week_number < 0 or p_week_number > v_weeks) then
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

-- ------------------------------------------------- correção (aluno)

create or replace function public.update_workout_session_for_link(
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
     and (p_week_number < 0 or p_week_number > v_weeks) then
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

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0057'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
