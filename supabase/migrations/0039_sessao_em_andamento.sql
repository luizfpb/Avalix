-- 0039 — sessão em andamento, identidade no resumo semanal e semana validada.
-- Aplicar depois da 0038. Não altera RLS, policies nem apaga dado; acrescenta
-- uma coluna com default e recria as leituras/envios do link do aluno.
--
-- 1. SESSÃO EM ANDAMENTO. "Parar por aqui e continuar depois" grava a sessão
--    no servidor (é o que permite retomar em outro aparelho e não perder nada),
--    mas até aqui ela era indistinguível de um treino concluído: contava na
--    adesão, fechava a semana do mesociclo e avançava a divisão sugerida — mesmo
--    quando o aluno largou o treino pela metade. `workout_logs.in_progress`
--    separa as duas coisas. Default false: todo registro existente e todo
--    registro do profissional continuam sendo sessões concluídas.
--
-- 2. IDENTIDADE NO RESUMO SEMANAL. `plan_week_log` passa a trazer o
--    `client_ref` de cada sessão. A tela do aluno soma as conclusões feitas
--    nela mesma até o pacote refleti-las; sem a identidade, uma sessão que o
--    pacote já trazia era contada de novo, e a tela anunciava a semana fechada
--    (e a divisão seguinte) um treino antes da hora.
--
-- 3. ADESÃO POR SEMANAS FECHADAS. `workout_log_summary.log_count` passa a
--    contar só sessões concluídas, e `recent_dates` traz as datas das últimas
--    sessões concluídas. O denominador da adesão só cobra semanas fechadas; o
--    numerador contava também a semana em curso, e três treinos nela
--    escondiam uma semana inteira de falta.
--
-- 4. SEMANA VALIDADA PARA TODOS. O envio do aluno já recusava semana fora do
--    mesociclo; o registro do profissional aceitava qualquer número >= 1. O
--    trigger vale para qualquer caminho de escrita e só dispara quando a semana
--    é gravada, então registros antigos não são reinterpretados.
begin;

alter table public.workout_logs
  add column if not exists in_progress boolean not null default false;

comment on column public.workout_logs.in_progress is
  'Sessão salva pelo aluno para continuar depois, ainda não concluída. Não conta na adesão nem na semana do mesociclo.';

-- ---------------------------------------------------------------- semana

create or replace function app.check_workout_log_week()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_weeks int;
begin
  if new.week_number is null then
    return new;
  end if;
  select wp.weeks into v_weeks from public.workout_plans wp where wp.id = new.plan_id;
  if v_weeks is not null and new.week_number > v_weeks then
    raise exception 'semana fora do mesociclo' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists workout_logs_b2_week on public.workout_logs;
create trigger workout_logs_b2_week
  before insert or update of week_number on public.workout_logs
  for each row execute function app.check_workout_log_week();

-- ---------------------------------------------------------------- resumo

-- Colunas antigas mantêm nome, tipo e ordem; recent_dates entra no fim.
-- create or replace preserva a view, os grants e o security_invoker da 0016.
create or replace view public.workout_log_summary
with (security_invoker = true) as
  select
    plan_id,
    org_id,
    (count(*) filter (where not in_progress))::int as log_count,
    max(performed_at) as last_date,
    min(performed_at) as first_date,
    -- 21 = sete dias com o teto de três sessões por data: cobre qualquer
    -- semana em curso, que é o que o cliente precisa descontar.
    ((array_agg(performed_at order by performed_at desc)
       filter (where not in_progress))[1:21]) as recent_dates
  from public.workout_logs
  group by plan_id, org_id;

-- ---------------------------------------------------------------- pacote

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

    select coalesce(jsonb_agg(jsonb_build_object(
             'performed_at', x.performed_at,
             'week_number', x.week_number,
             'client_ref', x.client_ref)
           order by x.performed_at desc, x.created_at desc, x.id desc), '[]'::jsonb)
      into v_week_log
      from (select l.performed_at, l.week_number, l.client_ref, l.created_at, l.id
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

-- ---------------------------------------------------------------- envio

-- Mesmo padrão da 0038: a assinatura ganha um argumento, então as duas
-- funções são derrubadas antes — create or replace criaria uma sobrecarga e o
-- PostgREST não saberia qual chamar. Os grants são reemitidos logo abaixo.
drop function if exists public.submit_workout_session_0027_internal(
  text, uuid, jsonb, text, int, date, text, uuid, int);
drop function if exists public.submit_workout_session(
  text, uuid, jsonb, text, int, date, text, uuid, int, int);

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
  if p_week_number is not null and p_week_number not between 1 and v_weeks then
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

revoke execute on function public.submit_workout_session_0027_internal(
  text, uuid, jsonb, text, int, date, text, uuid, int, boolean)
  from public, anon, authenticated;

revoke execute on function public.submit_workout_session(
  text, uuid, jsonb, text, int, date, text, uuid, int, int, boolean) from public;
grant execute on function public.submit_workout_session(
  text, uuid, jsonb, text, int, date, text, uuid, int, int, boolean) to anon, authenticated;

-- ---------------------------------------------------------------- correção

-- Igual à 0038, devolvendo também `in_progress`: a tela troca o item da lista
-- pelo retorno, e sem o campo a marca "não concluído" sumiria depois de uma
-- correção. A correção não conclui nem reabre a sessão.
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
        'reached_failure', st.reached_failure) order by x.name, st.set_number, st.id)
      from public.workout_log_sets st
      join public.exercises x on x.id = st.exercise_id
      where st.log_id = v_log.id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------- histórico

-- Mesma assinatura da 0038 (create or replace preserva os grants); cada item
-- passa a dizer se a sessão ficou em andamento.
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

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0039'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
