-- Somente leitura. Use com:
-- npx supabase db query --linked --file scripts/remote-schema-preflight.sql
--
-- Este diagnostico NAO altera schema, dados nem o historico de migrations.
-- Ele existe porque migrations aplicadas pelo SQL Editor podem estar presentes
-- no schema sem constar em supabase_migrations.schema_migrations.

with migration_checks(version, evidence, present) as (
  values
    ('0003', 'app.mfa_satisfied()',
      to_regprocedure('app.mfa_satisfied()') is not null),
    ('0004', 'public.assessments.medications',
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'assessments'
          and column_name = 'medications'
      )),
    ('0005', 'public.anamneses',
      to_regclass('public.anamneses') is not null),
    ('0006', 'public.workout_plans',
      to_regclass('public.workout_plans') is not null),
    ('0007', 'RLS/policy workout_plans_select',
      exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'workout_plans'
          and policyname = 'workout_plans_select'
      )),
    ('0008', 'catalogo global de exercicios',
      to_regclass('public.exercises') is not null
      and (select count(*) from public.exercises where org_id is null) >= 275),
    ('0009', 'public.workout_logs',
      to_regclass('public.workout_logs') is not null),
    ('0010', 'RLS/policy workout_logs_select',
      exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'workout_logs'
          and policyname = 'workout_logs_select'
      )),
    ('0011', 'public.appointments',
      to_regclass('public.appointments') is not null),
    ('0012', 'RLS/policy appointments_select',
      exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'appointments'
          and policyname = 'appointments_select'
      )),
    ('0013', 'public.workout_plans.weekly_schedule',
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'workout_plans'
          and column_name = 'weekly_schedule'
      )),
    ('0014', 'seed global com nomes acentuados',
      to_regclass('public.exercises') is not null
      and not exists (
        select 1 from public.exercises
        where org_id is null and name = 'Agachamento sumo com barra'
      )
      and exists (
        select 1 from public.exercises
        where org_id is null and name = 'Agachamento sumô com barra'
      )),
    ('0015', 'app.uuid_or_null(text)',
      to_regprocedure('app.uuid_or_null(text)') is not null),
    ('0016', 'public.replace_assessment_readings',
      exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'replace_assessment_readings'
      )),
    ('0017', 'public.anamnese_intakes',
      to_regclass('public.anamnese_intakes') is not null),
    ('0018', 'public.anamnese_intakes.registration',
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'anamnese_intakes'
          and column_name = 'registration'
      )),
    ('0019', 'client_errors + saves atomicos + TTL',
      to_regclass('public.client_errors') is not null
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'save_assessment'
      )
      and exists (
        select 1 from pg_constraint c
        where c.conname = 'anamnese_intakes_ttl_chk'
          and c.conrelid = 'public.anamnese_intakes'::regclass
      )),
    ('0020', 'snapshots LGPD + exclusao em duas fases',
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'consent_records'
          and column_name = 'consent_text_snapshot'
      )
      and to_regprocedure('public.prepare_subject_deletion(uuid)') is not null
      and to_regprocedure('public.app_schema_version()') is not null),
    ('0021', 'constraints retroativas validadas',
      (
        select count(*) = 3 and bool_and(c.convalidated)
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and (
            (t.relname = 'consent_records' and c.conname = 'consent_records_v11_snapshot_chk')
            or (t.relname = 'audit_logs' and c.conname in (
              'audit_logs_action_chk', 'audit_logs_table_name_chk'
            ))
          )
      )),
    ('0022', 'MFA nas escritas de organizacao',
      exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'organizations'
          and policyname = 'organizations_update'
          and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%mfa_satisfied%'
      )),
    ('0023', 'saves concorrentes + anotacao unica',
      to_regprocedure(
        'public.save_assessment(uuid,date,text,numeric,numeric,jsonb,text,jsonb,jsonb,text,text,timestamptz)'
      ) is not null
      and exists (
        select 1 from pg_constraint
        where conrelid = 'public.posture_annotations'::regclass
          and conname = 'posture_annotations_photo_key'
      )),
    ('0024', 'contato LGPD da organizacao',
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'organizations'
          and column_name = 'contact_email'
      )
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'organizations'
          and column_name = 'contact_phone'
      )),
    ('0025', 'save_workout_plan com argumentos opcionais',
      exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'save_workout_plan'
          and p.pronargdefaults >= 3
      )),
    ('0026', 'auditoria de resumo de anamnese por IA',
      coalesce(position('AI_SUMMARY' in pg_get_functiondef(
        to_regprocedure('public.log_data_action(uuid,text,text,uuid,uuid)')
      )) > 0, false)),
    ('0027', 'treino do aluno por link',
      to_regclass('public.workout_links') is not null
      and coalesce(
        to_regprocedure('public.submit_workout_session(text,uuid,jsonb,text,integer,date,text,uuid)'),
        to_regprocedure('public.submit_workout_session(text,uuid,jsonb,text,integer,date,text,uuid,integer)')
      ) is not null
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'workout_logs'
          and column_name = 'client_ref'
      )),
    ('0028', 'estabilizacao, gate server-side e historico composto',
      to_regprocedure(
        'public.create_assessment(uuid,date,text,numeric,numeric,jsonb,text,jsonb,jsonb,text,text)'
      ) is not null
      and to_regprocedure(
        'public.get_workout_history_page_for_link(text,integer,date,timestamp with time zone,uuid)'
      ) is not null
      and to_regprocedure(
        'public.submit_workout_session(text,uuid,jsonb,text,integer,date,text,uuid,integer)'
      ) is not null
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'workout_logs'
          and column_name = 'client_revision'
      )
      and exists (
        select 1 from pg_constraint
        where conrelid = 'public.workout_exercises'::regclass
          and conname = 'workout_exercises_day_exercise_key'
      )
      and public.app_schema_version() = '0028')
)
select c.version,
       c.evidence,
       c.present,
       exists (
         select 1
         from supabase_migrations.schema_migrations m
         where m.version = c.version
       ) as recorded_in_history
from migration_checks c
order by c.version;
