-- BodyTrack - migration 0002: Row Level Security (rev. Etapa 2.1)
-- Depende da 0001. Rodar em seguida.
-- Principio: negar por padrao. Sem policy = sem acesso. Nada de filtro so no front.
--
-- Novidades da 2.1:
--   * consentimento ativo e pre-condicao de INSERT pra todo dado sensivel
--     (avaliacoes, leituras, sessoes, fotos, anotacoes). select de dado
--     antigo continua permitido; revogacao bloqueia coleta nova.
--   * storage de fotos so aceita paths registrados em posture_photos e
--     herda a visibilidade por avaliador (nada de "membro da org ve tudo").

-- =====================================================================
-- HELPERS DE VISIBILIDADE
-- Regra de negocio: owner/admin enxergam tudo da org; avaliador comum
-- enxerga os avaliados dele, ou todos se organizations.evaluators_see_all.
-- security definer pra nao cair em recursao de RLS; coalesce(false) pra
-- linha inexistente virar negacao e nao null.
-- =====================================================================

create or replace function app.can_view_subject(p_org uuid, p_evaluator uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.role_in(p_org, array['owner','admin'])
      or (
        app.is_member(p_org)
        and (
          p_evaluator = (select auth.uid())
          or coalesce((select o.evaluators_see_all
                       from public.organizations o
                       where o.id = p_org), false)
        )
      );
$$;

create or replace function app.can_view_subject_id(p_subject uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select app.can_view_subject(s.org_id, s.evaluator_id)
       from public.subjects s
      where s.id = p_subject),
    false);
$$;

create or replace function app.can_view_assessment_id(p_assessment uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select app.can_view_subject(s.org_id, s.evaluator_id)
       from public.assessments a
       join public.subjects s on s.id = a.subject_id
      where a.id = p_assessment),
    false);
$$;

create or replace function app.can_view_session_id(p_session uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select app.can_view_subject(s.org_id, s.evaluator_id)
       from public.posture_sessions ps
       join public.subjects s on s.id = ps.subject_id
      where ps.id = p_session),
    false);
$$;

create or replace function app.can_view_photo_id(p_photo uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select app.can_view_subject(s.org_id, s.evaluator_id)
       from public.posture_photos pp
       join public.posture_sessions ps on ps.id = pp.session_id
       join public.subjects s on s.id = ps.subject_id
      where pp.id = p_photo),
    false);
$$;

-- =====================================================================
-- HELPERS DE CONSENTIMENTO
-- consentimento vigente = registro do subject com revoked_at nulo.
-- usados apenas em with check de INSERT: dado ja coletado continua
-- visivel/corrigivel; o que a revogacao bloqueia e coleta nova.
-- =====================================================================

create or replace function app.has_active_consent(p_subject uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.consent_records c
    where c.subject_id = p_subject
      and c.revoked_at is null
  );
$$;

create or replace function app.has_active_consent_assessment(p_assessment uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select app.has_active_consent(a.subject_id)
       from public.assessments a
      where a.id = p_assessment),
    false);
$$;

create or replace function app.has_active_consent_session(p_session uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select app.has_active_consent(ps.subject_id)
       from public.posture_sessions ps
      where ps.id = p_session),
    false);
$$;

create or replace function app.has_active_consent_photo(p_photo uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select app.has_active_consent(ps.subject_id)
       from public.posture_photos pp
       join public.posture_sessions ps on ps.id = pp.session_id
      where pp.id = p_photo),
    false);
$$;

-- =====================================================================
-- HELPERS DE STORAGE
-- o objeto so existe pra quem enxerga a foto correspondente no banco.
-- path que nao bate com nenhum posture_photos = acesso negado, o que
-- elimina path arbitrario e "seguranca por path dificil de adivinhar".
-- =====================================================================

create or replace function app.can_access_photo_object(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select app.can_view_photo_id(pp.id)
       from public.posture_photos pp
      where pp.storage_path = p_name or pp.thumb_path = p_name
      limit 1),
    false);
$$;

-- upload exige, alem da visibilidade, consentimento ainda vigente
create or replace function app.can_upload_photo_object(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select app.can_view_photo_id(pp.id) and app.has_active_consent_photo(pp.id)
       from public.posture_photos pp
      where pp.storage_path = p_name or pp.thumb_path = p_name
      limit 1),
    false);
$$;

-- =====================================================================
-- HABILITAR RLS EM TUDO
-- =====================================================================

alter table public.profiles               enable row level security;
alter table public.organizations          enable row level security;
alter table public.org_members            enable row level security;
alter table public.subjects               enable row level security;
alter table public.assessments            enable row level security;
alter table public.circumference_readings enable row level security;
alter table public.skinfold_readings      enable row level security;
alter table public.posture_sessions       enable row level security;
alter table public.posture_photos         enable row level security;
alter table public.posture_annotations    enable row level security;
alter table public.consent_records        enable row level security;
alter table public.audit_logs             enable row level security;
alter table public.plans                  enable row level security;
alter table public.org_subscriptions      enable row level security;

-- =====================================================================
-- PROFILES
-- le o proprio + perfis de quem divide alguma org (pra mostrar nome do
-- avaliador responsavel). escrita so no proprio. insert e via trigger.
-- =====================================================================

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
        from public.org_members a
        join public.org_members b on b.org_id = a.org_id
       where a.user_id = (select auth.uid())
         and b.user_id = profiles.id
    )
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- =====================================================================
-- ORGANIZATIONS
-- insert so pela RPC create_organization (security definer ignora RLS)
-- =====================================================================

create policy organizations_select on public.organizations
  for select to authenticated
  using (app.is_member(id));

create policy organizations_update on public.organizations
  for update to authenticated
  using (app.role_in(id, array['owner','admin']))
  with check (app.role_in(id, array['owner','admin']));

create policy organizations_delete on public.organizations
  for delete to authenticated
  using (app.role_in(id, array['owner']));

-- =====================================================================
-- ORG_MEMBERS
-- V1 nao tem UI de equipe, mas a regra ja fica pronta:
-- owner/admin gerenciam; qualquer membro pode sair da org.
-- =====================================================================

create policy org_members_select on public.org_members
  for select to authenticated
  using (app.is_member(org_id));

create policy org_members_insert on public.org_members
  for insert to authenticated
  with check (app.role_in(org_id, array['owner','admin']));

create policy org_members_update on public.org_members
  for update to authenticated
  using (app.role_in(org_id, array['owner','admin']))
  with check (app.role_in(org_id, array['owner','admin']));

create policy org_members_delete on public.org_members
  for delete to authenticated
  using (
    app.role_in(org_id, array['owner','admin'])
    or user_id = (select auth.uid())
  );

-- =====================================================================
-- SUBJECTS
-- exclusao e permitida a quem enxerga (LGPD: exclusao definitiva).
-- with check de insert/update prende a linha a uma org da qual o
-- usuario e membro; evaluator_id e validado por trigger (0001).
-- =====================================================================

create policy subjects_select on public.subjects
  for select to authenticated
  using (app.can_view_subject(org_id, evaluator_id));

create policy subjects_insert on public.subjects
  for insert to authenticated
  with check (app.is_member(org_id));

create policy subjects_update on public.subjects
  for update to authenticated
  using (app.can_view_subject(org_id, evaluator_id))
  with check (app.is_member(org_id));

create policy subjects_delete on public.subjects
  for delete to authenticated
  using (app.can_view_subject(org_id, evaluator_id));

-- =====================================================================
-- ASSESSMENTS (e filhas)
-- visibilidade sempre derivada do subject; org_id chega via trigger;
-- INSERT exige consentimento vigente.
-- =====================================================================

create policy assessments_select on public.assessments
  for select to authenticated
  using (app.can_view_subject_id(subject_id));

create policy assessments_insert on public.assessments
  for insert to authenticated
  with check (
    app.can_view_subject_id(subject_id)
    and app.has_active_consent(subject_id)
  );

create policy assessments_update on public.assessments
  for update to authenticated
  using (app.can_view_subject_id(subject_id))
  with check (app.can_view_subject_id(subject_id));

create policy assessments_delete on public.assessments
  for delete to authenticated
  using (app.can_view_subject_id(subject_id));

create policy circumference_select on public.circumference_readings
  for select to authenticated
  using (app.can_view_assessment_id(assessment_id));

create policy circumference_insert on public.circumference_readings
  for insert to authenticated
  with check (
    app.can_view_assessment_id(assessment_id)
    and app.has_active_consent_assessment(assessment_id)
  );

create policy circumference_update on public.circumference_readings
  for update to authenticated
  using (app.can_view_assessment_id(assessment_id))
  with check (app.can_view_assessment_id(assessment_id));

create policy circumference_delete on public.circumference_readings
  for delete to authenticated
  using (app.can_view_assessment_id(assessment_id));

create policy skinfold_select on public.skinfold_readings
  for select to authenticated
  using (app.can_view_assessment_id(assessment_id));

create policy skinfold_insert on public.skinfold_readings
  for insert to authenticated
  with check (
    app.can_view_assessment_id(assessment_id)
    and app.has_active_consent_assessment(assessment_id)
  );

create policy skinfold_update on public.skinfold_readings
  for update to authenticated
  using (app.can_view_assessment_id(assessment_id))
  with check (app.can_view_assessment_id(assessment_id));

create policy skinfold_delete on public.skinfold_readings
  for delete to authenticated
  using (app.can_view_assessment_id(assessment_id));

-- =====================================================================
-- POSTURAL
-- =====================================================================

create policy posture_sessions_select on public.posture_sessions
  for select to authenticated
  using (app.can_view_subject_id(subject_id));

create policy posture_sessions_insert on public.posture_sessions
  for insert to authenticated
  with check (
    app.can_view_subject_id(subject_id)
    and app.has_active_consent(subject_id)
  );

create policy posture_sessions_update on public.posture_sessions
  for update to authenticated
  using (app.can_view_subject_id(subject_id))
  with check (app.can_view_subject_id(subject_id));

create policy posture_sessions_delete on public.posture_sessions
  for delete to authenticated
  using (app.can_view_subject_id(subject_id));

create policy posture_photos_select on public.posture_photos
  for select to authenticated
  using (app.can_view_session_id(session_id));

create policy posture_photos_insert on public.posture_photos
  for insert to authenticated
  with check (
    app.can_view_session_id(session_id)
    and app.has_active_consent_session(session_id)
  );

create policy posture_photos_delete on public.posture_photos
  for delete to authenticated
  using (app.can_view_session_id(session_id));

-- anotacoes: schema pronto, UI na v1.1
create policy posture_annotations_select on public.posture_annotations
  for select to authenticated
  using (app.can_view_photo_id(photo_id));

create policy posture_annotations_insert on public.posture_annotations
  for insert to authenticated
  with check (
    app.can_view_photo_id(photo_id)
    and app.has_active_consent_photo(photo_id)
  );

create policy posture_annotations_update on public.posture_annotations
  for update to authenticated
  using (app.can_view_photo_id(photo_id))
  with check (app.can_view_photo_id(photo_id));

create policy posture_annotations_delete on public.posture_annotations
  for delete to authenticated
  using (app.can_view_photo_id(photo_id));

-- =====================================================================
-- CONSENT_RECORDS
-- criar consentimento nao exige consentimento previo, obviamente.
-- imutavel depois de criado (guard na 0001): so revoked_at muda.
-- sem policy de delete: o registro some apenas no cascade da exclusao
-- definitiva do subject (cascade ignora RLS).
-- =====================================================================

create policy consent_select on public.consent_records
  for select to authenticated
  using (app.can_view_subject_id(subject_id));

create policy consent_insert on public.consent_records
  for insert to authenticated
  with check (
    app.can_view_subject_id(subject_id)
    and collected_by = (select auth.uid())
  );

create policy consent_update on public.consent_records
  for update to authenticated
  using (app.can_view_subject_id(subject_id))
  with check (app.can_view_subject_id(subject_id));

-- =====================================================================
-- AUDIT_LOGS
-- triggers gravam via security definer (passam por cima da RLS).
-- app so pode inserir acoes de exportacao; leitura restrita a owner/admin;
-- sem update/delete: trilha imutavel.
-- =====================================================================

create policy audit_select on public.audit_logs
  for select to authenticated
  using (app.role_in(org_id, array['owner','admin']));

create policy audit_insert on public.audit_logs
  for insert to authenticated
  with check (
    app.is_member(org_id)
    and user_id = (select auth.uid())
    and action in ('EXPORT_CSV','EXPORT_JSON','PDF_REPORT','AI_SUMMARY')
  );

-- =====================================================================
-- PLANOS
-- =====================================================================

create policy plans_select on public.plans
  for select to authenticated
  using (true);

create policy org_subscriptions_select on public.org_subscriptions
  for select to authenticated
  using (app.is_member(org_id));

-- escrita em plans/org_subscriptions: somente service role (futuro billing)

-- =====================================================================
-- STORAGE
-- buckets privados. fluxo de upload: 1) insere a linha em posture_photos
-- (trigger gera os paths e devolve no select da insercao); 2) sobe o
-- arquivo exatamente nesses paths. a policy de insert do storage so
-- aceita path ja registrado, com visibilidade e consentimento validos.
-- consequencia: upload pra path arbitrario e impossivel, e a regra de
-- visibilidade por avaliador vale tambem pros arquivos.
-- ordem na exclusao definitiva: remover arquivos ANTES de apagar as
-- linhas (a policy resolve o objeto pela linha correspondente).
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, array['image/webp','image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', false, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy storage_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and app.can_access_photo_object(name)
  );

create policy storage_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and app.can_upload_photo_object(name)
  );

create policy storage_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and app.can_access_photo_object(name)
  );

-- logos: ativo da organizacao; membro le, owner/admin escrevem.
-- path: {org_id}/logo.{ext}
create policy storage_logos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'logos'
    and app.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy storage_logos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and app.role_in(((storage.foldername(name))[1])::uuid, array['owner','admin'])
  );

create policy storage_logos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos'
    and app.role_in(((storage.foldername(name))[1])::uuid, array['owner','admin'])
  )
  with check (
    bucket_id = 'logos'
    and app.role_in(((storage.foldername(name))[1])::uuid, array['owner','admin'])
  );

create policy storage_logos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos'
    and app.role_in(((storage.foldername(name))[1])::uuid, array['owner','admin'])
  );
