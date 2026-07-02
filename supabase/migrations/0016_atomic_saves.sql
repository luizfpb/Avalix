-- Avalix - migration 0016: saves atomicos + views org-wide
-- Depende de 0001-0015. Nao apaga dado; adiciona funcoes e views.
-- ATENCAO: aplicar ANTES de subir o codigo desta versao — o app passa a chamar
-- as RPCs abaixo ao salvar avaliacao e plano de treino (igual ao caso da 0013).
--
-- Motivo (achado da revisao v1.45): editar avaliacao/plano apagava as filhas e
-- regravava em VARIAS chamadas HTTP. Falha no meio (rede, RLS) deixava estado
-- parcial; o caso pior era consentimento revogado entre criar e editar — o
-- delete das leituras passa (a policy de delete nao exige consentimento) e o
-- reinsert falha (insert exige), perdendo as leituras granulares. Numa funcao,
-- tudo roda numa transacao: falhou qualquer passo, reverte inteiro.
--
-- SECURITY INVOKER de proposito: a RLS do chamador continua valendo dentro da
-- funcao (nada de bypass); os triggers b1/b2/freeze tambem disparam normalmente.
-- search_path vazio obriga a qualificar tudo (mesma mitigacao das demais).

begin;

-- =====================================================================
-- replace_assessment_readings: troca dobras + circunferencias numa transacao
-- p_skinfolds:       [{site, reading_1, reading_2, reading_3}]
-- p_circumferences:  [{site, value_cm, is_custom}]
-- org_id das filhas e recopiado do pai pelos triggers b1 (o valor passado
-- no insert e ignorado por eles; a coluna e preenchida antes do NOT NULL).
-- =====================================================================
create or replace function public.replace_assessment_readings(
  p_assessment uuid,
  p_skinfolds jsonb,
  p_circumferences jsonb
)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_org uuid;
  v_r jsonb;
begin
  -- select sob RLS: avaliacao invisivel = inexistente pro chamador
  select a.org_id into v_org from public.assessments a where a.id = p_assessment;
  if v_org is null then
    raise exception 'avaliacao inexistente ou sem acesso';
  end if;

  delete from public.skinfold_readings where assessment_id = p_assessment;
  delete from public.circumference_readings where assessment_id = p_assessment;

  for v_r in select * from jsonb_array_elements(coalesce(p_skinfolds, '[]'::jsonb)) loop
    insert into public.skinfold_readings
      (org_id, assessment_id, site, reading_1, reading_2, reading_3)
    values
      (v_org, p_assessment, v_r->>'site', (v_r->>'reading_1')::numeric,
       (v_r->>'reading_2')::numeric, (v_r->>'reading_3')::numeric);
  end loop;

  for v_r in select * from jsonb_array_elements(coalesce(p_circumferences, '[]'::jsonb)) loop
    insert into public.circumference_readings
      (org_id, assessment_id, site, value_cm, is_custom)
    values
      (v_org, p_assessment, v_r->>'site', (v_r->>'value_cm')::numeric,
       coalesce((v_r->>'is_custom')::boolean, false));
  end loop;
end;
$$;

revoke execute on function public.replace_assessment_readings(uuid, jsonb, jsonb) from anon, public;
grant execute on function public.replace_assessment_readings(uuid, jsonb, jsonb) to authenticated;

-- =====================================================================
-- replace_workout_plan_children: troca dias/exercicios/overrides/semanas
-- numa transacao. Reimplementa o mapa clientKey->id que o app fazia em JS:
-- os overrides referenciam workout_exercise_id, que so existe apos o insert.
-- p_days:      [{label, name, position, exercises: [{client_key, exercise_id,
--                position, sets, reps, rir, rest_seconds, tempo, notes}]}]
-- p_overrides: [{week, exercise_key, sets, reps, rir, rest_seconds,
--                is_skipped, notes}]
-- p_weeks:     [{week, label, is_deload, notes}]
-- =====================================================================
create or replace function public.replace_workout_plan_children(
  p_plan uuid,
  p_days jsonb,
  p_overrides jsonb,
  p_weeks jsonb
)
returns void
language plpgsql security invoker set search_path = ''
as $$
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
        (org_id, day_id, exercise_id, position, sets, reps, rir, rest_seconds, tempo, notes)
      values
        (v_org, v_day_id, (v_ex->>'exercise_id')::uuid, (v_ex->>'position')::int,
         (v_ex->>'sets')::int, v_ex->>'reps', (v_ex->>'rir')::int,
         (v_ex->>'rest_seconds')::int, v_ex->>'tempo', v_ex->>'notes')
      returning id into v_ex_id;
      v_key_map := v_key_map || jsonb_build_object(v_ex->>'client_key', v_ex_id::text);
    end loop;
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
$$;

revoke execute on function public.replace_workout_plan_children(uuid, jsonb, jsonb, jsonb) from anon, public;
grant execute on function public.replace_workout_plan_children(uuid, jsonb, jsonb, jsonb) to authenticated;

-- =====================================================================
-- Views org-wide (dashboard/carteira): o app baixava TODAS as avaliacoes da
-- org pra achar a ultima de cada avaliado, e todos os logs pra somar por
-- plano. As views agregam no banco. security_invoker: a RLS das tabelas de
-- baixo continua valendo pro chamador (view nao vira furo de visibilidade).
-- =====================================================================
create or replace view public.last_assessment_by_subject
with (security_invoker = true) as
  select distinct on (subject_id)
    subject_id,
    org_id,
    assessed_at
  from public.assessments
  order by subject_id, assessed_at desc;

create or replace view public.workout_log_summary
with (security_invoker = true) as
  select
    plan_id,
    org_id,
    count(*)::int as log_count,
    max(performed_at) as last_date
  from public.workout_logs
  group by plan_id, org_id;

commit;
