-- Avalix — migration 0033: falha explícita e correção de sessões registradas.
-- Depende de 0032. NULL preserva a ausência de informação nos registros antigos;
-- RIR zero, sozinho, não prova que a série terminou em falha.
begin;

alter table public.workout_log_sets
  add column reached_failure boolean,
  add constraint workout_log_sets_reached_failure_check
    check (reached_failure is not true or (rir is not null and rir = 0));

comment on column public.workout_log_sets.reached_failure is
  'Falha declarada na série; NULL = não informado. Falha verdadeira exige RIR zero.';

alter table public.workout_logs add column corrected_at timestamptz;
comment on column public.workout_logs.corrected_at is
  'Última correção explícita; impede que um envio offline antigo substitua a sessão corrigida.';

-- O CAS compara updated_at. now() é fixo durante a transação e permitiria que
-- duas edições nela compartilhassem a versão; o carimbo deve sempre avançar.
create or replace function app.set_workout_log_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

revoke execute on function app.set_workout_log_updated_at() from public, anon, authenticated;
drop trigger workout_logs_updated_at on public.workout_logs;
create trigger workout_logs_updated_at
  before update on public.workout_logs
  for each row execute function app.set_workout_log_updated_at();

-- Correção profissional: o próprio invoker mantém a RLS/MFA das tabelas.
-- A assinatura não permite trocar plano, divisão, semana nem autoria.
create or replace function public.update_workout_log(
  p_log                 uuid,
  p_expected_updated_at timestamptz,
  p_sets                jsonb,
  p_performed_at        date,
  p_notes               text default null
)
returns public.workout_logs
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_log public.workout_logs;
  v_max_sets int;
  v_max_payload int;
  v_max_notes int;
begin
  if p_expected_updated_at is null then
    raise exception 'versao do registro de treino obrigatoria';
  end if;

  select * into v_log from public.workout_logs where id = p_log;
  if v_log.id is null then
    raise exception 'registro de treino indisponivel';
  end if;

  -- A ordem de locks é a mesma da sincronização: plano, chave da sessão, log.
  perform 1 from public.workout_plans where id = v_log.plan_id for share;
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

revoke execute on function public.update_workout_log(uuid, timestamptz, jsonb, date, text)
  from public, anon;
grant execute on function public.update_workout_log(uuid, timestamptz, jsonb, date, text)
  to authenticated;

-- O token só autoriza corrigir sessões do próprio aluno e de autoria student.
-- A data pode ser corrigida depois da janela de sete dias da fila original.
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
    'source', v_log.source, 'notes', v_log.notes, 'updated_at', v_log.updated_at,
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

revoke execute on function public.update_workout_session_for_link(text, uuid, timestamptz, jsonb, date, text)
  from public;
grant execute on function public.update_workout_session_for_link(text, uuid, timestamptz, jsonb, date, text)
  to anon, authenticated;

create or replace function public.create_workout_log(
  p_plan         uuid,
  p_sets         jsonb,
  p_day_label    text default null,
  p_week_number  int default null,
  p_performed_at date default null,
  p_notes        text default null
)
returns public.workout_logs
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_log public.workout_logs;
  v_s   jsonb;
begin
  insert into public.workout_logs (plan_id, day_label, week_number, performed_at, notes)
  values (p_plan, p_day_label, p_week_number, coalesce(p_performed_at, current_date), p_notes)
  returning * into v_log;

  for v_s in select * from jsonb_array_elements(coalesce(p_sets, '[]'::jsonb)) loop
    insert into public.workout_log_sets
      (org_id, log_id, exercise_id, set_number, weight_kg, reps, rir, rest_seconds, reached_failure)
    values
      (v_log.org_id, v_log.id, (v_s->>'exercise_id')::uuid, (v_s->>'set_number')::int,
       (v_s->>'weight_kg')::numeric, (v_s->>'reps')::int, (v_s->>'rir')::numeric,
       (v_s->>'rest_seconds')::int, (v_s->>'reached_failure')::boolean);
  end loop;

  return v_log;
end;
$$;

create or replace function public.submit_workout_session_0027_internal(
  p_token        text,
  p_client_ref   uuid,
  p_sets         jsonb,
  p_day_label    text default null,
  p_week_number  int default null,
  p_performed_at date default null,
  p_notes        text default null,
  p_plan         uuid default null   -- plano de origem (fila offline); confere, nao escolhe
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

  -- Escopo do exercicio: existe e nao e custom de OUTRA organizacao. E a mesma
  -- regra que o trigger check_exercise_scope (0009 b2) ja aplica ao treinador;
  -- aqui ela e antecipada so para o erro sair legivel antes de qualquer escrita.
  --
  -- A versao anterior desta checagem exigia que o exercicio estivesse no PLANO,
  -- e estava errada: o smoke local mostrou que ela recusa a sessao inteira
  -- quando o treinador tira um exercicio da prescricao depois que o aluno ja o
  -- executou - e a fila offline (D11) torna esse intervalo de dias, nao de
  -- segundos. Perder o treino que a pessoa fez de verdade e pior do que aceitar
  -- uma serie fora da prescricao, que o treinador ve e apaga. A fronteira de
  -- seguranca que importa (so escrever no proprio aluno) e dada pela resolucao
  -- do plano pelo token, nao por esta lista.
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
      (plan_id, day_label, week_number, performed_at, notes, source, client_ref)
    values
      (v_plan, p_day_label, p_week_number, v_data, p_notes, 'student', p_client_ref)
    returning * into v_log;
    v_novo := true;
  else
    update public.workout_logs
       set day_label = p_day_label, week_number = p_week_number,
           performed_at = v_data, notes = p_notes
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
        'rir', ranked.rir,
        'rest_seconds', ranked.rest_seconds,
        'reached_failure', ranked.reached_failure
      ) order by ranked.exercise_id
    ),
    '[]'::jsonb
  )
  from (
    select chosen.exercise_id, chosen.performed_at,
           chosen.weight_kg, chosen.reps, chosen.rir, chosen.rest_seconds, chosen.reached_failure
      from (
        select s.exercise_id, l.performed_at, s.weight_kg, s.reps, s.rir, s.rest_seconds, s.reached_failure,
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

create or replace function public.get_workout_history_for_link(
  p_token  text,
  p_limit  int default 30,
  p_before date default null
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_subject uuid;
  v_limit   int := least(greatest(coalesce(p_limit, 30), 1), 60);
begin
  select subject_id into v_subject
    from public.workout_links
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and status = 'active'
     and expires_at > now();
  if v_subject is null then
    return null;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'plan_id', s.plan_id, 'performed_at', s.performed_at, 'day_label', s.day_label,
             'week_number', s.week_number, 'plan_name', s.plan_name,
             'source', s.source, 'notes', s.notes, 'updated_at', s.updated_at,
             'sets', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'exercise_id', st.exercise_id, 'exercise_name', x.name,
                        'set_number', st.set_number, 'weight_kg', st.weight_kg,
                        'reps', st.reps, 'rir', st.rir,
                        'rest_seconds', st.rest_seconds, 'reached_failure', st.reached_failure)
                      order by x.name, st.set_number)
                 from public.workout_log_sets st
                 join public.exercises x on x.id = st.exercise_id
                where st.log_id = s.id), '[]'::jsonb))
           order by s.performed_at desc, s.created_at desc)
      from (
        select l.id, l.plan_id, l.performed_at, l.day_label, l.week_number, l.notes,
               l.source, l.created_at, l.updated_at, p.name as plan_name
          from public.workout_logs l
          join public.workout_plans p on p.id = l.plan_id
         where l.subject_id = v_subject
           and (p_before is null or l.performed_at < p_before)
         order by l.performed_at desc, l.created_at desc
         limit v_limit
      ) s
  ), '[]'::jsonb);
end;
$$;

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
           l.source, l.created_at, l.updated_at, p.name as plan_name
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

-- CREATE OR REPLACE preserva os grants existentes; estes dois helpers devem
-- continuar fechados para qualquer chamada direta do cliente.
revoke execute on function public.submit_workout_session_0027_internal(
  text, uuid, jsonb, text, int, date, text, uuid
) from public, anon, authenticated;
revoke execute on function app.workout_last_sets(uuid) from public, anon, authenticated;

create or replace function public.app_schema_version()
returns text
language sql immutable set search_path = ''
as $$ select '0033'::text $$;

commit;
