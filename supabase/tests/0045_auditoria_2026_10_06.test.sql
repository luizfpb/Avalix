-- Somente PostgreSQL/Supabase descartável, com migrations até a 0045.
-- Fixtures fictícias e chamadas reais sob anon e authenticated; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(14);

select ok(public.app_schema_version() >= '0045',
  'schema inclui as correções da auditoria de 06/10/2026');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
insert into auth.users(id, raw_user_meta_data) values
 ('45000000-0000-0000-0000-000000000001', '{"full_name":"Owner 0045"}');
select pg_temp.act('45000000-0000-0000-0000-000000000001', 'aal2');
insert into public.organizations(id, name) values ('45000000-0000-0000-0000-000000000002', 'Org pgTAP 0045');
insert into public.org_members(org_id, user_id, role) values
 ('45000000-0000-0000-0000-000000000002', '45000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects(id, org_id, full_name, birth_date, sex) values
 ('45000000-0000-0000-0000-000000000003', '45000000-0000-0000-0000-000000000002',
  'Aluna 0045', '1990-01-01', 'F');
insert into public.exercises (id, org_id, name, primary_muscle, equipment, movement_pattern) values
 ('45000000-0000-0000-0000-000000000005', '45000000-0000-0000-0000-000000000002',
  'Supino pgTAP 0045', 'chest', 'barbell', 'horizontal_push');
insert into public.workout_plans (id, org_id, subject_id, evaluator_id, name, weeks, status) values
 ('45000000-0000-0000-0000-000000000010', '45000000-0000-0000-0000-000000000002',
  '45000000-0000-0000-0000-000000000003', '45000000-0000-0000-0000-000000000001',
  'Plano 0045', 4, 'active');
insert into public.workout_links (subject_id, created_by, token_hash, expires_at)
values ('45000000-0000-0000-0000-000000000003', '45000000-0000-0000-0000-000000000001',
        encode(sha256(convert_to(repeat('w', 43), 'UTF8')), 'hex'), now() + interval '30 days');

create temporary table _series (de_40 jsonb, de_99 jsonb, de_45 jsonb);
insert into _series values (
  '[{"exercise_id":"45000000-0000-0000-0000-000000000005","set_number":1,"weight_kg":40,"reps":10}]',
  '[{"exercise_id":"45000000-0000-0000-0000-000000000005","set_number":1,"weight_kg":99,"reps":9}]',
  '[{"exercise_id":"45000000-0000-0000-0000-000000000005","set_number":1,"weight_kg":45,"reps":8}]');
grant select on _series to anon, authenticated;

-- =====================================================================
-- A01: o link do aluno não toma a sessão do profissional
-- =====================================================================
set local role authenticated;
select public.create_workout_log(
  '45000000-0000-0000-0000-000000000010', (select de_40 from _series),
  p_notes => 'Registrado pelo profissional',
  p_client_ref => '45000000-0000-0000-0000-0000000000a1');
reset role;

select pg_temp.act(null, 'aal1');
set local role anon;
create temporary table _pacote as select public.get_workout_for_link(repeat('w', 43)) p;
reset role;
select is(
  (select jsonb_array_length(p->'plan_week_log') from _pacote), 1,
  'o pacote do aluno traz a sessão do profissional na contagem da semana');
select ok(
  (select p->'plan_week_log'->0 ? 'client_ref' from _pacote)
  and (select p->'plan_week_log'->0->>'client_ref' from _pacote) is null,
  'a referência da sessão do profissional não sai no pacote (a chave continua, nula)');

set local role anon;
select throws_ok(
  $$ select public.submit_workout_session(repeat('w', 43),
       '45000000-0000-0000-0000-0000000000a1', (select de_99 from _series),
       p_notes => 'Alterado pelo link', p_plan => '45000000-0000-0000-0000-000000000010',
       p_client_revision => 1) $$,
  'registro de treino indisponivel',
  'o envio público recusa a referência de uma sessão do profissional');
select throws_ok(
  $$ select public.submit_workout_session(repeat('w', 43),
       '45000000-0000-0000-0000-0000000000a1', (select de_99 from _series),
       p_plan => '45000000-0000-0000-0000-000000000010', p_client_revision => 9) $$,
  'registro de treino indisponivel',
  'nem com uma revisão maior');
reset role;

select is(
  (select s.weight_kg from public.workout_log_sets s
     join public.workout_logs l on l.id = s.log_id
    where l.client_ref = '45000000-0000-0000-0000-0000000000a1'),
  40::numeric, 'as séries do profissional continuam as dele');
select is(
  (select notes || ' · ' || source from public.workout_logs
    where client_ref = '45000000-0000-0000-0000-0000000000a1'),
  'Registrado pelo profissional · trainer', 'a observação e a autoria também');

-- Controle: a sessão do próprio aluno segue idempotente pela referência.
set local role anon;
select lives_ok(
  $$ select public.submit_workout_session(repeat('w', 43),
       '45000000-0000-0000-0000-0000000000b1', (select de_45 from _series),
       p_plan => '45000000-0000-0000-0000-000000000010', p_client_revision => 1) $$,
  'o aluno registra a própria sessão');
select lives_ok(
  $$ select public.submit_workout_session(repeat('w', 43),
       '45000000-0000-0000-0000-0000000000b1', (select de_99 from _series),
       p_plan => '45000000-0000-0000-0000-000000000010', p_client_revision => 2) $$,
  'e reenvia a mesma sessão com uma revisão nova');
create temporary table _pacote2 as select public.get_workout_for_link(repeat('w', 43)) p;
reset role;
select is(
  (select count(*)::int from public.workout_logs
    where client_ref = '45000000-0000-0000-0000-0000000000b1'),
  1, 'o reenvio atualiza a mesma sessão, sem duplicar');
select ok(
  (select bool_or(x->>'client_ref' = '45000000-0000-0000-0000-0000000000b1')
     from _pacote2, jsonb_array_elements(p->'plan_week_log') x),
  'a referência da sessão do aluno continua no pacote, para a tela não contar duas vezes');

-- =====================================================================
-- A10: a data da anamnese aceita é a civil de São Paulo
-- =====================================================================
-- O convite é emitido pelo profissional.
select pg_temp.act('45000000-0000-0000-0000-000000000001', 'aal2');
insert into public.anamnese_intakes (id, org_id, subject_id, token_hash, spec_version, expires_at)
values ('45000000-0000-0000-0000-000000000020', '45000000-0000-0000-0000-000000000002',
        '45000000-0000-0000-0000-000000000003',
        encode(sha256(convert_to(repeat('k', 43), 'UTF8')), 'hex'), '1.3', now() + interval '1 day');
create temporary table _env (payload jsonb, versao text, hash text);
insert into _env values (
  '{"parq": {"cardio_dx": false, "dor_toracica": false, "tontura_sincope": false,
     "condicao_cronica": false, "medicacao_cronica": false, "lesao_atividade": false,
     "supervisao_medica": false},
    "ativo_regular": false, "doenca_cmr": [], "doenca_cmr_confirmada": true,
    "sinais_sintomas": [], "sinais_sintomas_confirmados": true, "red_flags": [],
    "gestante": null, "declaracao_veracidade": true, "consentimento_lgpd": true}'::jsonb,
  app.canonical_consent_version(),
  encode(sha256(convert_to(app.canonical_consent_text('Org pgTAP 0045'), 'UTF8')), 'hex'));
grant select on _env to anon, authenticated;

set local role anon;
select lives_ok(
  $$ select public.submit_anamnese_intake(repeat('k', 43), payload, 'titular',
       'Aluna 0045', versao, hash, 'pgTAP 0045') from _env $$,
  'a aluna envia a anamnese pelo link');
reset role;

-- O envio foi às 22h30 de 05/10 em São Paulo, 01h30 de 06/10 em UTC; a
-- sessão do banco está em UTC, como no Supabase. O horário do envio é do
-- servidor (now()), então a fixture o move com a guarda de estado desligada.
alter table public.anamnese_intakes disable trigger anamnese_intakes_integrity_guard;
update public.anamnese_intakes set submitted_at = '2026-10-05 22:30:00-03'
 where id = '45000000-0000-0000-0000-000000000020';
alter table public.anamnese_intakes enable trigger anamnese_intakes_integrity_guard;
set local timezone = 'UTC';
create temporary table _gate as
  select g.* from _env, app.compute_anamnese_gate(_env.payload) g;
grant select on _gate to authenticated;

select pg_temp.act('45000000-0000-0000-0000-000000000001', 'aal2');
set local role authenticated;
select lives_ok(
  $$ select * from public.accept_anamnese_intake('45000000-0000-0000-0000-000000000020',
       (select liberado from _gate), (select nivel from _gate), (select flag from _gate)) $$,
  'o profissional aceita a anamnese');
reset role;

select is(
  (select a.assessed_at from public.anamneses a
     join public.anamnese_intakes i on i.resulting_anamnese_id = a.id
    where i.id = '45000000-0000-0000-0000-000000000020'),
  date '2026-10-05',
  'a anamnese aceita fica com a data da coleta em São Paulo, não a do dia seguinte em UTC');

select * from finish();
rollback;
