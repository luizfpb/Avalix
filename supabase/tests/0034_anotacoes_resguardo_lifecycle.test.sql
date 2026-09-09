-- Somente Supabase/PostgreSQL descartável. Todas as fixtures são desfeitas.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(21);

select ok(public.app_schema_version() >= '0034', 'schema inclui o ciclo de vida do resguardo');
select ok((select relrowsecurity from pg_class where oid = 'public.posture_annotations_shadowed'::regclass),
  'resguardo tem RLS habilitada');
select ok(not has_table_privilege('anon', 'public.posture_annotations_shadowed', 'SELECT')
  and not has_table_privilege('authenticated', 'public.posture_annotations_shadowed', 'SELECT'),
  'clientes continuam sem acesso direto ao resguardo');
select is((select count(*)::int from pg_constraint
  where conrelid = 'public.posture_annotations_shadowed'::regclass and contype = 'f' and confdeltype = 'c'),
  2, 'foto e organização possuem cascata de eliminação');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
insert into auth.users(id, raw_user_meta_data) values
 ('34000000-0000-0000-0000-000000000001', '{"full_name":"Owner teste"}'),
 ('34000000-0000-0000-0000-000000000099', '{"full_name":"Outra conta"}');
select pg_temp.act('34000000-0000-0000-0000-000000000001', 'aal2');
insert into public.organizations(id, name) values ('34000000-0000-0000-0000-000000000002', 'Org teste 0034');
insert into public.org_members(org_id, user_id, role) values
 ('34000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects(id, org_id, full_name, birth_date, sex) values
 ('34000000-0000-0000-0000-000000000003', '34000000-0000-0000-0000-000000000002', 'Titular A', '1990-01-01', 'F'),
 ('34000000-0000-0000-0000-000000000004', '34000000-0000-0000-0000-000000000002', 'Titular B', '1990-01-01', 'M');
insert into public.posture_sessions(id, org_id, subject_id) values
 ('34000000-0000-0000-0000-000000000005', '34000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000003'),
 ('34000000-0000-0000-0000-000000000006', '34000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000004');
insert into public.posture_photos(id, session_id, category) values
 ('34000000-0000-0000-0000-000000000007', '34000000-0000-0000-0000-000000000005', 'frente'),
 ('34000000-0000-0000-0000-000000000008', '34000000-0000-0000-0000-000000000005', 'costas'),
 ('34000000-0000-0000-0000-000000000009', '34000000-0000-0000-0000-000000000006', 'frente');
insert into public.posture_annotations_shadowed(id, org_id, photo_id, payload, created_at) values
 ('34000000-0000-0000-0000-000000000010', '34000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000007', '{"version":1,"shapes":[{"id":"a","type":"point","x":0.3,"y":0.7}]}', now()),
 ('34000000-0000-0000-0000-000000000011', '34000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000008', '{"version":1,"shapes":[]}', now()),
 ('34000000-0000-0000-0000-000000000012', '34000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000009', '{"version":1,"shapes":[]}', now());
create temporary table _export_0034 as
 select public.export_subject_data('34000000-0000-0000-0000-000000000003') as document;
select is((select jsonb_array_length(document->'posture_annotations_shadowed') from _export_0034),
  2, 'exportação inclui as folhas preservadas do titular');
select is((select document->'posture_annotations_shadowed'->0->'payload' from _export_0034),
  '{"version":1,"shapes":[{"id":"a","type":"point","x":0.3,"y":0.7}]}'::jsonb,
  'payload preservado sai sem alteração');
select ok(not exists (select 1 from _export_0034,
  jsonb_array_elements(document->'posture_annotations_shadowed') item
  where item->>'id' = '34000000-0000-0000-0000-000000000012'), 'não inclui anotações de outro titular');
select is((select count(*)::int from public.audit_logs where action = 'SUBJECT_EXPORT'
  and row_id = '34000000-0000-0000-0000-000000000003'), 1, 'exportação mantém um único evento transacional');

set local role anon;
select throws_ok($$select public.export_subject_data('34000000-0000-0000-0000-000000000003')$$,
 '42501', 'permission denied for function export_subject_data', 'anon não executa a exportação');
reset role;
set local role authenticated;
select throws_ok($$select * from public.posture_annotations_shadowed$$,
 '42501', 'permission denied for table posture_annotations_shadowed', 'autenticado não lê a tabela diretamente');
reset role;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('34000000-0000-0000-0000-000000000020', '34000000-0000-0000-0000-000000000001', 'teste', 'totp', 'verified', now(), now());
select pg_temp.act('34000000-0000-0000-0000-000000000001', 'aal1');
select throws_ok($$select public.export_subject_data('34000000-0000-0000-0000-000000000003')$$,
 'P0001', 'nao autenticado ou MFA pendente', 'MFA pendente continua bloqueando exportação');
select pg_temp.act(null, 'aal1');
select throws_ok($$select public.export_subject_data('34000000-0000-0000-0000-000000000003')$$,
 'P0001', 'nao autenticado ou MFA pendente', 'sem identidade não há exportação');
select pg_temp.act('34000000-0000-0000-0000-000000000099', 'aal2');
select throws_ok($$select public.export_subject_data('34000000-0000-0000-0000-000000000003')$$,
 'P0001', 'avaliado inexistente ou sem acesso', 'outra conta não exporta o resguardo');
select pg_temp.act('34000000-0000-0000-0000-000000000001', 'aal2');

select lives_ok($$delete from public.posture_photos where id = '34000000-0000-0000-0000-000000000008'$$,
 'foto sem objetos pode ser excluída');
select is((select count(*)::int from public.posture_annotations_shadowed where id = '34000000-0000-0000-0000-000000000011'),
 0, 'excluir a foto também exclui sua folha preservada');
select lives_ok($$select public.finalize_subject_deletion('34000000-0000-0000-0000-000000000003')$$,
 'RPC de exclusão definitiva continua concluindo');
select is((select count(*)::int from public.subjects where id = '34000000-0000-0000-0000-000000000003'), 0, 'titular foi excluído');
select is((select count(*)::int from public.posture_annotations_shadowed where id = '34000000-0000-0000-0000-000000000010'),
 0, 'exclusão definitiva elimina o resguardo do titular');
select is((select count(*)::int from public.posture_annotations_shadowed where id = '34000000-0000-0000-0000-000000000012'),
 1, 'resguardo de outro titular permanece intacto');
select lives_ok($$delete from public.organizations where id = '34000000-0000-0000-0000-000000000002'$$,
 'exclusão da organização com Storage vazio continua concluindo');
select is((select count(*)::int from public.posture_annotations_shadowed where org_id = '34000000-0000-0000-0000-000000000002'),
 0, 'organização excluída não deixa resguardo órfão');
select * from finish();
rollback;
