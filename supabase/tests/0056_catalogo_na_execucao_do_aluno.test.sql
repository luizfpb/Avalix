-- Somente PostgreSQL/Supabase descartável, com migrations até a 0056.
-- Fixtures fictícias e chamadas reais sob anon; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(6);

select ok(public.app_schema_version() >= '0056',
  'schema inclui o catálogo no pacote do aluno');
select ok(
  has_function_privilege('anon', 'public.get_workout_for_link(text)', 'execute'),
  'o pacote segue aberto ao link depois de recriado');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
insert into auth.users(id, raw_user_meta_data) values
 ('56000000-0000-0000-0000-000000000001', '{"full_name":"Owner 0056"}'),
 ('56000000-0000-0000-0000-000000000011', '{"full_name":"Outra 0056"}');
select pg_temp.act('56000000-0000-0000-0000-000000000001', 'aal2');
insert into public.organizations(id, name) values ('56000000-0000-0000-0000-000000000002', 'Org pgTAP 0056');
insert into public.org_members(org_id, user_id, role) values
 ('56000000-0000-0000-0000-000000000002', '56000000-0000-0000-0000-000000000001', 'owner');
select pg_temp.act('56000000-0000-0000-0000-000000000011', 'aal2');
insert into public.organizations(id, name) values ('56000000-0000-0000-0000-000000000012', 'Outra org 0056');
insert into public.org_members(org_id, user_id, role) values
 ('56000000-0000-0000-0000-000000000012', '56000000-0000-0000-0000-000000000011', 'owner');
select pg_temp.act('56000000-0000-0000-0000-000000000001', 'aal2');
insert into public.subjects(id, org_id, full_name, birth_date, sex) values
 ('56000000-0000-0000-0000-000000000003', '56000000-0000-0000-0000-000000000002', 'Aluna 0056', '1990-01-01', 'F');
insert into public.exercises (id, org_id, name, primary_muscle, equipment, movement_pattern, aliases) values
 ('56000000-0000-0000-0000-000000000005', '56000000-0000-0000-0000-000000000002',
  'Rosca pgTAP 0056', 'biceps', 'barbell', 'isolation', array['rosca com barra 0056']),
 ('56000000-0000-0000-0000-000000000015', '56000000-0000-0000-0000-000000000012',
  'Exercício de outra org 0056', 'chest', 'barbell', 'horizontal_push', '{}');
insert into public.workout_links (subject_id, created_by, token_hash, expires_at)
values ('56000000-0000-0000-0000-000000000003', '56000000-0000-0000-0000-000000000001',
        encode(sha256(convert_to(repeat('e', 43), 'UTF8')), 'hex'), now() + interval '30 days');

set local role anon;
create temporary table _pacote as select public.get_workout_for_link(repeat('e', 43)) as v;
reset role;

select ok(
  (select v->'catalog' @> '[{"id":"56000000-0000-0000-0000-000000000005","name":"Rosca pgTAP 0056","primary_muscle":"biceps","aliases":["rosca com barra 0056"]}]'::jsonb
     from _pacote),
  'o catálogo traz o exercício próprio da org, com músculo e apelidos');
select ok(
  not exists (select 1 from _pacote, jsonb_array_elements(v->'catalog') e
               where e->>'id' = '56000000-0000-0000-0000-000000000015'),
  'o exercício de outra org não vaza para o link');
select is(
  (select jsonb_array_length(v->'catalog') from _pacote),
  (select count(*)::int from public.exercises
    where org_id is null or org_id = '56000000-0000-0000-0000-000000000002'),
  'o catálogo inteiro que a org enxerga, global incluído');
select ok(
  (select v->'catalog' is not null and v->'plan' = 'null'::jsonb from _pacote),
  'sem plano ativo o catálogo vem do mesmo jeito');

select * from finish();
