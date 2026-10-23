-- 0053 — criar avaliação física e treino sem duplicar na resposta perdida.
-- Aplicar depois da 0052. Não apaga nem reescreve dado existente.
--
-- Resposta perdida depois do commit (Wi-Fi de academia, 4G no subsolo): a
-- tela recebia "Falha de conexão… tente de novo" e o segundo "Salvar" criava
-- OUTRA avaliação física, ou outro plano de treino, que ainda arquivava o
-- primeiro pelo gatilho da 0027. A 0043 já tinha resolvido isso para a sessão
-- de treino do profissional; criar avaliação e plano tinham ficado de fora.
--
-- p_id é a identidade da AÇÃO, gerada pela tela uma vez por formulário, e não
-- de cada tentativa. A nova tentativa com o mesmo p_id devolve a linha já
-- gravada, sem regravar leituras nem divisões. Sem o parâmetro tudo segue
-- como antes: o frontend publicado continua funcionando com esta migration.
-- As duas continuam security invoker (RLS, MFA e só leitura valem igual).
--
-- drop + create, e não create or replace: com um argumento a mais, o replace
-- criaria uma SOBRECARGA e o PostgREST ficaria ambíguo (mesmo motivo da 0038
-- e da 0043).
begin;

drop function public.create_assessment(uuid, date, text, numeric, numeric, jsonb, text, jsonb, jsonb, text, text);

create function public.create_assessment(
  p_subject uuid,
  p_assessed_at date,
  p_protocol_id text,
  p_weight_kg numeric,
  p_height_cm numeric,
  p_results jsonb,
  p_engine_version text,
  p_skinfolds jsonb,
  p_circumferences jsonb,
  p_medications text default null,
  p_notes text default null,
  p_id uuid default null
)
returns public.assessments
language plpgsql
set search_path = ''
as $$
declare
  v_row public.assessments;
begin
  -- Nova tentativa da mesma ação: a primeira já gravou. Conferido antes do
  -- insert para nenhum gatilho rodar de novo. A RLS só mostra avaliação que o
  -- usuário enxerga; outro avaliado com o mesmo id é recusa.
  if p_id is not null then
    select * into v_row from public.assessments a where a.id = p_id;
    if v_row.id is not null then
      if v_row.subject_id is distinct from p_subject then
        raise exception 'avaliacao indisponivel';
      end if;
      return v_row;
    end if;
  end if;

  insert into public.assessments
    (id, subject_id, assessed_at, protocol_id, weight_kg, height_cm,
     medications, notes, results, engine_version)
  values
    (coalesce(p_id, pg_catalog.gen_random_uuid()), p_subject, p_assessed_at, p_protocol_id,
     p_weight_kg, p_height_cm, p_medications, p_notes, p_results, p_engine_version)
  on conflict (id) do nothing
  returning * into v_row;

  if v_row.id is null then
    -- duas tentativas ao mesmo tempo: a outra gravou primeiro
    select * into v_row from public.assessments a where a.id = p_id;
    if v_row.id is null or v_row.subject_id is distinct from p_subject then
      raise exception 'avaliacao indisponivel';
    end if;
    return v_row;
  end if;

  perform public.replace_assessment_readings(v_row.id, p_skinfolds, p_circumferences);
  return v_row;
end;
$$;

revoke execute on function public.create_assessment(uuid, date, text, numeric, numeric, jsonb, text, jsonb, jsonb, text, text, uuid) from public, anon;
grant execute on function public.create_assessment(uuid, date, text, numeric, numeric, jsonb, text, jsonb, jsonb, text, text, uuid) to authenticated;

drop function public.create_workout_plan(uuid, uuid, text, integer, text, jsonb, jsonb, text, jsonb, jsonb, jsonb, text, date, text, uuid, uuid);

create function public.create_workout_plan(
  p_org uuid,
  p_subject uuid,
  p_name text,
  p_weeks integer,
  p_status text,
  p_weekly_schedule jsonb,
  p_volume jsonb,
  p_volume_engine_version text,
  p_days jsonb,
  p_overrides jsonb,
  p_weeks_meta jsonb,
  p_goal text default null,
  p_starts_on date default null,
  p_notes text default null,
  p_source_assessment_id uuid default null,
  p_source_posture_session_id uuid default null,
  p_id uuid default null
)
returns public.workout_plans
language plpgsql
set search_path = ''
as $$
declare
  v_row public.workout_plans;
begin
  -- Nova tentativa da mesma ação: devolve o plano já criado, sem passar de
  -- novo pelos gatilhos (o que arquiva o plano ativo é BEFORE INSERT) e sem
  -- regravar as divisões, que o profissional pode já ter editado.
  if p_id is not null then
    select * into v_row from public.workout_plans p where p.id = p_id;
    if v_row.id is not null then
      if v_row.subject_id is distinct from p_subject then
        raise exception 'plano indisponivel';
      end if;
      return v_row;
    end if;
  end if;

  insert into public.workout_plans
    (id, org_id, subject_id, name, goal, weeks, starts_on, notes, status,
     source_assessment_id, source_posture_session_id, weekly_schedule,
     volume, volume_engine_version)
  values
    (coalesce(p_id, pg_catalog.gen_random_uuid()), p_org, p_subject, p_name, p_goal, p_weeks,
     p_starts_on, p_notes, p_status, p_source_assessment_id, p_source_posture_session_id,
     -- weekly_schedule e text[] NOT NULL; array(select ...) devolve array vazio
     -- (nunca null) quando a lista vem vazia. Mesma conversao da 0023.
     array(select jsonb_array_elements_text(coalesce(p_weekly_schedule, '[]'::jsonb))),
     p_volume, p_volume_engine_version)
  on conflict (id) do nothing
  returning * into v_row;

  if v_row.id is null then
    -- duas tentativas ao mesmo tempo: a outra gravou primeiro
    select * into v_row from public.workout_plans p where p.id = p_id;
    if v_row.id is null or v_row.subject_id is distinct from p_subject then
      raise exception 'plano indisponivel';
    end if;
    return v_row;
  end if;

  -- Mesma transacao: se a estrutura filha for recusada (agrupamento invalido,
  -- exercicio fora do catalogo da org), o cabecalho nao existe e o plano
  -- anterior NAO chega a ser arquivado pelo trigger da 0027.
  perform public.replace_workout_plan_children(v_row.id, p_days, p_overrides, p_weeks_meta);
  return v_row;
end;
$$;

revoke execute on function public.create_workout_plan(uuid, uuid, text, integer, text, jsonb, jsonb, text, jsonb, jsonb, jsonb, text, date, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.create_workout_plan(uuid, uuid, text, integer, text, jsonb, jsonb, text, jsonb, jsonb, jsonb, text, date, text, uuid, uuid, uuid) to authenticated;

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0053'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;

commit;
