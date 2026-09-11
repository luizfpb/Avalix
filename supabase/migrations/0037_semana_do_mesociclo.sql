-- 0037 — semana do mesociclo derivada do histórico, não do calendário.
-- Aplicar depois da 0036. Não cria tabela, não altera RLS, policies nem
-- grants; só amplia o que duas leituras já existentes devolvem.
--
-- O app derivava a semana corrente da data de início (ou, na falta dela, da
-- criação) do plano e gravava esse número em workout_logs.week_number — o
-- mesmo que escolhe o override aplicado na tela, e que segue para o histórico
-- e para o PDF. Quem recebeu o plano e só começou semanas depois, quem faltou
-- uma semana inteira ou quem repetiu a semana de propósito registrava sempre
-- a semana errada.
--
-- A regra nova mora no cliente (`suggestedPlanWeek`, em features/workout/
-- progress.ts): continue na semana do último treino e só avance quando ela
-- fechar. Aqui vão os dois dados que faltavam para ela rodar:
--
--   1. workout_log_summary.first_date — primeira sessão do plano, para a
--      Carteira medir adesão a partir do início REAL.
--   2. get_workout_for_link.plan_week_log — as últimas sessões do plano ativo
--      (data + semana), para a página do aluno chegar exatamente à mesma
--      semana que a tela do profissional. Sem isto o aluno teria de baixar o
--      histórico inteiro só para saber em que semana está.
begin;

-- Coluna acrescentada no fim: create or replace preserva a view, os grants e
-- o security_invoker que a 0016 definiu.
create or replace view public.workout_log_summary
with (security_invoker = true) as
  select
    plan_id,
    org_id,
    count(*)::int as log_count,
    max(performed_at) as last_date,
    min(performed_at) as first_date
  from public.workout_logs
  group by plan_id, org_id;

create or replace function public.get_workout_for_link(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_link public.workout_links;
  v_plan uuid;
  v_current_sessions int := 0;
  -- Últimas sessões do plano ativo, da mais recente para a mais antiga. O
  -- cliente só precisa da sequência recente: a semana sugerida depende da
  -- semana do último treino e de quantas sessões seguidas estão nela.
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
      from public.workout_logs l where l.plan_id = v_plan;

    select coalesce(jsonb_agg(jsonb_build_object(
             'performed_at', x.performed_at,
             'week_number', x.week_number)
           order by x.performed_at desc, x.created_at desc, x.id desc), '[]'::jsonb)
      into v_week_log
      from (select l.performed_at, l.week_number, l.created_at, l.id
              from public.workout_logs l
             where l.plan_id = v_plan
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

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0037'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
