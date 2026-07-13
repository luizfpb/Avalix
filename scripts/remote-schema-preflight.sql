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
      and to_regprocedure('public.app_schema_version()') is not null)
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
