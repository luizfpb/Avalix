-- Somente PostgreSQL/Supabase descartável, com migrations até a 0060.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(8);

select ok(public.app_schema_version() >= '0060', 'schema inclui modelos de treino');
select ok(
  not has_table_privilege('anon', 'public.workout_templates', 'select'),
  'anon não lê workout_templates');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

insert into auth.users(id, raw_user_meta_data) values
 ('60000000-0000-0000-0000-000000000001', '{"full_name":"Owner 0060"}'),
 ('60000000-0000-0000-0000-000000000011', '{"full_name":"Outro 0060"}');

select pg_temp.act('60000000-0000-0000-0000-000000000001', 'aal2');
insert into public.organizations(id, name) values ('60000000-0000-0000-0000-000000000002', 'Org pgTAP 0060');
insert into public.org_members(org_id, user_id, role) values
 ('60000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'owner');

select pg_temp.act('60000000-0000-0000-0000-000000000011', 'aal2');
insert into public.organizations(id, name) values ('60000000-0000-0000-0000-000000000012', 'Outra Org 0060');
insert into public.org_members(org_id, user_id, role) values
 ('60000000-0000-0000-0000-000000000012', '60000000-0000-0000-0000-000000000011', 'owner');

-- 1) Membro cria e lê modelo na própria org
select pg_temp.act('60000000-0000-0000-0000-000000000001', 'aal2');
set local role authenticated;
insert into public.workout_templates (id, org_id, name, goal, weeks, payload)
values (
  '60000000-0000-0000-0000-000000000050',
  '60000000-0000-0000-0000-000000000002',
  'Hipertrofia AB Iniciante',
  'hypertrophy',
  6,
  '{"days":[{"label":"A","name":"Superior","exercises":[]}],"weekly_schedule":["A"],"weeks":[],"overrides":[]}'::jsonb
);
select is(
  (select count(*)::int from public.workout_templates where id = '60000000-0000-0000-0000-000000000050'),
  1,
  'membro cria e enxerga o próprio modelo');

-- 2) Payload inválido (days vazio) é recusado pelo CHECK
select throws_ok(
  $$insert into public.workout_templates (org_id, name, payload)
    values ('60000000-0000-0000-0000-000000000002', 'Vazio', '{"days":[]}'::jsonb)$$,
  '23514',
  null,
  'recusa modelo sem nenhuma divisão');

-- 3) Outra org não enxerga nem consegue excluir
reset role;
select pg_temp.act('60000000-0000-0000-0000-000000000011', 'aal2');
set local role authenticated;
select is(
  (select count(*)::int from public.workout_templates where id = '60000000-0000-0000-0000-000000000050'),
  0,
  'outra organização não enxerga o modelo');

delete from public.workout_templates where id = '60000000-0000-0000-0000-000000000050';
reset role;
select is(
  (select count(*)::int from public.workout_templates where id = '60000000-0000-0000-0000-000000000050'),
  1,
  'outra organização não exclui o modelo');

-- 4) Org em modo só leitura não consegue criar novo modelo
update public.organizations
   set trial_ends_at = now() - interval '1 day',
       subscription_status = 'canceled'
 where id = '60000000-0000-0000-0000-000000000002';

select pg_temp.act('60000000-0000-0000-0000-000000000001', 'aal2');
set local role authenticated;
select throws_ok(
  $$insert into public.workout_templates (org_id, name, payload)
    values ('60000000-0000-0000-0000-000000000002', 'Bloqueado', '{"days":[{"label":"A","exercises":[]}]}'::jsonb)$$,
  null,
  null,
  'modo só leitura bloqueia criação de modelo');

-- 5) Mesmo em só leitura, a própria org ainda pode excluir
delete from public.workout_templates where id = '60000000-0000-0000-0000-000000000050';
select is(
  (select count(*)::int from public.workout_templates where id = '60000000-0000-0000-0000-000000000050'),
  0,
  'membro consegue excluir o próprio modelo');
reset role;

select * from finish();
rollback;
