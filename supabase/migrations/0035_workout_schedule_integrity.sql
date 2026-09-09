-- 0035 — a sequência semanal só referencia divisões do próprio plano.
-- Aplicar depois da 0034. Repetições e sequência vazia continuam permitidas.
-- A verificação diferida observa o estado final das RPCs create/save/replace,
-- que removem e recriam as divisões dentro da mesma transação.
begin;

lock table public.workout_plans, public.workout_days in share row exclusive mode;
do $$
declare
  v_invalid bigint;
begin
  select count(*) into v_invalid
    from public.workout_plans p
   where exists (
     select 1 from unnest(p.weekly_schedule) desired(label)
      where not exists (
        select 1 from public.workout_days d where d.plan_id = p.id and d.label = desired.label
      )
   );
  if v_invalid > 0 then
    raise exception using
      errcode = '23514',
      message = format('0035: %s plano(s) com sequência semanal sem divisão correspondente.', v_invalid),
      hint = 'Interrompa o rollout e confira os planos inconsistentes antes de reaplicar. Nenhuma sequência ou prescrição foi alterada automaticamente.';
  end if;
end;
$$;

create function app.check_workout_schedule()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_plan uuid;
  v_schedule text[];
begin
  if tg_table_name = 'workout_plans' then
    v_plan := new.id;
  elsif tg_op = 'DELETE' then
    v_plan := old.plan_id;
  else
    v_plan := new.plan_id;
  end if;

  -- Serializa a verificação com alterações do cabeçalho e dos dias do plano.
  -- NO KEY UPDATE é compatível com KEY SHARE da FK durante INSERT de dias,
  -- evitando um ciclo de locks entre dois inseridores antes da validação.
  select p.weekly_schedule into v_schedule from public.workout_plans p
   where p.id = v_plan for no key update;
  if not found then return null; end if; -- cascata de plano/titular removido

  if exists (
    select 1 from unnest(v_schedule) desired(label)
     where not exists (
       select 1 from public.workout_days d where d.plan_id = v_plan and d.label = desired.label
     )
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'workout_schedule_labels',
      message = 'A sequência semanal contém uma divisão que não existe neste plano.';
  end if;
  return null;
end;
$$;
revoke execute on function app.check_workout_schedule() from public, anon, authenticated;

create constraint trigger workout_plans_schedule_labels
  after insert or update of weekly_schedule on public.workout_plans
  deferrable initially deferred
  for each row execute function app.check_workout_schedule();
create constraint trigger workout_days_schedule_labels
  after insert or update of label, plan_id or delete on public.workout_days
  deferrable initially deferred
  for each row execute function app.check_workout_schedule();

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0035'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
