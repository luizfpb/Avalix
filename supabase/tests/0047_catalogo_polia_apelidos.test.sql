-- Somente PostgreSQL/Supabase descartável, com migrations até a 0047.
-- Fixtures fictícias; rollback ao fim. Reaplicar a 0047 sem duplicar nada é
-- conferido fora daqui (a migration abre e fecha a própria transação).
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(12);

select ok(public.app_schema_version() >= '0047', 'schema inclui o catálogo com polia e apelidos');
select has_column('public', 'exercises', 'aliases', 'exercício ganha a lista de apelidos');
select col_not_null('public', 'exercises', 'aliases', 'a lista de apelidos nunca é nula');

select is(
  (select count(*)::int from public.exercises where org_id is null and name ~* '\mcabo\M'),
  0,
  'nenhum exercício do catálogo global diz "cabo"');

select is(
  (select aliases from public.exercises where org_id is null and name = 'Remada baixa na polia (triângulo)'),
  array['Remada baixa no cabo (triângulo)', 'remada sentada', 'remada baixa'],
  'o nome antigo vira apelido e os apelidos da academia vêm depois');

select ok(
  exists (select 1 from public.exercises where org_id is null and name = 'Voador (peck deck)'
          and 'Crucifixo na máquina (peck deck)' = any(aliases)),
  'peck deck vira Voador e continua achável pelo nome antigo');

select is(
  (select aliases from public.exercises where org_id is null and name = 'Pallof press (antirrotação)'),
  '{}'::text[],
  'correção só de acento não cria apelido');

select is(
  (select count(*)::int from public.exercises where org_id is null and equipment = 'ankle_weight'),
  7,
  'a linha de caneleira entra no catálogo');

select ok(
  exists (select 1 from public.exercises where org_id is null and name = 'Tríceps testa na polia'),
  'exercício que faltava entra no catálogo');

select is(
  (select count(*)::int from (
     select name from public.exercises where org_id is null group by name having count(*) > 1) d),
  0,
  'nenhum nome repetido no catálogo global');

-- restrições
select throws_ok(
  $$ update public.exercises set aliases = array['a','a'] where org_id is null and name = 'Voador (peck deck)' $$,
  '23514', null, 'apelido repetido é recusado');
select throws_ok(
  $$ update public.exercises set equipment = 'esteira' where org_id is null and name = 'Voador (peck deck)' $$,
  '23514', null, 'equipamento fora da lista continua recusado');

select * from finish();
rollback;
