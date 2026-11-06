-- 0056 — o aluno adiciona qualquer exercício do catálogo na execução.
-- Aplicar depois da 0055. Não altera tabela, coluna, RLS, policy nem dado:
-- troca o corpo de get_workout_for_link (mesma assinatura e mesmos grants) e
-- sobe o carimbo.
--
-- Até aqui o aluno só conseguia registrar, fora da prescrição do dia, um
-- exercício de OUTRA divisão do próprio plano: era o que o pacote do link
-- trazia. Quem tem plano de uma divisão só não tinha opção nenhuma, e o
-- exercício feito a mais (ou no lugar de um aparelho ocupado) que não estava
-- no plano ficava fora do registro.
--
-- O pacote passa a levar o catálogo que a organização enxerga (o global e os
-- exercícios próprios dela), só com o necessário para escolher: id, nome,
-- músculo principal e apelidos (a busca da tela usa os apelidos, como a do
-- profissional). Vai junto do pacote, e não numa RPC separada, para valer
-- offline como o resto da tela: o pacote já fica guardado no aparelho.
--
-- O envio não muda: submit_workout_session e update_workout_session_for_link
-- já aceitam qualquer exercício do catálogo da org desde a 0027.
begin;

create or replace function public.get_workout_for_link(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_link public.workout_links;
  v_plan uuid;
  v_current_sessions int := 0;
  -- Últimas sessões CONCLUÍDAS do plano ativo, da mais recente para a mais
  -- antiga, com a identidade de cada uma.
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

    -- A referência sai só nas sessões do aluno (0045).
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
    ), '[]'::jsonb),
    -- 0056: o catálogo que a org enxerga, para o aluno registrar exercício
    -- fora da prescrição. Mesmo filtro que o envio usa para aceitar a série.
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
as $$ select '0056'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
