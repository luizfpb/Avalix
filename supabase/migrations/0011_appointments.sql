-- Avalix - migration 0011: agenda de sessoes de avaliacao (schema)
-- Compromissos (agendamentos) de avaliacao com um avaliado. Mesmo arcabouco das
-- filhas do subject: org_id herdado por trigger b1, evaluator validado, freeze,
-- auditoria, RLS via can_view_subject. SEM gate de consentimento: agendar e ato
-- administrativo (o consentimento e coletado na sessao). v1 e so avaliacao
-- (sem treino), entao um titulo default basta — sem coluna de tipo.

create table public.appointments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  subject_id    uuid not null references public.subjects(id) on delete cascade,
  evaluator_id  uuid not null default auth.uid() references public.profiles(id),
  title         text not null default 'Avaliacao fisica'
                check (char_length(title) between 1 and 120),
  starts_at     timestamptz not null,
  duration_min  int not null default 60 check (duration_min between 5 and 1440),
  location      text check (location is null or char_length(location) <= 200),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index appointments_org_starts_idx on public.appointments (org_id, starts_at);
create index appointments_subject_idx on public.appointments (subject_id, starts_at desc);

create trigger appointments_b1_org
  before insert on public.appointments
  for each row execute function app.org_from_subject();

create trigger appointments_b2_evaluator
  before insert or update on public.appointments
  for each row execute function app.check_evaluator();

create trigger appointments_freeze
  before update on public.appointments
  for each row execute function app.freeze_columns('org_id', 'subject_id');

create trigger appointments_updated_at
  before update on public.appointments
  for each row execute function app.set_updated_at();

create trigger appointments_audit
  after insert or update or delete on public.appointments
  for each row execute function app.audit();
