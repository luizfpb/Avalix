-- =====================================================================
-- 0023 - Integridade e concorrencia.
--
-- Tres problemas, todos do mesmo cenario: educador atendendo aluno real, no
-- celular, com rede instavel, as vezes com a mesma ficha aberta em dois
-- aparelhos.
--
-- #1 SALVAR PLANO DE TREINO NAO ERA ATOMICO
--    O app fazia UPDATE workout_plans (cabecalho: nome, semanas, status,
--    weekly_schedule, snapshot de volume) e SO DEPOIS chamava a RPC
--    replace_workout_plan_children. Duas transacoes: se a rede caisse entre
--    elas, o plano ficava com semanas/sequencia NOVAS e dias/exercicios
--    VELHOS. E exatamente o defeito que a 0019 corrigiu para a avaliacao
--    fisica ("antes o snapshot novo podia ficar com leituras velhas se a 2a
--    chamada falhasse") e que nao foi replicado no treino. save_workout_plan
--    abaixo fecha os dois passos numa transacao so, espelhando
--    save_assessment.
--
-- #2 NENHUMA ESCRITA TINHA CONTROLE DE CONCORRENCIA
--    save_assessment fazia `update ... where id = ?` sem predicado de versao,
--    e replace_assessment_readings DELETA e reinsere as leituras. Cenario
--    real: o educador abre a avaliacao no PC, ajusta duas dobras no celular
--    na sala, salva; volta ao PC (aba de 20 minutos atras) e clica Salvar por
--    qualquer motivo. O trabalho do celular sumia sem aviso nenhum.
--    Agora as duas RPCs aceitam p_expected_updated_at: quando o cliente
--    informa a versao que ele carregou, o banco recusa a escrita se a linha
--    tiver mudado nesse meio tempo.
--    O parametro tem DEFAULT null de proposito - assim um frontend antigo,
--    que ainda nao envia o campo, continua funcionando exatamente como antes
--    durante a janela entre aplicar esta migration e publicar o build novo.
--
-- #3 posture_annotations ACEITAVA DUAS FOLHAS PARA A MESMA FOTO
--    O codigo assume uma folha por foto ("Uma folha de anotacoes por foto:
--    tudo num unico registro") e le com `order created_at asc limit 1`. Sem
--    unique, duas abas que anotam a mesma foto ao mesmo tempo veem rowId=null
--    e ambas INSEREM. A segunda folha fica invisivel para sempre - o trabalho
--    existe no banco e o app nunca mais mostra.
-- =====================================================================

-- ---------------------------------------------------------------------
-- #3 - uma folha de anotacoes por foto
--
-- Se ja existirem duplicatas em producao, elas sao movidas para uma tabela de
-- resguardo ANTES do constraint. Nada e destruido: mantem-se a folha que o
-- app ja mostrava hoje (a mais antiga, que e a que getAnnotation le) e as
-- demais ficam recuperaveis. Migration nao apaga dado do usuario em silencio.
-- ---------------------------------------------------------------------
create table if not exists public.posture_annotations_shadowed (
  id           uuid primary key,
  org_id       uuid not null,
  photo_id     uuid not null,
  payload      jsonb not null,
  created_at   timestamptz not null,
  shadowed_at  timestamptz not null default now()
);

comment on table public.posture_annotations_shadowed is
  'Folhas de anotacao que ficaram invisiveis por duplicidade de photo_id antes do unique da 0023. Somente leitura administrativa; sem RLS de aplicacao porque nao e exposta ao PostgREST.';

revoke all on public.posture_annotations_shadowed from anon, authenticated;

do $dedupe$
declare
  v_movidas int;
begin
  with ranked as (
    select id,
           row_number() over (partition by photo_id order by created_at, id) as rn
      from public.posture_annotations
  ), duplicadas as (
    select a.*
      from public.posture_annotations a
      join ranked r on r.id = a.id
     where r.rn > 1
  ), movidas as (
    insert into public.posture_annotations_shadowed
      (id, org_id, photo_id, payload, created_at)
    select id, org_id, photo_id, payload, created_at from duplicadas
    on conflict (id) do nothing
    returning id
  )
  delete from public.posture_annotations a
   where a.id in (select id from movidas);
  get diagnostics v_movidas = row_count;
  if v_movidas > 0 then
    raise notice
      '0023: % folha(s) de anotacao duplicada(s) movida(s) para posture_annotations_shadowed', v_movidas;
  end if;
end
$dedupe$;

do $uk$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.posture_annotations'::regclass
       and conname = 'posture_annotations_photo_key'
  ) then
    alter table public.posture_annotations
      add constraint posture_annotations_photo_key unique (photo_id);
  end if;
end
$uk$;

-- ---------------------------------------------------------------------
-- #2 - concorrencia otimista na avaliacao fisica
--
-- drop + create (em vez de create or replace com novo argumento) para nao
-- deixar duas sobrecargas e o PostgREST ter de desambiguar. Como o parametro
-- novo tem default, chamadas antigas (sem ele) continuam resolvendo para esta
-- mesma funcao.
-- ---------------------------------------------------------------------
drop function if exists public.save_assessment(
  uuid, date, text, numeric, numeric, jsonb, text, jsonb, jsonb, text, text
);

create or replace function public.save_assessment(
  p_assessment     uuid,
  p_assessed_at    date,
  p_protocol_id    text,
  p_weight_kg      numeric,
  p_height_cm      numeric,
  p_results        jsonb,
  p_engine_version text,
  p_skinfolds      jsonb,
  p_circumferences jsonb,
  p_medications    text default null,
  p_notes          text default null,
  p_expected_updated_at timestamptz default null
)
returns public.assessments
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_row     public.assessments;
  v_atual   timestamptz;
begin
  -- Trava a linha antes de comparar a versao, senao duas sessoes podem passar
  -- pela checagem ao mesmo tempo e a ultima ainda sobrescreve a primeira.
  select updated_at into v_atual
    from public.assessments
   where id = p_assessment
     for update;

  if v_atual is null then
    raise exception 'avaliacao inexistente ou sem acesso';
  end if;

  if p_expected_updated_at is not null and v_atual is distinct from p_expected_updated_at then
    raise exception using
      errcode = '40001',
      message = 'Esta avaliacao foi alterada em outro dispositivo depois que voce abriu esta tela. Recarregue para ver a versao atual antes de salvar.';
  end if;

  update public.assessments
     set assessed_at    = p_assessed_at,
         protocol_id    = p_protocol_id,
         weight_kg      = p_weight_kg,
         height_cm      = p_height_cm,
         medications    = p_medications,
         notes          = p_notes,
         results        = p_results,
         engine_version = p_engine_version
   where id = p_assessment
   returning * into v_row;

  if v_row.id is null then
    raise exception 'avaliacao inexistente ou sem acesso';
  end if;

  perform public.replace_assessment_readings(p_assessment, p_skinfolds, p_circumferences);
  return v_row;
end;
$$;

revoke execute on function public.save_assessment(
  uuid, date, text, numeric, numeric, jsonb, text, jsonb, jsonb, text, text, timestamptz
) from anon, public;
grant execute on function public.save_assessment(
  uuid, date, text, numeric, numeric, jsonb, text, jsonb, jsonb, text, text, timestamptz
) to authenticated;

-- ---------------------------------------------------------------------
-- #1 + #2 - salvar plano de treino numa transacao, com a mesma protecao
-- ---------------------------------------------------------------------
create or replace function public.save_workout_plan(
  p_plan            uuid,
  p_name            text,
  p_goal            text,
  p_weeks           int,
  p_starts_on       date,
  p_notes           text,
  p_status          text,
  p_weekly_schedule jsonb,
  p_volume          jsonb,
  p_volume_engine_version text,
  p_days            jsonb,
  p_overrides       jsonb,
  p_weeks_meta      jsonb,
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
  uuid, text, text, int, date, text, text, jsonb, jsonb, text, jsonb, jsonb, jsonb, uuid, uuid, timestamptz
) from anon, public;
grant execute on function public.save_workout_plan(
  uuid, text, text, int, date, text, text, jsonb, jsonb, text, jsonb, jsonb, jsonb, uuid, uuid, timestamptz
) to authenticated;

-- ---------------------------------------------------------------------
-- Marcador de schema conferido pelo deploy (scripts/check-schema-version.mjs).
-- O deploy do frontend so publica se producao ja estiver nesta versao.
-- ---------------------------------------------------------------------
create or replace function public.app_schema_version()
returns text
language sql immutable set search_path = ''
as $$ select '0023'::text $$;

revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
