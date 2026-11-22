-- 0061 — aba "Minha evolução" no link do aluno (/t).
-- Aplicar depois da 0060. Não altera tabela, coluna, RLS nem dado:
-- estende o payload de `get_workout_for_link(text)` (mesma assinatura e mesmos
-- grants) com o objeto `evolution` (frequência, recordes pessoais de carga e
-- resumo das últimas avaliações de composição corporal — sem notas clínicas
-- nem medicamentos) e sobe o carimbo.
begin;

create or replace function public.get_workout_for_link(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_link public.workout_links;
  v_plan uuid;
  v_current_sessions int := 0;
  v_week_log jsonb := '[]'::jsonb;
  v_evolution jsonb;
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
             'client_ref', case when x.source = 'student' then x.client_ref end)
           order by x.performed_at desc, x.created_at desc, x.id desc), '[]'::jsonb)
      into v_week_log
      from (select l.performed_at, l.week_number, l.client_ref, l.source, l.created_at, l.id
              from public.workout_logs l
             where l.plan_id = v_plan and not l.in_progress
             order by l.performed_at desc, l.created_at desc, l.id desc
             limit 40) x;
  end if;

  -- 0061: resumo de evolução do próprio aluno (frequência, PRs e composição).
  -- Apenas números resumidos — nunca notas clínicas, medicamentos ou anamnese.
  v_evolution := jsonb_build_object(
    'sessions_30d', (
      select count(*)::int
        from public.workout_logs l
       where l.subject_id = v_link.subject_id
         and not l.in_progress
         and l.performed_at >= (current_date - interval '30 days')::date
    ),
    'sessions_total', (
      select count(*)::int
        from public.workout_logs l
       where l.subject_id = v_link.subject_id
         and not l.in_progress
    ),
    'prs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'exercise_id', p.exercise_id,
               'exercise_name', p.exercise_name,
               'best_weight_kg', p.weight_kg,
               'reps', p.reps,
               'performed_at', p.performed_at)
             order by p.performed_at desc, p.weight_kg desc, p.exercise_name asc)
        from (
          select distinct on (s.exercise_id)
                 s.exercise_id,
                 e.name as exercise_name,
                 s.weight_kg,
                 s.reps,
                 l.performed_at
            from public.workout_log_sets s
            join public.workout_logs l on l.id = s.log_id
            join public.exercises e on e.id = s.exercise_id
           where l.subject_id = v_link.subject_id
             and not l.in_progress
             and s.weight_kg is not null
             and s.weight_kg > 0
           order by s.exercise_id, s.weight_kg desc, coalesce(s.reps, 0) desc, l.performed_at desc, s.id desc
        ) p
       limit 12
    ), '[]'::jsonb),
    'assessments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'assessed_at', a.assessed_at,
               'weight_kg', a.weight_kg,
               'body_fat_pct', case
                 when jsonb_typeof(a.results -> 'bodyFatPct') = 'number'
                 then (a.results ->> 'bodyFatPct')::numeric
                 else null
               end,
               'lean_mass_kg', case
                 when jsonb_typeof(a.results -> 'leanMassKg') = 'number'
                 then (a.results ->> 'leanMassKg')::numeric
                 else null
               end)
             order by a.assessed_at asc, a.created_at asc, a.id asc)
        from (
          select assessed_at, weight_kg, results, created_at, id
            from public.assessments
           where subject_id = v_link.subject_id
           order by assessed_at desc, created_at desc, id desc
           limit 8
        ) a
    ), '[]'::jsonb)
  );

  v_out := jsonb_build_object(
    'org_name', (select o.name from public.organizations o where o.id = v_link.org_id),
    'subject_first_name', (select split_part(s.full_name, ' ', 1)
                             from public.subjects s where s.id = v_link.subject_id),
    'link_expires_at', v_link.expires_at,
    'current_plan_sessions', v_current_sessions,
    'plan_week_log', v_week_log,
    'last_sets', app.workout_last_sets(v_link.subject_id),
    'evolution', v_evolution,
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
    ), '[]'::jsonb),
    'catalog', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'name', x.name, 'primary_muscle', x.primary_muscle,
               'aliases', x.aliases)
             order by x.name, x.id)
        from public.exercises x
       where x.org_id is null or x.org_id = v_link.org_id
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

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0061'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
