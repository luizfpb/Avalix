-- 0054 — o descanso de cada série da última vez.
-- Aplicar depois da 0053. Não altera tabela, RLS, policy nem dado existente.
--
-- Desde a 0048 cada série da Execução e da página do aluno mostra a série de
-- mesmo número da última sessão, mas só carga, repetições e esforço. O
-- descanso realizado (0032) ficava de fora, e quem treina queria saber quanto
-- tinha descansado da outra vez. Cada item de `sets` ganha `rest_seconds`
-- (NULL = não informado, 0 = sem descanso), e mais nada muda: mesma
-- assinatura, mesma escolha da sessão (0044) e da melhor série. O pacote do
-- aluno (get_workout_for_link) e subject_last_sets chamam esta função e
-- passam a levar o campo sem mudar nada neles.
begin;

create or replace function app.workout_last_sets(p_subject uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'exercise_id', r.exercise_id,
        'performed_at', r.performed_at,
        'weight_kg', r.weight_kg,
        'reps', r.reps,
        'rir', r.rir,
        'rest_seconds', r.rest_seconds,
        'reached_failure', r.reached_failure,
        'sets', (
          select coalesce(jsonb_agg(
                   jsonb_build_object(
                     'set_number', x.set_number,
                     'weight_kg', x.weight_kg,
                     'reps', x.reps,
                     'rir', x.rir,
                     'rest_seconds', x.rest_seconds,
                     'reached_failure', x.reached_failure
                   ) order by x.set_number), '[]'::jsonb)
            from public.workout_log_sets x
           where x.log_id = r.log_id
             and x.exercise_id = r.exercise_id
             and (x.weight_kg > 0 or x.reps > 0)
        )
      ) order by r.exercise_id
    ),
    '[]'::jsonb
  )
  from (
    select distinct on (s.exercise_id)
           s.exercise_id, s.log_id, l.performed_at, s.weight_kg, s.reps, s.rir,
           s.rest_seconds, s.reached_failure
      from public.workout_log_sets s
      join public.workout_logs l on l.id = s.log_id
     where l.subject_id = p_subject
       and (s.weight_kg > 0 or s.reps > 0)
     order by s.exercise_id,
              l.performed_at desc, l.created_at desc, l.id desc,
              case when s.weight_kg > 0 and s.reps > 0 then
                case when s.reps = 1 then s.weight_kg
                     else s.weight_kg * (1 + s.reps / 30.0) end
              end desc nulls last,
              s.reps desc nulls last,
              s.weight_kg desc nulls last,
              s.set_number desc, s.id desc
  ) r;
$$;

revoke execute on function app.workout_last_sets(uuid) from public, anon, authenticated;

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0054'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
