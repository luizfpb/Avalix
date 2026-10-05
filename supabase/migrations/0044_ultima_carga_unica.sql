-- 0044 — a última carga com uma regra só, para o aluno e para o profissional.
-- Aplicar depois da 0043. Não altera tabela, RLS, policy nem dado existente.
--
-- A tela do aluno mostrava a série mais pesada da última sessão
-- (app.workout_last_sets); a Execução escolhia a de maior 1RM estimado, e só
-- dentro do plano atual. Resultado: no primeiro treino de um mesociclo novo o
-- profissional ficava sem sugestão de carga, e as duas telas podiam mostrar
-- "últimas" diferentes para a mesma sessão (40×12 de um lado, 42,5×6 do
-- outro). Quem registrou a sessão nunca importou para o servidor.
--
-- app.workout_last_sets passa a ser a regra das duas telas: a sessão mais
-- recente do aluno com o exercício, em qualquer plano e registrada por quem
-- for; dentro dela, a melhor série pelo Epley (o mesmo de estimateOneRm).
-- Série sem carga continua valendo para exercício de peso corporal: só perde
-- para a que tem carga e repetições. O profissional lê o mesmo resultado por
-- subject_last_sets, com o acesso conferido pela regra que a RLS usa.
begin;

-- Mesma assinatura e mesmo formato da 0033: o pacote do aluno não muda.
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
        'reached_failure', r.reached_failure
      ) order by r.exercise_id
    ),
    '[]'::jsonb
  )
  from (
    select distinct on (s.exercise_id)
           s.exercise_id, l.performed_at, s.weight_kg, s.reps, s.rir,
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

-- Dentro desta função a RLS não vale: o acesso é conferido aqui, pela mesma
-- regra das policies (organização, avaliador e segundo fator).
create or replace function public.subject_last_sets(p_subject uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_subject is null or not app.can_view_subject_id(p_subject) then
    return '[]'::jsonb;
  end if;
  return app.workout_last_sets(p_subject);
end;
$$;

revoke execute on function public.subject_last_sets(uuid) from public, anon;
grant execute on function public.subject_last_sets(uuid) to authenticated;

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0044'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
