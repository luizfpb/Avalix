-- Fixtures locais fictícias; nada permanece após o teste.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(17);

select ok(public.app_schema_version() >= '0035', 'schema inclui integridade da sequência');
select is((select count(*)::int from pg_trigger where tgname in
 ('workout_plans_schedule_labels', 'workout_days_schedule_labels') and tgdeferrable and tginitdeferred),
 2, 'ambos os lados são conferidos no fim da transação');

insert into auth.users(id, raw_user_meta_data) values
 ('35000000-0000-0000-0000-000000000001', '{"full_name":"Owner teste"}');
select set_config('request.jwt.claim.sub', '35000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"35000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
insert into public.organizations(id, name) values ('35000000-0000-0000-0000-000000000002', 'Org teste 0035');
insert into public.org_members(org_id, user_id, role) values
 ('35000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects(id, org_id, full_name, birth_date, sex) values
 ('35000000-0000-0000-0000-000000000003', '35000000-0000-0000-0000-000000000002', 'Titular teste', '1990-01-01', 'F');
insert into public.workout_plans(id, subject_id, name, weekly_schedule) values
 ('35000000-0000-0000-0000-000000000004', '35000000-0000-0000-0000-000000000003', 'Plano A', array['A','B','A']),
 ('35000000-0000-0000-0000-000000000005', '35000000-0000-0000-0000-000000000003', 'Outro plano', array['X']);
insert into public.workout_days(id, plan_id, label, position) values
 ('35000000-0000-0000-0000-000000000006', '35000000-0000-0000-0000-000000000004', 'A', 0),
 ('35000000-0000-0000-0000-000000000007', '35000000-0000-0000-0000-000000000004', 'B', 1),
 ('35000000-0000-0000-0000-000000000008', '35000000-0000-0000-0000-000000000005', 'X', 0);
select lives_ok($$set constraints all immediate$$, 'cabeçalho antes das divisões e repetição ABA são válidos');
set constraints all deferred;

-- Executa o bloco e força as constraints ainda dentro da subtransação pgTAP,
-- para cada erro não contaminar as fixtures dos demais cenários.
create function pg_temp.check_schedule(p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  set constraints all immediate;
end;
$$;
select throws_ok($$select pg_temp.check_schedule($q$update public.workout_plans set weekly_schedule = array['Z'] where id = '35000000-0000-0000-0000-000000000004'$q$)$$,
 '23514', 'A sequência semanal contém uma divisão que não existe neste plano.', 'UPDATE do cabeçalho recusa label desconhecida');
select throws_ok($$select pg_temp.check_schedule($q$update public.workout_plans set weekly_schedule = array['X'] where id = '35000000-0000-0000-0000-000000000004'$q$)$$,
 '23514', 'A sequência semanal contém uma divisão que não existe neste plano.', 'divisão de outro plano não satisfaz a referência');
select throws_ok($$select pg_temp.check_schedule($q$update public.workout_plans set weekly_schedule = array[null]::text[] where id = '35000000-0000-0000-0000-000000000004'$q$)$$,
 '23514', 'A sequência semanal contém uma divisão que não existe neste plano.', 'elemento null não vira sessão fantasma');
select throws_ok($$select pg_temp.check_schedule($q$update public.workout_days set label = 'C' where id = '35000000-0000-0000-0000-000000000006'$q$)$$,
 '23514', 'A sequência semanal contém uma divisão que não existe neste plano.', 'renomear divisão sem ajustar sequência é recusado');
select throws_ok($$select pg_temp.check_schedule($q$delete from public.workout_days where id = '35000000-0000-0000-0000-000000000006'$q$)$$,
 '23514', 'A sequência semanal contém uma divisão que não existe neste plano.', 'remover divisão referenciada é recusado');
select throws_ok($$select pg_temp.check_schedule($q$insert into public.workout_plans(subject_id, name, weekly_schedule) values ('35000000-0000-0000-0000-000000000003', 'Sem divisões', array['A'])$q$)$$,
 '23514', 'A sequência semanal contém uma divisão que não existe neste plano.', 'INSERT isolado não deixa referência pendente');
select is((select weekly_schedule from public.workout_plans where id = '35000000-0000-0000-0000-000000000004'),
 array['A','B','A'], 'falhas preservam o cabeçalho original');
select is((select count(*)::int from public.workout_days where plan_id = '35000000-0000-0000-0000-000000000004'),
 2, 'falhas preservam as divisões originais');

select lives_ok($$select pg_temp.check_schedule($q$
 update public.workout_days set label = 'C' where id = '35000000-0000-0000-0000-000000000006';
 update public.workout_plans set weekly_schedule = array['C','B','C'] where id = '35000000-0000-0000-0000-000000000004';
 $q$)$$, 'renomear e atualizar sequência juntos é permitido');
set constraints all deferred;
set local role authenticated;
select lives_ok($$select pg_temp.check_schedule($q$
 select public.replace_workout_plan_children('35000000-0000-0000-0000-000000000004',
 '[{"label":"C","position":0,"exercises":[]},{"label":"B","position":1,"exercises":[]}]', '[]', '[]');
 $q$)$$, 'replace recria divisões referenciadas sem falhar no DELETE intermediário');
set constraints all deferred;
select lives_ok($$select pg_temp.check_schedule($q$
 select public.save_workout_plan('35000000-0000-0000-0000-000000000004', 'Plano editado', 4, 'draft',
 '["D","D"]', null, null, '[{"label":"D","position":0,"exercises":[]}]', '[]', '[]');
 $q$)$$, 'save mantém cabeçalho e novas divisões na mesma transação');
set constraints all deferred;
select lives_ok($$select pg_temp.check_schedule($q$
 select public.create_workout_plan('35000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000003',
 'Criado por RPC', 4, 'draft', '["E"]', null, null, '[{"label":"E","position":0,"exercises":[]}]', '[]', '[]');
 $q$)$$, 'create continua aceitando cabeçalho antes das filhas');
reset role;
set constraints all deferred;
select lives_ok($$select pg_temp.check_schedule($q$
 update public.workout_plans set weekly_schedule = '{}' where id = '35000000-0000-0000-0000-000000000004';
 delete from public.workout_days where plan_id = '35000000-0000-0000-0000-000000000004';
 $q$)$$, 'sequência vazia mantém a semântica anterior e permite remover dias');
set constraints all deferred;
select lives_ok($$select pg_temp.check_schedule($q$
 delete from public.workout_plans where id = '35000000-0000-0000-0000-000000000005';
 $q$)$$, 'cascata ignora o plano que já foi excluído');
select * from finish();
rollback;
