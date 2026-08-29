-- Avalix - migration 0030: agrupamentos (super-serie/circuito), tecnicas de
-- intensidade e reps opcional no plano de treino.
-- Depende de 0001-0029. Aplicar ANTES de publicar o frontend correspondente
-- (o deploy roda check:remote-schema e falha de proposito na ordem errada).
--
-- POR QUE (1) REPS OPCIONAL
-- `workout_exercises.reps` nasceu NOT NULL em 0006 supondo que toda prescricao
-- tem faixa definida. Nao tem: aquecimento, mobilidade, alongamento, prancha,
-- trabalho ate a falha tecnica e exercicio "no que sair hoje" sao prescricao
-- legitima sem numero de repeticao. O builder nao validava o campo, entao o
-- educador que deixava em branco so descobria no Salvar, com a mensagem crua do
-- Postgres. Campo que o dominio permite deixar vazio nao pode ser NOT NULL, e
-- erro de banco nao e mensagem de formulario. RIR ja era nulavel desde 0006 - o
-- que faltava era a UI parar de tratar o vazio como acidente.
--
-- O CHECK de tamanho continua valendo: char_length(null) e null, e um CHECK que
-- avalia null passa. Ou seja, `reps` agora e "ausente ou 1..20 caracteres".
--
-- POR QUE (2) AGRUPAMENTOS
-- Super-serie, bi-set, tri-set, serie gigante e circuito nao sao decoracao de
-- impressao: mudam o que o aluno faz entre uma serie e outra. Sem modelo, o
-- educador escrevia "fazer junto com o proximo" em `notes`, texto que nenhuma
-- tela entende - o PDF, o WhatsApp e o app do aluno seguiam listando exercicios
-- soltos, e a instrucao dependia de o aluno ler a observacao certa na hora
-- certa. Prescricao que so existe como comentario nao e prescricao.
--
-- MODELO: TRES COLUNAS NA PROPRIA LINHA, NAO TABELA DE GRUPOS
-- Um grupo e sempre um trecho CONTIGUO de exercicios da mesma divisao - e por
-- isso ele e uma propriedade da ordem, que ja mora em `position`. Uma tabela
-- `workout_exercise_groups` traria org_id herdado, RLS, auditoria, congelamento
-- de relacao e uma segunda ordenacao a manter em sincronia com a primeira, tudo
-- para guardar um rotulo por trecho. `group_key` (etiqueta compartilhada pelos
-- membros) + `group_kind` (superset|circuit) resolvem com o que ja existe.
--
-- `group_kind` fica em toda linha do grupo, e nao numa linha "cabeca": linha
-- cabeca cria a pergunta "o que acontece quando ela e removida". A consistencia
-- do trecho e conferida pela RPC de gravacao, com a divisao ja gravada.
--
-- BI-SET, TRI-SET E SERIE GIGANTE NAO SAO TIPOS DIFERENTES
-- Sao o mesmo mecanismo (executar em sequencia, sem descanso entre os
-- exercicios) com 2, 3 ou 4+ exercicios. O nome sai do TAMANHO do grupo, no
-- app, e nao de um valor gravado - assim mover um exercicio para dentro do
-- grupo nao pode deixar um "bi-set" com tres exercicios no banco.
--
-- CIRCUITO NAO GANHA COLUNA DE VOLTAS
-- Numa volta de circuito cada exercicio executa uma serie: o numero de voltas E
-- o `sets` de cada membro. Uma coluna `rounds` a parte seria uma segunda fonte
-- de verdade para a mesma contagem, e o motor de volume (que soma `sets`)
-- passaria a contar em dobro ou a ignorar as voltas, dependendo de qual das
-- duas ele lesse. O app avisa quando os membros do circuito tem `sets`
-- diferentes, que e o unico caso ambiguo de verdade.
--
-- POR QUE (3) TECNICA DE INTENSIDADE
-- Drop-set, rest-pause, cluster e myo-reps acontecem DENTRO de um exercicio -
-- nao agrupam exercicios e por isso nao sao `group_kind`. Sao um enum curto e
-- fechado: a variacao ("3 quedas de 20%") continua em `notes`, que ja existe e
-- ja aparece em todas as superficies.
--
-- NADA DISSO MEXE EM VOLUME
-- Agrupar nao cria nem apaga serie: o motor de volume continua somando `sets`
-- por musculo, e o snapshot gravado nos planos existentes segue valido.

begin;

-- =====================================================================
-- 1. REPS OPCIONAL
-- =====================================================================
alter table public.workout_exercises alter column reps drop not null;

-- =====================================================================
-- 2. AGRUPAMENTO E TECNICA
-- =====================================================================
alter table public.workout_exercises
  add column if not exists group_key  text,
  add column if not exists group_kind text,
  add column if not exists technique  text;

alter table public.workout_exercises
  drop constraint if exists workout_exercises_group_shape;
alter table public.workout_exercises
  add constraint workout_exercises_group_shape check (
    (group_key is null and group_kind is null)
    or (
      group_key is not null
      and char_length(group_key) between 1 and 40
      and group_kind in ('superset', 'circuit')
    )
  );

alter table public.workout_exercises
  drop constraint if exists workout_exercises_technique_check;
alter table public.workout_exercises
  add constraint workout_exercises_technique_check check (
    technique is null
    or technique in ('drop_set', 'rest_pause', 'cluster', 'myo_reps')
  );

create index if not exists workout_exercises_group_idx
  on public.workout_exercises (day_id, group_key)
  where group_key is not null;

-- =====================================================================
-- 3. GRAVACAO: replace_workout_plan_children passa a levar os campos novos
-- Mesma funcao da 0016 (o corpo e reescrito inteiro; a assinatura nao muda,
-- entao o save_workout_plan da 0023 continua chamando esta).
-- =====================================================================
create or replace function public.replace_workout_plan_children(
  p_plan uuid,
  p_days jsonb,
  p_overrides jsonb,
  p_weeks jsonb
)
returns void
language plpgsql security invoker set search_path = ''
as $fn$
declare
  v_org uuid;
  v_day jsonb;
  v_day_id uuid;
  v_ex jsonb;
  v_ex_id uuid;
  v_key_map jsonb := '{}'::jsonb;
  v_ov jsonb;
  v_wk jsonb;
  v_target uuid;
  v_bad_group text;
begin
  select p.org_id into v_org from public.workout_plans p where p.id = p_plan;
  if v_org is null then
    raise exception 'plano inexistente ou sem acesso';
  end if;

  -- apagar os dias leva exercicios e overrides em cascata; semanas sao a parte
  delete from public.workout_days where plan_id = p_plan;
  delete from public.workout_weeks where plan_id = p_plan;

  for v_day in select * from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) loop
    insert into public.workout_days (org_id, plan_id, label, name, position)
    values (v_org, p_plan, v_day->>'label', v_day->>'name', (v_day->>'position')::int)
    returning id into v_day_id;

    for v_ex in select * from jsonb_array_elements(coalesce(v_day->'exercises', '[]'::jsonb)) loop
      insert into public.workout_exercises
        (org_id, day_id, exercise_id, position, sets, reps, rir, rest_seconds,
         tempo, notes, group_key, group_kind, technique)
      values
        (v_org, v_day_id, (v_ex->>'exercise_id')::uuid, (v_ex->>'position')::int,
         (v_ex->>'sets')::int, v_ex->>'reps', (v_ex->>'rir')::int,
         (v_ex->>'rest_seconds')::int, v_ex->>'tempo', v_ex->>'notes',
         v_ex->>'group_key', v_ex->>'group_kind', v_ex->>'technique')
      returning id into v_ex_id;
      v_key_map := v_key_map || jsonb_build_object(v_ex->>'client_key', v_ex_id::text);
    end loop;

    -- Integridade do trecho, conferida com a divisao ja gravada: um grupo
    -- precisa de pelo menos dois exercicios, todos do mesmo tipo e SEGUIDOS.
    -- Grupo furado (A, B, A) nao tem execucao possivel - nao existe "fazer sem
    -- descanso" com outro exercicio no meio. So aqui a ordem final existe:
    -- durante o loop de insert toda posicao intermediaria e transitoria.
    --
    -- Inline, e nao numa funcao app.*: esta RPC e security invoker, e o papel
    -- `authenticated` nao tem USAGE no schema `app` (dai as funcoes de la serem
    -- chamadas so por triggers e por RPCs security definer). Uma funcao
    -- auxiliar aqui daria "permission denied" em toda gravacao de plano.
    select g.group_key into v_bad_group
      from (
        select e.group_key,
               count(*)                     as membros,
               min(e.position)              as p_min,
               max(e.position)              as p_max,
               count(distinct e.group_kind) as tipos
          from public.workout_exercises e
         where e.day_id = v_day_id
           and e.group_key is not null
         group by e.group_key
      ) g
     where g.membros < 2
        or g.tipos <> 1
        or g.p_max - g.p_min + 1 <> g.membros
     limit 1;

    if v_bad_group is not null then
      raise exception
        'agrupamento invalido: super-serie e circuito exigem ao menos dois exercicios seguidos, do mesmo tipo, na mesma divisao';
    end if;
  end loop;

  for v_ov in select * from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb)) loop
    -- override de chave desconhecida e descartado (mesma defesa do JS antigo)
    v_target := (v_key_map->>(v_ov->>'exercise_key'))::uuid;
    if v_target is null then
      continue;
    end if;
    insert into public.workout_week_overrides
      (org_id, plan_id, workout_exercise_id, week_number, sets, reps, rir,
       rest_seconds, is_skipped, notes)
    values
      (v_org, p_plan, v_target, (v_ov->>'week')::int, (v_ov->>'sets')::int,
       v_ov->>'reps', (v_ov->>'rir')::int, (v_ov->>'rest_seconds')::int,
       coalesce((v_ov->>'is_skipped')::boolean, false), v_ov->>'notes');
  end loop;

  for v_wk in select * from jsonb_array_elements(coalesce(p_weeks, '[]'::jsonb)) loop
    insert into public.workout_weeks (org_id, plan_id, week_number, label, is_deload, notes)
    values (v_org, p_plan, (v_wk->>'week')::int, v_wk->>'label',
            coalesce((v_wk->>'is_deload')::boolean, false), v_wk->>'notes');
  end loop;
end;
$fn$;

revoke execute on function public.replace_workout_plan_children(uuid, jsonb, jsonb, jsonb) from anon, public;
grant execute on function public.replace_workout_plan_children(uuid, jsonb, jsonb, jsonb) to authenticated;

-- =====================================================================
-- 4. LEITURA DO ALUNO: o pacote do link precisa carregar o agrupamento
-- Sem isto o app do aluno - a superficie que EXECUTA o treino - seria a unica
-- a nao saber que dois exercicios sao uma super-serie. Mesma funcao da 0027,
-- so com os tres campos novos no jsonb dos exercicios.
-- =====================================================================
create or replace function app.workout_plan_payload(p_plan uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
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
               'tempo', e.tempo, 'notes', e.notes,
               'group_key', e.group_key, 'group_kind', e.group_kind,
               'technique', e.technique)
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
$fn$;

revoke execute on function app.workout_plan_payload(uuid) from public, anon, authenticated;

-- =====================================================================
-- 5. CARIMBO DE SCHEMA
-- =====================================================================
create or replace function public.app_schema_version()
returns text
language sql immutable set search_path = ''
as $$ select '0030'::text $$;

revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;

commit;
