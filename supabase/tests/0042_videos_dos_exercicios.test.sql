-- Somente PostgreSQL/Supabase descartável, com migrations até a 0042.
-- Fixtures fictícias e escrita real sob authenticated; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(16);

select ok(public.app_schema_version() >= '0042',
  'schema inclui os vídeos dos exercícios');
select ok(
  app.youtube_url_ok('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  and app.youtube_url_ok('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42'),
  'forma canônica, com e sem instante inicial');
select ok(
  not app.youtube_url_ok('https://youtu.be/dQw4w9WgXcQ')
  and not app.youtube_url_ok('http://www.youtube.com/watch?v=dQw4w9WgXcQ')
  and not app.youtube_url_ok('https://www.youtube.com/watch?v=curto')
  and not app.youtube_url_ok('https://vimeo.com/123456')
  and not app.youtube_url_ok('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x'),
  'o resto é recusado: o frontend normaliza antes de gravar');
select is(
  (select count(*)::int from public.exercises where catalog_video_url is not null),
  0,
  'nenhum exercício existente ganha vídeo com a estrutura');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
insert into auth.users(id, raw_user_meta_data) values
 ('42000000-0000-0000-0000-000000000001', '{"full_name":"Owner A"}'),
 ('42000000-0000-0000-0000-000000000011', '{"full_name":"Owner B"}');
select pg_temp.act('42000000-0000-0000-0000-000000000001', 'aal2');
insert into public.organizations(id, name) values
 ('42000000-0000-0000-0000-000000000002', 'Org A 0042'),
 ('42000000-0000-0000-0000-000000000012', 'Org B 0042');
insert into public.org_members(org_id, user_id, role) values
 ('42000000-0000-0000-0000-000000000002', '42000000-0000-0000-0000-000000000001', 'owner');
select pg_temp.act('42000000-0000-0000-0000-000000000011', 'aal2');
insert into public.org_members(org_id, user_id, role) values
 ('42000000-0000-0000-0000-000000000012', '42000000-0000-0000-0000-000000000011', 'owner');
select pg_temp.act('42000000-0000-0000-0000-000000000001', 'aal2');
insert into public.exercises
  (id, org_id, name, primary_muscle, equipment, movement_pattern, catalog_video_url)
values
 ('42000000-0000-0000-0000-000000000005', null, 'Global pgTAP 0042', 'chest', 'barbell',
  'horizontal_push', 'https://www.youtube.com/watch?v=AAAAAAAAAAA'),
 ('42000000-0000-0000-0000-000000000006', null, 'Global sem vídeo 0042', 'lats', 'cable',
  'vertical_pull', null);
insert into public.exercises
  (id, org_id, name, primary_muscle, equipment, movement_pattern)
values
 ('42000000-0000-0000-0000-000000000015', '42000000-0000-0000-0000-000000000012',
  'Personalizado da org B', 'quads', 'machine', 'squat');

select throws_ok(
  $$ update public.exercises set catalog_video_url = 'https://www.youtube.com/watch?v=AAAAAAAAAAA'
      where id = '42000000-0000-0000-0000-000000000015' $$,
  '23514', null,
  'vídeo de catálogo só existe em exercício global');

set local role authenticated;
select lives_ok(
  $$ insert into public.exercise_videos(org_id, exercise_id, video_url) values
     ('42000000-0000-0000-0000-000000000002', '42000000-0000-0000-0000-000000000005',
      'https://www.youtube.com/watch?v=BBBBBBBBBBB') $$,
  'a organização escolhe o próprio vídeo para um exercício global');
select is(
  (select created_by from public.exercise_videos
    where exercise_id = '42000000-0000-0000-0000-000000000005'),
  '42000000-0000-0000-0000-000000000001'::uuid,
  'quem escolheu fica registrado');
select throws_ok(
  $$ insert into public.exercise_videos(org_id, exercise_id, video_url) values
     ('42000000-0000-0000-0000-000000000002', '42000000-0000-0000-0000-000000000006',
      'https://youtu.be/BBBBBBBBBBB') $$,
  '23514', null,
  'link fora da forma canônica é recusado');
select throws_ok(
  $$ insert into public.exercise_videos(org_id, exercise_id, video_url) values
     ('42000000-0000-0000-0000-000000000002', '42000000-0000-0000-0000-000000000015',
      'https://www.youtube.com/watch?v=CCCCCCCCCCC') $$,
  '42501', null,
  'não dá para pôr vídeo em exercício personalizado de outra organização');
select throws_ok(
  $$ insert into public.exercise_videos(org_id, exercise_id, video_url) values
     ('42000000-0000-0000-0000-000000000012', '42000000-0000-0000-0000-000000000006',
      'https://www.youtube.com/watch?v=CCCCCCCCCCC') $$,
  '42501', null,
  'nem gravar em nome de uma organização da qual não é membro');

reset role;
insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('42000000-0000-0000-0000-000000000030', '42000000-0000-0000-0000-000000000001',
        'app', 'totp', 'verified', now(), now());
set local role authenticated;
select pg_temp.act('42000000-0000-0000-0000-000000000001', 'aal1');
update public.exercise_videos set video_url = 'https://www.youtube.com/watch?v=DDDDDDDDDDD'
 where exercise_id = '42000000-0000-0000-0000-000000000005';
select pg_temp.act('42000000-0000-0000-0000-000000000001', 'aal2');
select is(
  (select video_url from public.exercise_videos
    where exercise_id = '42000000-0000-0000-0000-000000000005'),
  'https://www.youtube.com/watch?v=BBBBBBBBBBB',
  'sem 2FA satisfeito a escolha não muda');

select pg_temp.act('42000000-0000-0000-0000-000000000011', 'aal2');
select is(
  (select count(*)::int from public.exercise_videos),
  0,
  'outra organização não vê a escolha');
reset role;

-- Pacote do aluno: vídeo da organização > catálogo > nulo (busca no frontend).
select pg_temp.act('42000000-0000-0000-0000-000000000001', 'aal2');
insert into public.subjects(id, org_id, full_name, birth_date, sex) values
 ('42000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000002', 'Aluno 0042', '1990-01-01', 'M');
insert into public.workout_plans
  (id, org_id, subject_id, evaluator_id, name, weeks, status)
values
 ('42000000-0000-0000-0000-000000000010', '42000000-0000-0000-0000-000000000002',
  '42000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000001',
  'Plano 0042', 4, 'active');
insert into public.workout_days (id, org_id, plan_id, label, position) values
 ('42000000-0000-0000-0000-000000000020', '42000000-0000-0000-0000-000000000002',
  '42000000-0000-0000-0000-000000000010', 'A', 0);
insert into public.workout_exercises (id, org_id, day_id, exercise_id, position, sets, reps) values
 ('42000000-0000-0000-0000-000000000021', '42000000-0000-0000-0000-000000000002',
  '42000000-0000-0000-0000-000000000020', '42000000-0000-0000-0000-000000000005', 0, 3, '8-12'),
 ('42000000-0000-0000-0000-000000000022', '42000000-0000-0000-0000-000000000002',
  '42000000-0000-0000-0000-000000000020', '42000000-0000-0000-0000-000000000006', 1, 3, '8-12');

create temporary table _payload as
  select app.workout_plan_payload('42000000-0000-0000-0000-000000000010') as p;

select is(
  (select e ->> 'video_url' from _payload, jsonb_array_elements(p -> 'exercises') e
    where e ->> 'exercise_id' = '42000000-0000-0000-0000-000000000005'),
  'https://www.youtube.com/watch?v=BBBBBBBBBBB',
  'o vídeo escolhido pela organização vence o do catálogo');
select is(
  (select e -> 'video_url' from _payload, jsonb_array_elements(p -> 'exercises') e
    where e ->> 'exercise_id' = '42000000-0000-0000-0000-000000000006'),
  'null'::jsonb,
  'sem vídeo escolhido nem curado, o pacote manda nulo');

delete from public.exercise_videos where org_id = '42000000-0000-0000-0000-000000000002';
select is(
  (select e ->> 'video_url'
     from jsonb_array_elements(app.workout_plan_payload('42000000-0000-0000-0000-000000000010') -> 'exercises') e
    where e ->> 'exercise_id' = '42000000-0000-0000-0000-000000000005'),
  'https://www.youtube.com/watch?v=AAAAAAAAAAA',
  'sem escolha da organização, vale o vídeo do catálogo');

select ok(
  not has_table_privilege('anon', 'public.exercise_videos', 'select'),
  'o aluno anônimo não lê a tabela: recebe o vídeo resolvido no pacote');

select * from finish();
rollback;
