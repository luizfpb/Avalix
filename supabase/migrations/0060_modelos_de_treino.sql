-- 0060 — biblioteca de modelos (templates) de treino reutilizáveis por organização.
-- Aplicar depois da 0059. Não altera dado existente.
--
-- Permite que o profissional salve qualquer plano de treino como modelo da
-- organização (divisões, exercícios, sequência semanal, semanas e ajustes) e
-- reaproveite esse modelo ao montar o plano de novos alunos.
--
-- O snapshot fica em `payload` (jsonb), no mesmo formato lógico do editor:
--   { days: [...], weekly_schedule: [...], weeks: [...], overrides: [...] }
-- RLS por organização (`app.is_member(org_id)` + `app.mfa_satisfied()`),
-- `anon` sem acesso, bloqueio de escrita no modo só leitura (`b9_billing`),
-- colunas estruturais congeladas (`org_id`, `created_by`) e trilha de auditoria.
begin;

create or replace function app.workout_template_payload_valid(p jsonb)
returns boolean
language plpgsql immutable security definer set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return false;
  end if;
  if not (p ? 'days' and jsonb_typeof(p -> 'days') = 'array') then
    return false;
  end if;
  if p ? 'weekly_schedule' and jsonb_typeof(p -> 'weekly_schedule') <> 'array' then
    return false;
  end if;
  if p ? 'weeks' and jsonb_typeof(p -> 'weeks') <> 'array' then
    return false;
  end if;
  if p ? 'overrides' and jsonb_typeof(p -> 'overrides') <> 'array' then
    return false;
  end if;
  return jsonb_array_length(p -> 'days') between 1 and 14;
end;
$$;

revoke execute on function app.workout_template_payload_valid(jsonb) from public, anon;
grant execute on function app.workout_template_payload_valid(jsonb) to authenticated;

create table public.workout_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  created_by  uuid not null default auth.uid() references public.profiles(id),
  name        text not null,
  goal        text,
  weeks       int not null default 4,
  notes       text,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint workout_templates_name_len check (char_length(trim(name)) between 1 and 120),
  constraint workout_templates_weeks_range check (weeks between 1 and 52),
  constraint workout_templates_notes_len check (notes is null or char_length(notes) <= 4000),
  constraint workout_templates_payload_valid check (app.workout_template_payload_valid(payload))
);

create index workout_templates_org_idx
  on public.workout_templates (org_id, updated_at desc, id desc);

create trigger workout_templates_b9_billing
  before insert or update on public.workout_templates
  for each row execute function app.billing_write_guard();

create trigger workout_templates_freeze
  before update on public.workout_templates
  for each row execute function app.freeze_columns('org_id', 'created_by');

create trigger workout_templates_updated_at
  before update on public.workout_templates
  for each row execute function app.set_updated_at();

create trigger workout_templates_audit
  after insert or update or delete on public.workout_templates
  for each row execute function app.audit();

alter table public.workout_templates enable row level security;
revoke all on public.workout_templates from anon;

create policy workout_templates_select on public.workout_templates
  for select to authenticated
  using (app.is_member(org_id));

create policy workout_templates_insert on public.workout_templates
  for insert to authenticated
  with check (
    app.is_member(org_id)
    and app.mfa_satisfied()
    and created_by = auth.uid()
  );

create policy workout_templates_update on public.workout_templates
  for update to authenticated
  using (app.is_member(org_id) and app.mfa_satisfied())
  with check (app.is_member(org_id) and app.mfa_satisfied());

create policy workout_templates_delete on public.workout_templates
  for delete to authenticated
  using (app.is_member(org_id) and app.mfa_satisfied());

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0060'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
