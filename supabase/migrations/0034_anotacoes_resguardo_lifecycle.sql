-- 0034 — ciclo de vida das anotações preservadas na deduplicação da 0023.
-- Aplicar depois da 0033. Nenhuma anotação é apagada no rollout.
-- As folhas preservadas acompanham a foto na exclusão e entram na exportação
-- autorizada do titular. O acesso direto de clientes continua negado.
begin;

-- Não existe subject_id no resguardo original. Se a foto já foi eliminada,
-- adivinhar o titular ou apagar a anotação destruiria informação sem prova.
-- O preflight aborta a transação inteira e exige tratamento administrativo
-- explícito desse passivo antes de anunciar a correção como aplicada.
lock table public.posture_annotations_shadowed in share row exclusive mode;
do $$
declare
  v_unlinked bigint;
begin
  select count(*) into v_unlinked
    from public.posture_annotations_shadowed a
    left join public.posture_photos p on p.id = a.photo_id
   where p.id is null or p.org_id is distinct from a.org_id;
  if v_unlinked > 0 then
    raise exception using
      errcode = '23503',
      message = format('0034: %s anotação(ões) de resguardo sem foto da mesma organização.', v_unlinked),
      hint = 'Interrompa o rollout. Confira o passivo de posture_annotations_shadowed contra os backups e trate a origem ou eliminação autorizada antes de reaplicar. Nenhum dado foi apagado.';
  end if;
end;
$$;

alter table public.posture_annotations_shadowed
  add constraint posture_annotations_shadowed_photo_fkey
  foreign key (photo_id) references public.posture_photos(id) on delete cascade;
alter table public.posture_annotations_shadowed
  add constraint posture_annotations_shadowed_org_fkey
  foreign key (org_id) references public.organizations(id) on delete cascade;
create index posture_annotations_shadowed_photo_idx
  on public.posture_annotations_shadowed(photo_id);

create trigger posture_annotations_shadowed_b1_org
  before insert on public.posture_annotations_shadowed
  for each row execute function app.org_from_photo();
create trigger posture_annotations_shadowed_freeze
  before update on public.posture_annotations_shadowed
  for each row execute function app.freeze_columns('org_id', 'photo_id');

alter table public.posture_annotations_shadowed enable row level security;
revoke all on public.posture_annotations_shadowed from public, anon, authenticated;
comment on table public.posture_annotations_shadowed is
  'Folhas preservadas pela deduplicação da 0023. Acesso administrativo e exportação autorizada do titular; eliminadas em cascata junto da foto/organização. Sem acesso direto dos clientes.';

-- Mesma assinatura e autorização, acrescentando a coleção de resguardo ao
-- snapshot. O evento SUBJECT_EXPORT continua único e transacional.
create or replace function public.export_subject_data(p_subject uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_subject public.subjects;
  v_export  jsonb;
begin
  if v_actor is null or not app.mfa_satisfied() then
    raise exception 'nao autenticado ou MFA pendente';
  end if;
  select * into v_subject from public.subjects s where s.id = p_subject;
  if v_subject.id is null or not app.can_view_subject_id(p_subject) then
    raise exception 'avaliado inexistente ou sem acesso';
  end if;

  v_export := jsonb_build_object(
    'schema_version', '1.1',
    'exported_at', now(),
    'subject', to_jsonb(v_subject),
    'consent_records', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.granted_at, c.id)
        from public.consent_records c where c.subject_id = p_subject
    ), '[]'::jsonb),
    'anamneses', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.assessed_at, a.id)
        from public.anamneses a where a.subject_id = p_subject
    ), '[]'::jsonb),
    'anamnese_intakes', coalesce((
      select jsonb_agg((to_jsonb(i) - 'token_hash') order by i.created_at, i.id)
        from public.anamnese_intakes i
       where i.subject_id = p_subject or i.resulting_subject_id = p_subject
    ), '[]'::jsonb),
    'assessments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.assessed_at, a.id)
        from public.assessments a where a.subject_id = p_subject
    ), '[]'::jsonb),
    'circumference_readings', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at, c.id)
        from public.circumference_readings c
        join public.assessments a on a.id = c.assessment_id
       where a.subject_id = p_subject
    ), '[]'::jsonb),
    'skinfold_readings', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at, s.id)
        from public.skinfold_readings s
        join public.assessments a on a.id = s.assessment_id
       where a.subject_id = p_subject
    ), '[]'::jsonb),
    'posture_sessions', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.taken_at, s.id)
        from public.posture_sessions s where s.subject_id = p_subject
    ), '[]'::jsonb),
    'posture_photos', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at, p.id)
        from public.posture_photos p
        join public.posture_sessions s on s.id = p.session_id
       where s.subject_id = p_subject
    ), '[]'::jsonb),
    'posture_annotations', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at, a.id)
        from public.posture_annotations a
        join public.posture_photos p on p.id = a.photo_id
        join public.posture_sessions s on s.id = p.session_id
       where s.subject_id = p_subject
    ), '[]'::jsonb),
    'posture_annotations_shadowed', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at, a.id)
        from public.posture_annotations_shadowed a
        join public.posture_photos p on p.id = a.photo_id
        join public.posture_sessions s on s.id = p.session_id
       where s.subject_id = p_subject
    ), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.starts_at, a.id)
        from public.appointments a where a.subject_id = p_subject
    ), '[]'::jsonb),
    'workout_plans', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at, p.id)
        from public.workout_plans p where p.subject_id = p_subject
    ), '[]'::jsonb),
    'workout_days', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.plan_id, d.position, d.id)
        from public.workout_days d
        join public.workout_plans p on p.id = d.plan_id
       where p.subject_id = p_subject
    ), '[]'::jsonb),
    'workout_exercises', coalesce((
      select jsonb_agg(to_jsonb(e) order by d.plan_id, d.position, e.position, e.id)
        from public.workout_exercises e
        join public.workout_days d on d.id = e.day_id
        join public.workout_plans p on p.id = d.plan_id
       where p.subject_id = p_subject
    ), '[]'::jsonb),
    'workout_weeks', coalesce((
      select jsonb_agg(to_jsonb(w) order by w.plan_id, w.week_number, w.id)
        from public.workout_weeks w
        join public.workout_plans p on p.id = w.plan_id
       where p.subject_id = p_subject
    ), '[]'::jsonb),
    'workout_week_overrides', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.plan_id, o.week_number, o.id)
        from public.workout_week_overrides o
        join public.workout_plans p on p.id = o.plan_id
       where p.subject_id = p_subject
    ), '[]'::jsonb),
    'workout_logs', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.performed_at, l.id)
        from public.workout_logs l where l.subject_id = p_subject
    ), '[]'::jsonb),
    'workout_log_sets', coalesce((
      select jsonb_agg(to_jsonb(s) order by l.performed_at, s.log_id, s.set_number, s.id)
        from public.workout_log_sets s
        join public.workout_logs l on l.id = s.log_id
       where l.subject_id = p_subject
    ), '[]'::jsonb),
    'exercise_catalog', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.name, e.id)
        from public.exercises e
       where exists (
         select 1
           from public.workout_exercises we
           join public.workout_days d on d.id = we.day_id
           join public.workout_plans p on p.id = d.plan_id
          where p.subject_id = p_subject and we.exercise_id = e.id
       ) or exists (
         select 1
           from public.workout_log_sets ls
           join public.workout_logs l on l.id = ls.log_id
          where l.subject_id = p_subject and ls.exercise_id = e.id
       )
    ), '[]'::jsonb)
  );

  -- O snapshot e o evento nascem na mesma transacao: nao ha exportacao de
  -- dados sem trilha nem duplicidade por uma segunda chamada best-effort.
  insert into public.audit_logs (org_id, user_id, action, table_name, row_id, at)
  values (v_subject.org_id, v_actor, 'SUBJECT_EXPORT', 'subjects', p_subject, now());
  return v_export;
end;
$$;

revoke execute on function public.export_subject_data(uuid) from public, anon;
grant execute on function public.export_subject_data(uuid) to authenticated;

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0034'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
