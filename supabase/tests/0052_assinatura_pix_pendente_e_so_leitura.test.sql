-- Somente PostgreSQL/Supabase descartável, com migrations até a 0052.
-- Fixtures fictícias e chamadas reais sob authenticated e service_role; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(30);

select ok(public.app_schema_version() >= '0052', 'schema inclui o Pix pendente e o só leitura completo');
select ok(
  not has_function_privilege('authenticated', 'public.billing_discard_pending(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.billing_discard_pending(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.billing_discard_pending(uuid)', 'execute'),
  'só a service role descarta o Pix pendente');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', case when p_user is null then '' else json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text end, true);
$$;
grant execute on function pg_temp.act(uuid, text) to authenticated, service_role;

insert into auth.users(id, raw_user_meta_data) values
 ('52000000-0000-0000-0000-000000000001', '{"full_name":"Owner 0052"}');

select pg_temp.act('52000000-0000-0000-0000-000000000001', 'aal1');
set local role authenticated;
create temp table if not exists t_org(id uuid);
grant all on t_org to authenticated, service_role;
insert into t_org select public.create_organization('Org pgTAP 0052');
reset role;

-- =====================================================================
-- Pix gerado no teste e não pago
-- =====================================================================
select pg_temp.act(null, null);
set local role service_role;
select public.billing_checkout_started((select id from t_org), 'pix:sub_p1', 'ate100', 'yearly');
select is(
  public.billing_apply_event('e52_1', 'PAYMENT_CREATED', (select id from t_org), 'sub_p1', 'yearly',
    '{"id":"pay_p1","status":"PENDING","billingType":"PIX","dueDate":"2026-10-21","invoiceUrl":"https://sandbox.asaas.com/i/pay_p1"}') ->> 'outcome',
  'fatura', 'o primeiro Pix do teste guarda a fatura');
reset role;

select pg_temp.act('52000000-0000-0000-0000-000000000001', 'aal1');
set local role authenticated;
select is((public.get_org_billing((select id from t_org)) ->> 'has_subscription')::boolean, false,
  'Pix não pago não é assinatura em vigor (antes travava a tela em "Trocar plano")');
select is(public.get_org_billing((select id from t_org)) ->> 'pending_plan_id', 'ate100',
  'o app sabe para qual plano é o Pix pendente');
select is(public.get_org_billing((select id from t_org)) ->> 'pending_cycle', 'yearly',
  'e o ciclo');
select is(public.get_org_billing((select id from t_org)) ->> 'status', 'trial', 'segue em teste');
reset role;

-- segundo Pix (a Edge Function remove o primeiro no Asaas antes de criar)
select pg_temp.act(null, null);
set local role service_role;
select public.billing_checkout_started((select id from t_org), 'pix:sub_p2', 'ate30', 'monthly');
select is(
  public.billing_apply_event('e52_2', 'PAYMENT_CREATED', (select id from t_org), 'sub_p2', 'monthly',
    '{"id":"pay_p2","status":"PENDING","billingType":"PIX","dueDate":"2026-10-21","invoiceUrl":"https://sandbox.asaas.com/i/pay_p2"}'),
  '{"outcome":"fatura","replaced_subscription_id":"sub_p1"}'::jsonb,
  'o segundo Pix do teste é adotado (antes: outra_assinatura, e a fatura nunca aparecia)');
select row_eq(
  $$select asaas_subscription_id, pending_invoice_url, checkout_plan_id
      from public.org_subscriptions where org_id = (select id from t_org)$$,
  row('sub_p2'::text, 'https://sandbox.asaas.com/i/pay_p2'::text, 'ate30'::text),
  'a tela mostra a fatura e o plano do Pix novo');

-- aviso atrasado do Pix removido não volta a grudar na organização
select is(
  public.billing_apply_event('e52_3', 'SUBSCRIPTION_DELETED', (select id from t_org), 'sub_p1', null, null) ->> 'outcome',
  'outra_assinatura', 'remoção de assinatura que a organização não usa é ignorada');
select is(
  public.billing_apply_event('e52_4', 'PAYMENT_DELETED', (select id from t_org), 'sub_p1', null,
    '{"id":"pay_p1","status":"DELETED","billingType":"PIX","dueDate":"2026-10-21"}') ->> 'outcome',
  'outra_assinatura', 'fatura removida da assinatura antiga também');
select row_eq(
  $$select asaas_subscription_id, pending_invoice_url from public.org_subscriptions where org_id = (select id from t_org)$$,
  row('sub_p2'::text, 'https://sandbox.asaas.com/i/pay_p2'::text),
  'o Pix em aberto continua o novo');

-- desistir do Pix
select lives_ok($$select public.billing_discard_pending((select id from t_org))$$, 'descarta o Pix pendente');
select row_eq(
  $$select status, pending_invoice_url, checkout_plan_id, asaas_checkout_id
      from public.org_subscriptions where org_id = (select id from t_org)$$,
  row('trial'::text, null::text, null::text, null::text),
  'sem fatura e sem plano pendente; o teste continua');
select ok((select trial_ends_at > now() + interval '13 days' from public.org_subscriptions
            where org_id = (select id from t_org)), 'o prazo do teste não muda');
select is(
  public.billing_apply_event('e52_5', 'SUBSCRIPTION_DELETED', (select id from t_org), 'sub_p2', null, null) ->> 'outcome',
  'cancelado', 'o aviso da remoção no Asaas chega');
select row_eq(
  $$select status, canceled_at from public.org_subscriptions where org_id = (select id from t_org)$$,
  row('trial'::text, null::timestamptz),
  'remover um Pix não pago não marca o teste como cancelado');

-- pago depois de desistir de outro: vira assinatura
select is(
  public.billing_apply_event('e52_6', 'PAYMENT_CONFIRMED', (select id from t_org), 'sub_p3', 'monthly',
    '{"id":"pay_p3","status":"CONFIRMED","billingType":"CREDIT_CARD","dueDate":"2026-10-21"}') ->> 'outcome',
  'pago', 'cartão pago depois vira a assinatura');
select throws_ok($$select public.billing_discard_pending((select id from t_org))$$,
  'P0001', 'Não há Pix pendente para descartar.', 'assinatura em vigor não sai por descarte');
reset role;

select pg_temp.act('52000000-0000-0000-0000-000000000001', 'aal1');
set local role authenticated;
select is((public.get_org_billing((select id from t_org)) ->> 'has_subscription')::boolean, true,
  'assinatura paga é assinatura em vigor');
select is(public.get_org_billing((select id from t_org)) ->> 'pending_plan_id', null,
  'sem Pix pendente');
reset role;

-- com assinatura em vigor, Pix novo não pago continua ignorado
select pg_temp.act(null, null);
set local role service_role;
select is(
  public.billing_apply_event('e52_7', 'PAYMENT_CREATED', (select id from t_org), 'sub_p4', 'monthly',
    '{"id":"pay_p4","status":"PENDING","billingType":"PIX","dueDate":"2026-10-25"}') ->> 'outcome',
  'outra_assinatura', 'outra assinatura não paga não toma o lugar da que está em vigor');
reset role;

-- =====================================================================
-- Só leitura completo
-- =====================================================================
select ok(
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where t.tgname in ('posture_photos_b9_billing', 'posture_annotations_b9_billing',
                       'workout_logs_b9_billing', 'exercises_b9_billing', 'exercise_videos_b9_billing')
      and not t.tgisinternal) = 5,
  'fotos, marcações, sessões, exercícios e vídeos passam pela trava');

-- fixtures sem usuário (manutenção não passa pela trava)
select pg_temp.act(null, null);
insert into public.subjects(id, org_id, evaluator_id, full_name, birth_date, sex)
values ('52000000-0000-0000-0000-000000000010', (select id from t_org),
        '52000000-0000-0000-0000-000000000001', 'Aluna 0052', '1990-01-01', 'F');
insert into public.appointments(id, org_id, subject_id, evaluator_id, starts_at)
values ('52000000-0000-0000-0000-000000000020', (select id from t_org),
        '52000000-0000-0000-0000-000000000010', '52000000-0000-0000-0000-000000000001', now() + interval '1 day');
insert into public.exercises(id, org_id, name, primary_muscle, equipment, movement_pattern)
values ('52000000-0000-0000-0000-000000000030', (select id from t_org), 'Exercício 0052', 'chest', 'machine', 'horizontal_push');

update public.org_subscriptions
   set status = 'trial', trial_ends_at = now() - interval '1 day', current_period_end = null
 where org_id = (select id from t_org);

select pg_temp.act('52000000-0000-0000-0000-000000000001', 'aal1');
set local role authenticated;
select throws_ok(
  $$insert into public.exercises(org_id, name, primary_muscle, equipment, movement_pattern)
    values ((select id from t_org), 'Novo 0052', 'chest', 'machine', 'horizontal_push')$$,
  'P0001', null, 'bloqueado não cria exercício personalizado');
select throws_ok(
  $$update public.exercises set name = 'Renomeado' where id = '52000000-0000-0000-0000-000000000030'$$,
  'P0001', null, 'nem edita');
select throws_ok(
  $$update public.appointments set title = 'Outro' where id = '52000000-0000-0000-0000-000000000020'$$,
  'P0001', null, 'bloqueado não edita agendamento');
select lives_ok(
  $$delete from public.appointments where id = '52000000-0000-0000-0000-000000000020'$$,
  'excluir agendamento continua liberado');
select lives_ok(
  $$delete from public.exercises where id = '52000000-0000-0000-0000-000000000030'$$,
  'excluir exercício continua liberado');
select lives_ok(
  $$update public.subjects set full_name = 'Aluna 0052 corrigida' where id = '52000000-0000-0000-0000-000000000010'$$,
  'corrigir o cadastro continua liberado');
reset role;

-- limite do plano fala em mudar de plano
update public.org_subscriptions
   set status = 'active', plan_id = 'ate30', current_period_end = now() + interval '20 days'
 where org_id = (select id from t_org);
select pg_temp.act(null, null);
insert into public.subjects(org_id, evaluator_id, full_name, birth_date, sex)
select (select id from t_org), '52000000-0000-0000-0000-000000000001', 'Aluno ' || g, '1990-01-01', 'M'
  from generate_series(1, 29) g;
select pg_temp.act('52000000-0000-0000-0000-000000000001', 'aal1');
set local role authenticated;
select throws_ok(
  $$insert into public.subjects(org_id, full_name, birth_date, sex)
    values ((select id from t_org), 'Aluno 31', '1990-01-01', 'M')$$,
  'P0001', 'Seu plano permite até 30 avaliados ativos. Inative um cadastro ou mude de plano em Ajustes > Plano e cobrança.',
  'acima do limite, a mensagem manda mudar de plano (são três)');
reset role;

select * from finish();
rollback;
