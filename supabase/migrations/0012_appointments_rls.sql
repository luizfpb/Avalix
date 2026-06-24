-- Avalix - migration 0012: RLS da agenda de avaliacoes
-- Depende de 0011. Visibilidade derivada do subject (mesma regra das demais
-- filhas); evaluator validado por trigger. Sem gate de consentimento.

alter table public.appointments enable row level security;

create policy appointments_select on public.appointments
  for select to authenticated
  using (app.can_view_subject_id(subject_id));

create policy appointments_insert on public.appointments
  for insert to authenticated
  with check (app.can_view_subject_id(subject_id));

create policy appointments_update on public.appointments
  for update to authenticated
  using (app.can_view_subject_id(subject_id))
  with check (app.can_view_subject_id(subject_id));

create policy appointments_delete on public.appointments
  for delete to authenticated
  using (app.can_view_subject_id(subject_id));
