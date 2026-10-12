-- 0046 — a sessão registrada guarda a ordem em que os exercícios foram feitos.
-- Aplicar depois da 0045.
--
-- O profissional reordena os exercícios na Execução (a academia impõe outra
-- ordem que a do plano), mas workout_log_sets não guardava ordem nenhuma: o
-- histórico do profissional saía na ordem do número da série, o do aluno em
-- ordem alfabética, e a sessão salva para continuar depois voltava na ordem do
-- plano. A ordem dos exercícios muda o treino (fadiga, carga possível), então
-- ela é dado da sessão.
--
-- Coluna nova `entry_order`, preenchida por uma sequência no INSERT. Todas as
-- gravações (create_workout_log, save_trainer_workout_session,
-- update_workout_log, submit_workout_session e update_workout_session_for_link)
-- já inserem as séries na ordem do array recebido, e o app monta esse array na
-- ordem da tela, exercício por exercício. Por isso nenhuma delas muda: a ordem
-- crescente de entry_order dentro de uma sessão É a ordem da tela. Toda
-- correção apaga e regrava as séries, então a ordem acompanha a correção.
--
-- Sessões anteriores a esta migration ficam com entry_order nulo (a ordem real
-- delas não existe em lugar nenhum) e continuam lidas como antes.
--
-- As leituras do link do aluno ordenavam por nome do exercício; passam a
-- ordenar por entry_order (nulo por último, e aí o critério antigo). Mesmas
-- assinaturas, corpos iguais aos da 0039 fora a ordenação; create or replace
-- preserva os grants. get_workout_history_for_link (0033) não é mais chamada
-- pelo app e fica como está.
begin;

create sequence public.workout_log_sets_entry_order_seq as bigint;

alter table public.workout_log_sets add column entry_order bigint;
alter table public.workout_log_sets
  alter column entry_order set default nextval('public.workout_log_sets_entry_order_seq');
alter sequence public.workout_log_sets_entry_order_seq
  owned by public.workout_log_sets.entry_order;

-- create_workout_log, save_trainer_workout_session e update_workout_log são
-- security invoker: o INSERT roda como authenticated e o default precisa da
-- sequência.
revoke all on sequence public.workout_log_sets_entry_order_seq from public, anon;
grant usage on sequence public.workout_log_sets_entry_order_seq to authenticated;

comment on column public.workout_log_sets.entry_order is
  'Ordem de gravacao da serie dentro da sessao (= ordem dos exercicios na tela). Nulo nas sessoes anteriores a 0046.';

-- ---------------------------------------------------------------- correção

create or replace function public.update_workout_session_for_link(
  p_token               text,
  p_log                 uuid,
  p_expected_updated_at timestamptz,
  p_sets                jsonb,
  p_performed_at        date,
  p_notes               text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_link public.workout_links;
  v_log public.workout_logs;
  v_writes int;
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

  perform 1 from public.workout_plans
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

-- ---------------------------------------------------------------- histórico

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
    select l.id, l.plan_id, l.performed_at, l.day_label, l.week_number, l.notes,
           l.source, l.feel, l.in_progress, l.created_at, l.updated_at, p.name as plan_name
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
             'plan_id', s.plan_id,
             'performed_at', s.performed_at,
             'day_label', s.day_label,
             'week_number', s.week_number,
             'plan_name', s.plan_name,
             'source', s.source,
             'notes', s.notes,
             'feel', s.feel,
             'in_progress', s.in_progress,
             'updated_at', s.updated_at,
             'sets', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'exercise_id', st.exercise_id,
                        'exercise_name', x.name,
                        'set_number', st.set_number,
                        'weight_kg', st.weight_kg,
                        'reps', st.reps,
                        'rir', st.rir,
                        'rest_seconds', st.rest_seconds,
                        'reached_failure', st.reached_failure)
                      order by st.entry_order nulls last, x.name, st.set_number, st.id)
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

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0046'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
