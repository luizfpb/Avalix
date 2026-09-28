-- Somente PostgreSQL/Supabase descartável, com migrations até a 0040.
-- Fixtures fictícias; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(10);

select ok(public.app_schema_version() >= '0040',
  'schema inclui os músculos principais adicionais');
select has_column('public', 'exercises', 'additional_primary_muscles',
  'exercício ganha a lista de outros músculos principais');
select col_not_null('public', 'exercises', 'additional_primary_muscles',
  'a lista nunca é nula');
select is(
  (select count(*)::int from public.exercises where cardinality(additional_primary_muscles) > 0),
  0,
  'nenhum exercício existente muda: todos começam sem principal adicional');

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
insert into auth.users(id, raw_user_meta_data) values
 ('40000000-0000-0000-0000-000000000001', '{"full_name":"Owner teste"}');
insert into public.organizations(id, name) values
 ('40000000-0000-0000-0000-000000000002', 'Org teste 0040');

create function pg_temp.exercicio(p_primary text, p_additional text[], p_secondary text[] default '{}')
returns void language sql as $$
  insert into public.exercises
    (org_id, name, primary_muscle, additional_primary_muscles, secondary_muscles, equipment, movement_pattern)
  values ('40000000-0000-0000-0000-000000000002', 'Exercício pgTAP 0040',
          p_primary, p_additional, p_secondary, 'barbell', 'squat');
$$;

select lives_ok(
  $$ select pg_temp.exercicio('quads', array['glutes'], array['hamstrings']) $$,
  'agachamento com quadríceps e glúteos como principais');
select lives_ok(
  $$ select pg_temp.exercicio('chest', array['triceps', 'front_delts']) $$,
  'até três principais no total');
select throws_ok(
  $$ select pg_temp.exercicio('chest', array['triceps', 'front_delts', 'lats']) $$,
  '23514', null,
  'mais de três principais é recusado');
select throws_ok(
  $$ select pg_temp.exercicio('quads', array['quads']) $$,
  '23514', null,
  'o principal não se repete na lista de adicionais');
select throws_ok(
  $$ select pg_temp.exercicio('quads', array['glutes'], array['glutes']) $$,
  '23514', null,
  'um músculo não é principal e secundário ao mesmo tempo');
select throws_ok(
  $$ select pg_temp.exercicio('quads', array['glutes', 'glutes']) $$,
  '23514', null,
  'sem repetição dentro da lista');

select * from finish();
rollback;
