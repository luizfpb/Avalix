-- Avalix - migration 0007: Row Level Security do modulo de treino
-- Depende de 0006. Negar por padrao; visibilidade sempre derivada do subject.
--
-- Decisao do produto: criar/editar plano de treino NAO exige consentimento
-- vigente (diferente de assessments/posturais/anamnese, que coletam dado de
-- saude do titular). O plano e saida profissional, nao coleta de dado sensivel,
-- entao o gate de consentimento nao se aplica aqui.

-- =====================================================================
-- HELPERS DE VISIBILIDADE (derivam do subject, igual can_view_assessment_id)
-- =====================================================================

create or replace function app.can_view_plan_id(p_plan uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select app.can_view_subject(s.org_id, s.evaluator_id)
       from public.workout_plans wp
       join public.subjects s on s.id = wp.subject_id
      where wp.id = p_plan),
    false);
$$;

create or replace function app.can_view_workout_day_id(p_day uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select app.can_view_subject(s.org_id, s.evaluator_id)
       from public.workout_days d
       join public.workout_plans wp on wp.id = d.plan_id
       join public.subjects s on s.id = wp.subject_id
      where d.id = p_day),
    false);
$$;

-- =====================================================================
-- HABILITAR RLS
-- =====================================================================

alter table public.exercises              enable row level security;
alter table public.workout_plans          enable row level security;
alter table public.workout_days           enable row level security;
alter table public.workout_exercises      enable row level security;
alter table public.workout_week_overrides enable row level security;
alter table public.workout_weeks          enable row level security;

-- =====================================================================
-- EXERCISES
-- leitura: catalogo global (org_id null) OU custom de uma org da qual sou
-- membro. escrita: SO em linha custom da org. Linha global nao casa nenhuma
-- policy de escrita -> imutavel pra usuario; o seed (0008) roda como service
-- role e passa por cima da RLS.
-- =====================================================================

create policy exercises_select on public.exercises
  for select to authenticated
  using (org_id is null or app.is_member(org_id));

create policy exercises_insert on public.exercises
  for insert to authenticated
  with check (org_id is not null and app.is_member(org_id));

create policy exercises_update on public.exercises
  for update to authenticated
  using (org_id is not null and app.is_member(org_id))
  with check (org_id is not null and app.is_member(org_id));

create policy exercises_delete on public.exercises
  for delete to authenticated
  using (org_id is not null and app.role_in(org_id, array['owner','admin']));

-- =====================================================================
-- WORKOUT_PLANS (e filhas) - visibilidade derivada do subject.
-- Sem gate de consentimento (ver cabecalho). org_id chega via trigger.
-- =====================================================================

create policy workout_plans_select on public.workout_plans
  for select to authenticated
  using (app.can_view_subject_id(subject_id));

create policy workout_plans_insert on public.workout_plans
  for insert to authenticated
  with check (app.can_view_subject_id(subject_id));

create policy workout_plans_update on public.workout_plans
  for update to authenticated
  using (app.can_view_subject_id(subject_id))
  with check (app.can_view_subject_id(subject_id));

create policy workout_plans_delete on public.workout_plans
  for delete to authenticated
  using (app.can_view_subject_id(subject_id));

-- workout_days (via plano)
create policy workout_days_select on public.workout_days
  for select to authenticated using (app.can_view_plan_id(plan_id));
create policy workout_days_insert on public.workout_days
  for insert to authenticated with check (app.can_view_plan_id(plan_id));
create policy workout_days_update on public.workout_days
  for update to authenticated using (app.can_view_plan_id(plan_id))
  with check (app.can_view_plan_id(plan_id));
create policy workout_days_delete on public.workout_days
  for delete to authenticated using (app.can_view_plan_id(plan_id));

-- workout_exercises (via dia)
create policy workout_exercises_select on public.workout_exercises
  for select to authenticated using (app.can_view_workout_day_id(day_id));
create policy workout_exercises_insert on public.workout_exercises
  for insert to authenticated with check (app.can_view_workout_day_id(day_id));
create policy workout_exercises_update on public.workout_exercises
  for update to authenticated using (app.can_view_workout_day_id(day_id))
  with check (app.can_view_workout_day_id(day_id));
create policy workout_exercises_delete on public.workout_exercises
  for delete to authenticated using (app.can_view_workout_day_id(day_id));

-- workout_week_overrides (via plano)
create policy workout_week_overrides_select on public.workout_week_overrides
  for select to authenticated using (app.can_view_plan_id(plan_id));
create policy workout_week_overrides_insert on public.workout_week_overrides
  for insert to authenticated with check (app.can_view_plan_id(plan_id));
create policy workout_week_overrides_update on public.workout_week_overrides
  for update to authenticated using (app.can_view_plan_id(plan_id))
  with check (app.can_view_plan_id(plan_id));
create policy workout_week_overrides_delete on public.workout_week_overrides
  for delete to authenticated using (app.can_view_plan_id(plan_id));

-- workout_weeks (via plano)
create policy workout_weeks_select on public.workout_weeks
  for select to authenticated using (app.can_view_plan_id(plan_id));
create policy workout_weeks_insert on public.workout_weeks
  for insert to authenticated with check (app.can_view_plan_id(plan_id));
create policy workout_weeks_update on public.workout_weeks
  for update to authenticated using (app.can_view_plan_id(plan_id))
  with check (app.can_view_plan_id(plan_id));
create policy workout_weeks_delete on public.workout_weeks
  for delete to authenticated using (app.can_view_plan_id(plan_id));
