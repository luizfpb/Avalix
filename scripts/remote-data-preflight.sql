-- Somente leitura. Retorna apenas contagens, nunca dados pessoais.
-- Use antes e depois da migration e guarde a saida junto do registro do rollout:
-- npx supabase db query --linked --file scripts/remote-data-preflight.sql

with metrics(metric, value) as (
  values
    ('auth_users', (select count(*)::bigint from auth.users)),
    ('auth_users_with_verified_mfa', (
      select count(*)::bigint
      from auth.users u
      where exists (
        select 1 from auth.mfa_factors f
        where f.user_id = u.id and f.status = 'verified'
      )
    )),
    ('auth_users_without_verified_mfa', (
      select count(*)::bigint
      from auth.users u
      where not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = u.id and f.status = 'verified'
      )
    )),
    ('profiles', (select count(*)::bigint from public.profiles)),
    ('organizations', (select count(*)::bigint from public.organizations)),
    ('org_members', (select count(*)::bigint from public.org_members)),
    ('subjects', (select count(*)::bigint from public.subjects)),
    ('assessments', (select count(*)::bigint from public.assessments)),
    ('skinfold_readings', (select count(*)::bigint from public.skinfold_readings)),
    ('circumference_readings', (select count(*)::bigint from public.circumference_readings)),
    ('anamneses', (select count(*)::bigint from public.anamneses)),
    ('anamnese_intakes', (select count(*)::bigint from public.anamnese_intakes)),
    ('intakes_pending', (
      select count(*)::bigint from public.anamnese_intakes where status = 'pending'
    )),
    ('intakes_submitted', (
      select count(*)::bigint from public.anamnese_intakes where status = 'submitted'
    )),
    ('intakes_accepted', (
      select count(*)::bigint from public.anamnese_intakes where status = 'accepted'
    )),
    ('intakes_rejected', (
      select count(*)::bigint from public.anamnese_intakes where status = 'rejected'
    )),
    ('intakes_canceled', (
      select count(*)::bigint from public.anamnese_intakes where status = 'canceled'
    )),
    ('intakes_expired', (
      select count(*)::bigint from public.anamnese_intakes where status = 'expired'
    )),
    ('consent_records', (select count(*)::bigint from public.consent_records)),
    ('posture_sessions', (select count(*)::bigint from public.posture_sessions)),
    ('posture_photos', (select count(*)::bigint from public.posture_photos)),
    ('posture_annotations', (select count(*)::bigint from public.posture_annotations)),
    ('workout_plans', (select count(*)::bigint from public.workout_plans)),
    ('workout_days', (select count(*)::bigint from public.workout_days)),
    ('workout_exercises', (select count(*)::bigint from public.workout_exercises)),
    ('workout_week_overrides', (
      select count(*)::bigint from public.workout_week_overrides
    )),
    ('workout_weeks', (select count(*)::bigint from public.workout_weeks)),
    ('workout_logs', (select count(*)::bigint from public.workout_logs)),
    ('workout_log_sets', (select count(*)::bigint from public.workout_log_sets)),
    ('appointments', (select count(*)::bigint from public.appointments)),
    ('audit_logs', (select count(*)::bigint from public.audit_logs)),
    ('storage_photos', (
      select count(*)::bigint from storage.objects where bucket_id = 'photos'
    )),
    ('storage_logos', (
      select count(*)::bigint from storage.objects where bucket_id = 'logos'
    )),
    ('active_consent_extra_rows_to_supersede', (
      select coalesce(sum(active_count - 1), 0)::bigint
      from (
        select count(*)::bigint as active_count
        from public.consent_records
        where revoked_at is null
        group by subject_id
        having count(*) > 1
      ) duplicates
    )),
    ('terminal_intakes_with_any_evidence_to_anonymize', (
      select count(*)::bigint
      from public.anamnese_intakes
      where status in ('rejected', 'canceled')
        and (
          payload is not null or registration is not null
          or submitted_at is not null or signer_kind is not null
          or signer_name is not null or consent_version is not null
          or consent_text_sha256 is not null or submit_user_agent is not null
          or resulting_anamnese_id is not null or resulting_subject_id is not null
        )
    )),
    ('expired_pending_intakes', (
      select count(*)::bigint
      from public.anamnese_intakes
      where status = 'pending' and expires_at <= now()
    )),
    ('expired_submitted_intakes_preserved', (
      select count(*)::bigint
      from public.anamnese_intakes
      where status = 'submitted' and expires_at <= now()
    )),
    ('minor_subjects_missing_guardian', (
      select count(*)::bigint
      from public.subjects
      where birth_date > current_date - interval '18 years'
        and (
          char_length(coalesce(btrim(guardian_name), '')) < 3
          or char_length(coalesce(btrim(guardian_relationship), '')) < 2
        )
    )),
    ('photo_rows_missing_original_object', (
      select count(*)::bigint
      from public.posture_photos p
      where not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'photos' and o.name = p.storage_path
      )
    )),
    ('photo_rows_missing_thumbnail_object', (
      select count(*)::bigint
      from public.posture_photos p
      where not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'photos' and o.name = p.thumb_path
      )
    )),
    ('orphan_photo_objects', (
      select count(*)::bigint
      from storage.objects o
      where o.bucket_id = 'photos'
        and not exists (
          select 1 from public.posture_photos p
          where p.storage_path = o.name or p.thumb_path = o.name
        )
    ))
)
select metric, value
from metrics
order by metric;
