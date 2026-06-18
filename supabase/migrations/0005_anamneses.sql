-- Avalix - migration 0005: anamnese e triagem de prontidao
-- Depende de 0001-0004. Rodar no SQL Editor do Supabase (ou supabase db push).
--
-- Dado de saude (sensivel, LGPD art. 11). Segue o MESMO padrao das outras
-- tabelas filhas: org_id herdado do subject por trigger, evaluator validado,
-- colunas relacionais congeladas, auditoria, e RLS derivada de can_view_subject
-- (logo ja coberta pelo gate de MFA/AAL2 da 0003). INSERT exige consentimento
-- vigente, igual a assessments/posturais.
--
-- Versionada por data (a spec pede: anamnese muda com o tempo - lesao nova,
-- gravidez, medicacao; nao sobrescrever). O conteudo completo fica em payload
-- jsonb; as saidas do gate (liberado/nivel/flag) ficam em colunas pra exibir e
-- filtrar sem abrir o payload. payload e a fonte de verdade das respostas.

create table public.anamneses (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  subject_id           uuid not null references public.subjects(id) on delete cascade,
  evaluator_id         uuid not null default auth.uid() references public.profiles(id),
  assessed_at          date not null default current_date,
  spec_version         text not null,
  payload              jsonb not null,
  -- saidas do gate (calculadas no app, modulo puro e testado)
  liberado             boolean not null,
  nivel_encaminhamento text not null
                       check (nivel_encaminhamento in ('liberado','antes_vigorosa','antes_iniciar')),
  flag_encaminhamento  boolean not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index anamneses_subject_idx on public.anamneses (subject_id, assessed_at desc);

create trigger anamneses_b1_org
  before insert on public.anamneses
  for each row execute function app.org_from_subject();

create trigger anamneses_b2_evaluator
  before insert or update on public.anamneses
  for each row execute function app.check_evaluator();

create trigger anamneses_freeze
  before update on public.anamneses
  for each row execute function app.freeze_columns('org_id', 'subject_id');

create trigger anamneses_updated_at
  before update on public.anamneses
  for each row execute function app.set_updated_at();

create trigger anamneses_audit
  after insert or update or delete on public.anamneses
  for each row execute function app.audit();

alter table public.anamneses enable row level security;

create policy anamneses_select on public.anamneses
  for select to authenticated
  using (app.can_view_subject_id(subject_id));

create policy anamneses_insert on public.anamneses
  for insert to authenticated
  with check (
    app.can_view_subject_id(subject_id)
    and app.has_active_consent(subject_id)
  );

create policy anamneses_update on public.anamneses
  for update to authenticated
  using (app.can_view_subject_id(subject_id))
  with check (app.can_view_subject_id(subject_id));

create policy anamneses_delete on public.anamneses
  for delete to authenticated
  using (app.can_view_subject_id(subject_id));
