-- 0042 — vídeo de demonstração dos exercícios.
-- Aplicar depois da 0041. Não altera dado existente nem policy de outra tabela.
--
-- A demonstração era só uma busca no YouTube pelo nome do exercício: o aluno
-- recebia uma lista de resultados e escolhia sozinho. Agora cada exercício
-- resolve o vídeo em três níveis, do mais específico para o mais genérico:
--
--   1. o vídeo que o profissional escolheu (exercise_videos, por organização);
--   2. o vídeo curado do catálogo global (exercises.catalog_video_url);
--   3. a busca pelo nome, como antes (montada no frontend, nada no banco).
--
-- Só YouTube, e o link é guardado numa única forma canônica
-- (https://www.youtube.com/watch?v=<id>, com &t=<segundos> opcional). O
-- frontend converte youtu.be, shorts, embed e m.youtube.com para ela; o banco
-- recusa o resto. Link é só texto: nada é hospedado, nenhum custo de mídia.
begin;

create or replace function app.youtube_url_ok(p text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}(&t=[0-9]{1,5})?$'
$$;

-- ---------------------------------------------------------------- catálogo

-- Preenchida por migration, só nas linhas globais. Exercício personalizado
-- tem vídeo pelo mesmo caminho que o global: exercise_videos. Sem isso, a
-- policy de update dos personalizados deixaria dois lugares para a mesma
-- informação.
alter table public.exercises
  add column if not exists catalog_video_url text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'exercises_catalog_video_chk'
  ) then
    alter table public.exercises
      add constraint exercises_catalog_video_chk check (
        catalog_video_url is null
        or (org_id is null and app.youtube_url_ok(catalog_video_url))
      );
  end if;
end $$;

comment on column public.exercises.catalog_video_url is
  'Vídeo curado do catálogo global (só org_id null). O da organização, em exercise_videos, tem precedência.';

-- ---------------------------------------------------------------- por organização

create table if not exists public.exercise_videos (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  video_url   text not null,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (org_id, exercise_id),
  constraint exercise_videos_url_chk check (app.youtube_url_ok(video_url))
);

create index if not exists exercise_videos_exercise_idx on public.exercise_videos (exercise_id);

drop trigger if exists exercise_videos_freeze on public.exercise_videos;
create trigger exercise_videos_freeze
  before update on public.exercise_videos
  for each row execute function app.freeze_columns('org_id', 'exercise_id');

drop trigger if exists exercise_videos_updated_at on public.exercise_videos;
create trigger exercise_videos_updated_at
  before update on public.exercise_videos
  for each row execute function app.set_updated_at();

alter table public.exercise_videos enable row level security;

-- Leitura: membros da organização. Escrita: membros com 2FA satisfeito, como
-- no catálogo personalizado (0031), e só para exercício que a organização
-- enxerga — global ou dela. O exists roda com os direitos de quem grava: o
-- exercício personalizado de outra organização não aparece e a linha é
-- recusada.
drop policy if exists exercise_videos_select on public.exercise_videos;
create policy exercise_videos_select on public.exercise_videos
  for select to authenticated
  using (app.is_member(org_id));

drop policy if exists exercise_videos_insert on public.exercise_videos;
create policy exercise_videos_insert on public.exercise_videos
  for insert to authenticated
  with check (
    app.is_member(org_id) and app.mfa_satisfied()
    and exists (
      select 1 from public.exercises x
       where x.id = exercise_id
         and (x.org_id is null or x.org_id = exercise_videos.org_id)
    )
  );

drop policy if exists exercise_videos_update on public.exercise_videos;
create policy exercise_videos_update on public.exercise_videos
  for update to authenticated
  using (app.is_member(org_id) and app.mfa_satisfied())
  with check (app.is_member(org_id) and app.mfa_satisfied());

drop policy if exists exercise_videos_delete on public.exercise_videos;
create policy exercise_videos_delete on public.exercise_videos
  for delete to authenticated
  using (app.is_member(org_id) and app.mfa_satisfied());

revoke all on public.exercise_videos from anon;
grant select, insert, update, delete on public.exercise_videos to authenticated;

-- ---------------------------------------------------------------- pacote do aluno

-- Igual à 0030, mais o vídeo já resolvido (níveis 1 e 2) de cada exercício.
-- O aluno é anônimo e não lê exercise_videos; nulo aqui = o frontend monta a
-- busca pelo nome (nível 3).
create or replace function app.workout_plan_payload(p_plan uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'plan', (
      select jsonb_build_object(
               'id', p.id, 'name', p.name, 'goal', p.goal, 'weeks', p.weeks,
               'starts_on', p.starts_on, 'notes', p.notes, 'status', p.status,
               'weekly_schedule', to_jsonb(p.weekly_schedule))
        from public.workout_plans p where p.id = p_plan
    ),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'label', d.label, 'name', d.name, 'position', d.position)
             order by d.position)
        from public.workout_days d where d.plan_id = p_plan
    ), '[]'::jsonb),
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'day_id', e.day_id, 'exercise_id', e.exercise_id,
               'name', x.name, 'position', e.position, 'sets', e.sets,
               'reps', e.reps, 'rir', e.rir, 'rest_seconds', e.rest_seconds,
               'tempo', e.tempo, 'notes', e.notes,
               'group_key', e.group_key, 'group_kind', e.group_kind,
               'technique', e.technique,
               'video_url', coalesce(v.video_url, x.catalog_video_url))
             order by e.position)
        from public.workout_exercises e
        join public.workout_days d  on d.id = e.day_id
        join public.workout_plans p on p.id = d.plan_id
        join public.exercises x     on x.id = e.exercise_id
        left join public.exercise_videos v
               on v.org_id = p.org_id and v.exercise_id = e.exercise_id
       where d.plan_id = p_plan
    ), '[]'::jsonb),
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'week_number', w.week_number, 'label', w.label,
               'is_deload', w.is_deload, 'notes', w.notes)
             order by w.week_number)
        from public.workout_weeks w where w.plan_id = p_plan
    ), '[]'::jsonb),
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
               'week_number', o.week_number,
               'workout_exercise_id', o.workout_exercise_id,
               'sets', o.sets, 'reps', o.reps, 'rir', o.rir,
               'rest_seconds', o.rest_seconds, 'is_skipped', o.is_skipped,
               'notes', o.notes)
             order by o.week_number)
        from public.workout_week_overrides o where o.plan_id = p_plan
    ), '[]'::jsonb)
  );
$fn$;

revoke execute on function app.workout_plan_payload(uuid) from public, anon, authenticated;

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0042'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
