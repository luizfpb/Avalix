-- Avalix - migration 0027: treino executado pelo aluno via link
-- Depende de 0001-0026. Spec: docs/treino_link_aluno_spec.md.
--
-- Ideia: o treinador emite um link com token secreto (256 bits) para um ALUNO
-- (nao para um plano). O aluno abre sem login, ve o treino vigente, marca as
-- series que fez e envia. O registro entra no mesmo workout_logs que a tela de
-- execucao do treinador ja alimenta, marcado com source='student'.
--
-- ATENCAO - ESTA MIGRATION ALTERA DADO EXISTENTE. O indice de plano vigente
-- exige no maximo um plano 'active' por avaliado; a normalizacao abaixo arquiva
-- os excedentes, mantendo o mais recente. Conferir ANTES de aplicar:
--
--   select subject_id, count(*) from public.workout_plans
--    where status = 'active' group by subject_id having count(*) > 1;
--
-- Esperado em producao: zero linhas. Arquivar nao apaga nada - o plano continua
-- legivel, so deixa de ser o vigente.
--
-- Porta pro anonimo: NENHUMA policy aberta pra anon (mesmo desenho da 0017). O
-- anon so alcanca o banco por RPCs security definer que validam o token por
-- dentro. O hash e feito em SQL com sha256() nativo, mesmo hex do sha256Hex()
-- do front. create_workout_log (0019) continua sem grant pra anon: o caminho do
-- aluno e outro, com validacao propria.

begin;

-- =====================================================================
-- 1. TREINO VIGENTE: no maximo um plano 'active' por avaliado
-- =====================================================================

-- 1a. normalizacao deterministica: sobrevive o de inicio mais recente; empate
-- por created_at e id. Mexe so em status, entao o check_evaluator sai cedo
-- (evaluator_id inalterado) e nao exige auth.uid() - importante porque esta
-- migration roda no dashboard, sem sessao.
with ranked as (
  select id, row_number() over (
           partition by subject_id
           order by coalesce(starts_on, created_at::date) desc, created_at desc, id desc
         ) as rn
    from public.workout_plans
   where status = 'active'
)
update public.workout_plans p
   set status = 'archived'
  from ranked r
 where r.id = p.id and r.rn > 1;

-- 1b. quem arquiva o anterior e o trigger, nao a aplicacao: o plano e CRIADO
-- por insert direto do cliente (createWorkoutPlan) e EDITADO pela RPC
-- save_workout_plan. Regra posta so na RPC deixaria de fora o caminho da
-- criacao, que e o mais usado (publicar mesociclo novo).
--
-- A recursao termina em um nivel: o update interno grava 'archived', e para
-- essas linhas o corpo nao faz nada.
create or replace function app.single_active_plan()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'active' then
    update public.workout_plans
       set status = 'archived'
     where subject_id = new.subject_id
       and status = 'active'
       and id <> new.id;
  end if;
  return new;
end;
$$;

create trigger workout_plans_single_active
  before insert or update of status on public.workout_plans
  for each row execute function app.single_active_plan();

-- rede final: duas transacoes concorrentes ativando planos diferentes para o
-- mesmo aluno passariam pelo trigger; aqui uma delas falha, que e o correto.
create unique index workout_plans_one_active_idx
  on public.workout_plans (subject_id) where status = 'active';

-- =====================================================================
-- 2. TABELA workout_links
-- O link e do ALUNO: o token aponta para o avaliado e resolve o plano vigente
-- no momento do acesso. Mesmo arcabouco das filhas (org_id por trigger,
-- colunas congeladas, updated_at, auditoria).
-- =====================================================================
create table public.workout_links (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  subject_id      uuid not null references public.subjects(id) on delete cascade,
  created_by      uuid not null default auth.uid() references public.profiles(id),
  token_hash      text not null unique,   -- sha256(token) hex; token cru nunca e gravado
  status          text not null default 'active'
                  check (status in ('active','revoked','expired')),
  expires_at      timestamptz not null,

  -- uso: diagnostico para o treinador e janela de rate limit. Sem PII.
  last_seen_at    timestamptz,
  sessions_count  int not null default 0,
  writes_count    int not null default 0,
  write_window_at timestamptz,
  last_write_at   timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- o desenho de seguranca do token mora no banco, nao no front (0019 #8)
  constraint workout_links_ttl_chk check (expires_at <= created_at + interval '180 days')
);

create unique index workout_links_one_active_idx
  on public.workout_links (subject_id) where status = 'active';
create index workout_links_org_idx on public.workout_links (org_id);

create trigger workout_links_b1_org
  before insert on public.workout_links
  for each row execute function app.org_from_subject();

create trigger workout_links_freeze
  before update on public.workout_links
  for each row execute function app.freeze_columns('org_id', 'subject_id', 'token_hash', 'created_by');

create trigger workout_links_updated_at
  before update on public.workout_links
  for each row execute function app.set_updated_at();

create trigger workout_links_audit
  after insert or update or delete on public.workout_links
  for each row execute function app.audit();

-- RLS: so authenticated, derivada do subject (can_view_subject_id ja embute o
-- gate de MFA desde a 0003). O anon nunca toca a tabela.
alter table public.workout_links enable row level security;

create policy workout_links_select on public.workout_links
  for select to authenticated
  using (app.can_view_subject_id(subject_id));

create policy workout_links_insert on public.workout_links
  for insert to authenticated
  with check (
    app.can_view_subject_id(subject_id)
    and created_by = (select auth.uid())
  );

create policy workout_links_update on public.workout_links
  for update to authenticated
  using (app.can_view_subject_id(subject_id))
  with check (app.can_view_subject_id(subject_id));

create policy workout_links_delete on public.workout_links
  for delete to authenticated
  using (app.can_view_subject_id(subject_id));

-- =====================================================================
-- 3. ORIGEM E IDEMPOTENCIA EM workout_logs
-- source: audit_logs.user_id fica NULO no acesso anonimo; sem esta coluna
-- ninguem sabe quem digitou. default 'trainer' mantem todo log existente e
-- todo log da tela do treinador corretos, sem tocar em create_workout_log.
-- client_ref: a mesma sessao regravada ATUALIZA em vez de duplicar - e o que
-- torna a fila offline segura (reenviar e inofensivo).
-- =====================================================================
alter table public.workout_logs
  add column source text not null default 'trainer'
    check (source in ('trainer','student')),
  add column client_ref uuid;

create unique index workout_logs_client_ref_idx
  on public.workout_logs (plan_id, client_ref) where client_ref is not null;

drop trigger workout_logs_freeze on public.workout_logs;
create trigger workout_logs_freeze
  before update on public.workout_logs
  for each row execute function app.freeze_columns(
    'org_id', 'subject_id', 'plan_id', 'source', 'client_ref'
  );

-- =====================================================================
-- 4. RPCs DO TREINADOR
-- security invoker: a RLS do treinador vale por dentro, sem bypass (0016).
-- =====================================================================

-- Emitir link: revoga o ativo do aluno e insere o novo, na mesma transacao.
-- O token cru e gerado no CLIENTE (256 bits) e so o hash trafega.
create or replace function public.issue_workout_link(
  p_subject    uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns public.workout_links
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_row public.workout_links;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token_hash invalido';
  end if;

  -- select sob RLS: aluno invisivel = inexistente pro chamador
  perform 1 from public.subjects where id = p_subject;
  if not found then
    raise exception 'avaliado inexistente ou sem acesso';
  end if;

  update public.workout_links
     set status = 'revoked'
   where subject_id = p_subject and status = 'active';

  insert into public.workout_links (subject_id, token_hash, expires_at)
  values (p_subject, p_token_hash, p_expires_at)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.issue_workout_link(uuid, text, timestamptz) from anon, public;
grant execute on function public.issue_workout_link(uuid, text, timestamptz) to authenticated;

create or replace function public.revoke_workout_link(p_link uuid)
returns void
language plpgsql volatile security invoker set search_path = ''
as $$
begin
  update public.workout_links set status = 'revoked'
   where id = p_link and status = 'active';
  if not found then
    raise exception 'link inexistente, sem acesso ou ja revogado';
  end if;
end;
$$;

revoke execute on function public.revoke_workout_link(uuid) from anon, public;
grant execute on function public.revoke_workout_link(uuid) to authenticated;

-- =====================================================================
-- 5. LEITURA PELO ALUNO (anon)
-- =====================================================================

-- Monta o pacote de um plano. Helper interno em app.*: NAO recebe grant pra
-- anon; so as RPCs public.* abaixo o chamam, depois de validar o token.
create or replace function app.workout_plan_payload(p_plan uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'plan', (
      select jsonb_build_object(
               'id', p.id, 'name', p.name, 'goal', p.goal, 'weeks', p.weeks,
               'starts_on', p.starts_on, 'notes', p.notes, 'status', p.status,
               'weekly_schedule', to_jsonb(p.weekly_schedule))
        from public.workout_plans p where p.id = p_plan
    ),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'label', d.label, 'name', d.name, 'position', d.position)
             order by d.position)
        from public.workout_days d where d.plan_id = p_plan
    ), '[]'::jsonb),
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'day_id', e.day_id, 'exercise_id', e.exercise_id,
               'name', x.name, 'position', e.position, 'sets', e.sets,
               'reps', e.reps, 'rir', e.rir, 'rest_seconds', e.rest_seconds,
               'tempo', e.tempo, 'notes', e.notes)
             order by e.position)
        from public.workout_exercises e
        join public.workout_days d on d.id = e.day_id
        join public.exercises x    on x.id = e.exercise_id
       where d.plan_id = p_plan
    ), '[]'::jsonb),
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'week_number', w.week_number, 'label', w.label,
               'is_deload', w.is_deload, 'notes', w.notes)
             order by w.week_number)
        from public.workout_weeks w where w.plan_id = p_plan
    ), '[]'::jsonb),
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
               'week_number', o.week_number,
               'workout_exercise_id', o.workout_exercise_id,
               'sets', o.sets, 'reps', o.reps, 'rir', o.rir,
               'rest_seconds', o.rest_seconds, 'is_skipped', o.is_skipped,
               'notes', o.notes)
             order by o.week_number)
        from public.workout_week_overrides o where o.plan_id = p_plan
    ), '[]'::jsonb)
  );
$$;

-- Ultima serie registrada de CADA exercicio, em todo o historico do aluno (nao
-- so no plano vigente). A 0009 referenciou exercise_id do catalogo justamente
-- para a progressao sobreviver a troca de mesociclo; olhar so o plano corrente
-- jogaria isso fora e deixaria sem referencia de carga a semana 1 de todo plano
-- novo - a semana em que ela mais importa.
create or replace function app.workout_last_sets(p_subject uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'exercise_id', t.exercise_id, 'performed_at', t.performed_at,
           'weight_kg', t.weight_kg, 'reps', t.reps, 'rir', t.rir)), '[]'::jsonb)
    from (
      select distinct on (s.exercise_id)
             s.exercise_id, l.performed_at, s.weight_kg, s.reps, s.rir
        from public.workout_log_sets s
        join public.workout_logs l on l.id = s.log_id
       where l.subject_id = p_subject
       order by s.exercise_id, l.performed_at desc, s.weight_kg desc nulls last,
                s.reps desc nulls last
    ) t;
$$;

-- Le o treino vigente pelo token. jsonb (e nao tabela como get_anamnese_intake)
-- porque a resposta e uma arvore e o cliente anonimo nao faz join: uma ida de
-- rede, uma resposta. Token invalido/expirado/revogado => null, sem distinguir
-- os casos (nao confirmar existencia de token).
--
-- volatile de proposito: atualiza last_seen_at quando o ultimo acesso foi ha
-- mais de uma hora, para o treinador saber que o aluno abriu o treino.
create or replace function public.get_workout_for_link(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_link public.workout_links;
  v_plan uuid;
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

  v_out := jsonb_build_object(
    'org_name', (select o.name from public.organizations o where o.id = v_link.org_id),
    'subject_first_name', (select split_part(s.full_name, ' ', 1)
                             from public.subjects s where s.id = v_link.subject_id),
    'last_sets', app.workout_last_sets(v_link.subject_id),
    'history_plans', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name, 'goal', p.goal, 'weeks', p.weeks,
               'starts_on', p.starts_on, 'status', p.status,
               'sessions', (select count(*) from public.workout_logs l where l.plan_id = p.id))
             order by coalesce(p.starts_on, p.created_at::date) desc)
        from (select * from public.workout_plans
               where subject_id = v_link.subject_id
                 and (v_plan is null or id <> v_plan)
                 and status <> 'draft'
               order by coalesce(starts_on, created_at::date) desc
               limit 24) p
    ), '[]'::jsonb)
  );

  if v_plan is null then
    -- sem treino vigente: a pagina mostra o aviso e o historico continua legivel
    return v_out || jsonb_build_object(
      'plan', null, 'days', '[]'::jsonb, 'exercises', '[]'::jsonb,
      'weeks', '[]'::jsonb, 'overrides', '[]'::jsonb);
  end if;
  return v_out || app.workout_plan_payload(v_plan);
end;
$$;

revoke execute on function public.get_workout_for_link(text) from public;
grant execute on function public.get_workout_for_link(text) to anon, authenticated;

-- Le UM plano anterior. A conferencia subject_id = subject do link e o que
-- impede quem tem token valido de ler o plano de qualquer avaliado pelo id.
create or replace function public.get_workout_plan_for_link(p_token text, p_plan uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_subject uuid;
begin
  select subject_id into v_subject
    from public.workout_links
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and status = 'active'
     and expires_at > now();
  if v_subject is null then
    return null;
  end if;

  perform 1 from public.workout_plans
   where id = p_plan and subject_id = v_subject;
  if not found then
    return null;  -- plano de outro avaliado responde igual a inexistente
  end if;

  return app.workout_plan_payload(p_plan);
end;
$$;

revoke execute on function public.get_workout_plan_for_link(text, uuid) from public;
grant execute on function public.get_workout_plan_for_link(text, uuid) to anon, authenticated;

-- Historico de execucao do proprio aluno, de TODOS os planos, mais recentes
-- primeiro. Nome do plano e do exercicio ja resolvidos (o cliente anonimo nao
-- faz join). p_before pagina.
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
             'id', s.id, 'performed_at', s.performed_at, 'day_label', s.day_label,
             'week_number', s.week_number, 'plan_name', s.plan_name,
             'source', s.source, 'notes', s.notes,
             'sets', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'exercise_id', st.exercise_id, 'exercise_name', x.name,
                        'set_number', st.set_number, 'weight_kg', st.weight_kg,
                        'reps', st.reps, 'rir', st.rir)
                      order by x.name, st.set_number)
                 from public.workout_log_sets st
                 join public.exercises x on x.id = st.exercise_id
                where st.log_id = s.id), '[]'::jsonb))
           order by s.performed_at desc, s.created_at desc)
      from (
        select l.id, l.performed_at, l.day_label, l.week_number, l.notes,
               l.source, l.created_at, p.name as plan_name
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

revoke execute on function public.get_workout_history_for_link(text, int, date) from public;
grant execute on function public.get_workout_history_for_link(text, int, date) to anon, authenticated;

-- =====================================================================
-- 6. ESCRITA PELO ALUNO (anon)
-- A unica RPC anonima que ESCREVE. Tudo numa transacao: sessao sem serie ou
-- serie orfa e o defeito que a 0019 corrigiu no create_workout_log.
-- =====================================================================
create or replace function public.submit_workout_session(
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
    (org_id, log_id, exercise_id, set_number, weight_kg, reps, rir)
  select v_log.org_id, v_log.id,
         (s->>'exercise_id')::uuid, (s->>'set_number')::int,
         (s->>'weight_kg')::numeric, (s->>'reps')::int, (s->>'rir')::numeric
    from jsonb_array_elements(p_sets) s;

  update public.workout_links
     set writes_count    = v_writes + 1,
         last_write_at   = now(),
         sessions_count  = sessions_count + (case when v_novo then 1 else 0 end)
   where id = v_link.id;

  return jsonb_build_object('ok', true, 'log_id', v_log.id, 'plan_id', v_plan);
end;
$$;

revoke execute on function public.submit_workout_session(
  text, uuid, jsonb, text, int, date, text, uuid
) from public;
grant execute on function public.submit_workout_session(
  text, uuid, jsonb, text, int, date, text, uuid
) to anon, authenticated;

-- =====================================================================
-- 7. RETENCAO
-- Agendar com service_role, ao menos diariamente, junto dos purges da 0020.
-- =====================================================================
create or replace function public.purge_expired_workout_links(p_limit int default 500)
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
    select l.id from public.workout_links l
     where l.status = 'active' and l.expires_at <= now()
     order by l.expires_at
     limit p_limit for update skip locked
  )
  update public.workout_links l
     set status = 'expired'
    from expired e
   where e.id = l.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.purge_expired_workout_links(int) from public, anon, authenticated;
grant execute on function public.purge_expired_workout_links(int) to service_role;

-- =====================================================================
-- 8. CARIMBO DE VERSAO
-- Convencao do projeto: toda migration reescreve o carimbo, e o gate de deploy
-- (scripts/check-schema-version.mjs) compara com EXPECTED_SCHEMA_VERSION. Os
-- dois sobem juntos, entao publicar o frontend antes de aplicar esta migration
-- falha de proposito.
-- =====================================================================
create or replace function public.app_schema_version()
returns text
language sql immutable set search_path = ''
as $$ select '0027'::text $$;

revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;

commit;
