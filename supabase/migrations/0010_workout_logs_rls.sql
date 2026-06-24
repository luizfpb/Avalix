-- Avalix - migration 0010: RLS do log de execucao de treino
-- Depende de 0009. Visibilidade derivada do subject; sem gate de consentimento
-- (execucao e dado operacional do treino, igual ao plano). org_id/subject_id
-- chegam via trigger b1, entao o with check de insert avalia o subject ja
-- resolvido (BEFORE triggers rodam antes do with check).

create or replace function app.can_view_workout_log_id(p_log uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select app.can_view_subject(s.org_id, s.evaluator_id)
       from public.workout_logs wl
       join public.subjects s on s.id = wl.subject_id
      where wl.id = p_log),
    false);
$$;

alter table public.workout_logs     enable row level security;
alter table public.workout_log_sets enable row level security;

-- workout_logs (via subject)
create policy workout_logs_select on public.workout_logs
  for select to authenticated using (app.can_view_subject_id(subject_id));
create policy workout_logs_insert on public.workout_logs
  for insert to authenticated with check (app.can_view_subject_id(subject_id));
create policy workout_logs_update on public.workout_logs
  for update to authenticated using (app.can_view_subject_id(subject_id))
  with check (app.can_view_subject_id(subject_id));
create policy workout_logs_delete on public.workout_logs
  for delete to authenticated using (app.can_view_subject_id(subject_id));

-- workout_log_sets (via log)
create policy workout_log_sets_select on public.workout_log_sets
  for select to authenticated using (app.can_view_workout_log_id(log_id));
create policy workout_log_sets_insert on public.workout_log_sets
  for insert to authenticated with check (app.can_view_workout_log_id(log_id));
create policy workout_log_sets_update on public.workout_log_sets
  for update to authenticated using (app.can_view_workout_log_id(log_id))
  with check (app.can_view_workout_log_id(log_id));
create policy workout_log_sets_delete on public.workout_log_sets
  for delete to authenticated using (app.can_view_workout_log_id(log_id));
