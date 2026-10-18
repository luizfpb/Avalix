-- Somente PostgreSQL/Supabase descartável, com migrations até a 0049.
-- Fixtures fictícias e chamadas reais sob authenticated e service_role; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(48);

select ok(public.app_schema_version() >= '0049', 'schema inclui a assinatura');
select ok((select count(*) from public.plans
             where id in ('ate30', 'ilimitado') and monthly_price_brl > 0 and yearly_price_brl > 0) = 2,
  'Até 30 e Ilimitado com preço mensal e anual');
select is((select max_subjects from public.plans where id = 'ate30'), 30, 'o plano Até 30 limita a 30');
select ok((select max_subjects is null from public.plans where id = 'ilimitado'), 'o Ilimitado não tem limite');

-- grants
select ok(
  not has_function_privilege('authenticated', 'public.billing_apply_event(text,text,uuid,text,text,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.billing_apply_event(text,text,uuid,text,text,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.billing_apply_event(text,text,uuid,text,text,jsonb)', 'execute'),
  'só a service role aplica evento do webhook');
select ok(
  not has_function_privilege('authenticated', 'public.billing_change_plan(uuid,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.billing_checkout_started(uuid,text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.billing_mark_canceled(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.billing_snapshot(uuid)', 'execute'),
  'o profissional não mexe na assinatura direto pelo banco');
select ok(
  has_function_privilege('authenticated', 'public.get_org_billing(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.get_org_billing(uuid)', 'execute'),
  'o membro lê o estado da assinatura; anon não');
select ok(
  not has_table_privilege('authenticated', 'public.billing_events', 'select')
  and not has_table_privilege('anon', 'public.billing_events', 'select'),
  'eventos do webhook ficam fora do alcance do app');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', case when p_user is null then '' else json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text end, true);
$$;
grant execute on function pg_temp.act(uuid, text) to authenticated, service_role;

insert into auth.users(id, raw_user_meta_data) values
 ('49000000-0000-0000-0000-000000000001', '{"full_name":"Owner 0049"}'),
 ('49000000-0000-0000-0000-000000000002', '{"full_name":"Membro 0049"}');

-- organização nova pela RPC: teste grátis de 14 dias
select pg_temp.act('49000000-0000-0000-0000-000000000001', 'aal1');
set local role authenticated;
create temp table if not exists t_org(id uuid);
grant all on t_org to authenticated, service_role;
insert into t_org select public.create_organization('Org pgTAP 0049');
reset role;

select is((select status from public.org_subscriptions where org_id = (select id from t_org)), 'trial',
  'organização nova nasce em teste grátis');
select ok((select trial_ends_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour'
             from public.org_subscriptions where org_id = (select id from t_org)),
  'o teste dura 14 dias');
select is(app.org_access((select id from t_org)), 'full', 'em teste, acesso completo');

-- segunda organização do mesmo usuário: sem teste novo
set local role authenticated;
create temp table if not exists t_org2(id uuid);
grant all on t_org2 to authenticated;
insert into t_org2 select public.create_organization('Segunda org 0049');
reset role;
select is(app.org_access((select id from t_org2)), 'blocked', 'a segunda organização não ganha outro teste');

-- regra de acesso no tempo (p_now)
update public.org_subscriptions
   set status = 'active', current_period_end = '2026-11-01 03:00+00'
 where org_id = (select id from t_org2);
select is(app.org_access((select id from t_org2), '2026-10-31 12:00+00'), 'full', 'pago: completo até o vencimento');
select is(app.org_access((select id from t_org2), '2026-11-03 12:00+00'), 'grace', 'depois do vencimento: carência');
select is(app.org_access((select id from t_org2), '2026-11-06 04:00+00'), 'blocked', 'passados 5 dias: bloqueado');
update public.org_subscriptions set status = 'past_due' where org_id = (select id from t_org2);
select is(app.org_access((select id from t_org2), '2026-10-31 12:00+00'), 'grace', 'em atraso dentro do período: aviso');
update public.org_subscriptions set status = 'canceled' where org_id = (select id from t_org2);
select is(app.org_access((select id from t_org2), '2026-10-31 12:00+00'), 'full', 'cancelado: usa até o fim do período pago');
select is(app.org_access((select id from t_org2), '2026-11-02 12:00+00'), 'blocked', 'cancelado não tem carência');
update public.org_subscriptions set status = 'courtesy' where org_id = (select id from t_org2);
select is(app.org_access((select id from t_org2), '2030-01-01'), 'full', 'cortesia não vence');

-- bloqueado: só leitura
update public.org_subscriptions
   set status = 'trial', trial_ends_at = now() - interval '1 day'
 where org_id = (select id from t_org);
select pg_temp.act('49000000-0000-0000-0000-000000000001', 'aal1');
set local role authenticated;
select throws_ok(
  $$insert into public.subjects(org_id, full_name, birth_date, sex)
    values ((select id from t_org), 'Bloqueado', '1990-01-01', 'F')$$,
  'P0001', 'Sua assinatura do Avalix não está ativa. Seus dados continuam disponíveis para consulta e exportação; para criar ou editar, assine em Ajustes > Plano e cobrança.',
  'teste vencido: não cria avaliado');
reset role;
-- fixture criada sem usuário (service/manutenção não passa pela trava)
select pg_temp.act(null, null);
insert into public.subjects(id, org_id, evaluator_id, full_name, birth_date, sex, is_active)
values ('49000000-0000-0000-0000-000000000010', (select id from t_org),
        '49000000-0000-0000-0000-000000000001', 'Aluna 0049', '1990-01-01', 'F', true),
       ('49000000-0000-0000-0000-000000000011', (select id from t_org),
        '49000000-0000-0000-0000-000000000001', 'Inativa 0049', '1990-01-01', 'F', false);
select ok(exists(select 1 from public.subjects where id = '49000000-0000-0000-0000-000000000010'),
  'manutenção sem usuário cria mesmo bloqueado');
select pg_temp.act('49000000-0000-0000-0000-000000000001', 'aal1');
set local role authenticated;
select lives_ok(
  $$update public.subjects set full_name = 'Aluna 0049 corrigida' where id = '49000000-0000-0000-0000-000000000010'$$,
  'bloqueado ainda corrige o cadastro (retificação)');
select throws_ok(
  $$update public.subjects set is_active = true where id = '49000000-0000-0000-0000-000000000011'$$,
  'P0001', null, 'bloqueado não reativa avaliado');
select lives_ok(
  $$update public.subjects set is_active = false where id = '49000000-0000-0000-0000-000000000010'$$,
  'bloqueado ainda inativa avaliado');
select is((public.get_org_billing((select id from t_org)) ->> 'access'), 'blocked', 'o app recebe o estado bloqueado');
select is((public.get_org_billing((select id from t_org)) ->> 'can_manage')::boolean, true, 'o dono pode assinar');
reset role;

-- limite do plano Até 30
update public.org_subscriptions
   set status = 'active', plan_id = 'ate30', current_period_end = now() + interval '20 days'
 where org_id = (select id from t_org);
select pg_temp.act('49000000-0000-0000-0000-000000000001', 'aal1');
set local role authenticated;
select lives_ok(
  $$insert into public.subjects(org_id, full_name, birth_date, sex)
    select (select id from t_org), 'Aluno ' || g, '1990-01-01', 'M' from generate_series(1, 30) g$$,
  'cria até 30 ativos');
select throws_ok(
  $$insert into public.subjects(org_id, full_name, birth_date, sex)
    values ((select id from t_org), 'Aluno 31', '1990-01-01', 'M')$$,
  'P0001', 'Seu plano permite até 30 avaliados ativos. Inative um cadastro ou mude para o plano Ilimitado em Ajustes > Plano e cobrança.',
  'o 31º ativo é recusado');
select lives_ok(
  $$insert into public.subjects(org_id, full_name, birth_date, sex, is_active)
    values ((select id from t_org), 'Inativo extra', '1990-01-01', 'M', false)$$,
  'cadastro inativo não ocupa vaga');
select throws_ok(
  $$update public.subjects set is_active = true where id = '49000000-0000-0000-0000-000000000011'$$,
  'P0001', null, 'reativar acima do limite é recusado');
reset role;
select pg_temp.act(null, null);
set local role service_role;
-- sem usuário a trava não vale: a fixture passa a ter 31 ativos
update public.subjects set is_active = true where id = '49000000-0000-0000-0000-000000000011';
update public.org_subscriptions
   set plan_id = 'ilimitado', asaas_subscription_id = 'sub_antiga'
 where org_id = (select id from t_org);
select throws_ok(
  $$select public.billing_change_plan((select id from t_org), 'ate30', 'yearly')$$,
  'P0001', 'Você tem 31 avaliados ativos e o plano escolhido permite 30. Inative cadastros antes de trocar.',
  'não desce para o Até 30 com mais de 30 ativos');
select is(public.billing_change_plan((select id from t_org), 'ilimitado', 'yearly') ->> 'billing_cycle', null,
  'troca de ciclo devolve o ciclo anterior para desfazer');
update public.org_subscriptions set asaas_subscription_id = null where org_id = (select id from t_org);
reset role;

-- webhook: checkout pago vira assinatura ativa
select pg_temp.act(null, null);
set local role service_role;
update public.org_subscriptions
   set status = 'trial', plan_id = 'ilimitado', trial_ends_at = now() + interval '3 days', current_period_end = null
 where org_id = (select id from t_org);
select public.billing_checkout_started((select id from t_org), 'chk_0049', 'ilimitado', 'monthly');
select is(public.billing_find_org(null, 'chk_0049', null), (select id from t_org), 'acha a organização pelo checkout');
select is(public.billing_find_org('sub_x', null, (select id::text from t_org)), (select id from t_org),
  'ou pela referência externa');
select is(
  public.billing_apply_event('evt_1', 'PAYMENT_CREATED', (select id from t_org), 'sub_0049', 'monthly',
    '{"id":"pay_1","status":"PENDING","billingType":"PIX","dueDate":"2026-10-17","invoiceUrl":"https://sandbox.asaas.com/i/pay_1","customer":"cus_1"}') ->> 'outcome',
  'fatura', 'Pix pendente guarda a fatura');
select is((select status from public.org_subscriptions where org_id = (select id from t_org)), 'trial',
  'fatura aberta não ativa a assinatura');
select is(
  public.billing_apply_event('evt_2', 'PAYMENT_CONFIRMED', (select id from t_org), 'sub_0049', 'monthly',
    '{"id":"pay_1","status":"CONFIRMED","billingType":"PIX","dueDate":"2026-10-17"}') ->> 'outcome',
  'pago', 'pagamento confirmado');
select row_eq(
  $$select status, plan_id, billing_cycle, current_period_end, pending_invoice_url, asaas_customer_id
      from public.org_subscriptions where org_id = (select id from t_org)$$,
  row('active'::text, 'ilimitado'::text, 'monthly'::text, '2026-11-17 03:00+00'::timestamptz, null::text, 'cus_1'::text),
  'ativa até o próximo vencimento, meia-noite de São Paulo, sem fatura pendente');
select is(
  public.billing_apply_event('evt_2', 'PAYMENT_CONFIRMED', (select id from t_org), 'sub_0049', 'monthly',
    '{"id":"pay_1","status":"CONFIRMED","billingType":"PIX","dueDate":"2026-10-17"}') ->> 'outcome',
  'duplicate', 'o mesmo evento duas vezes não muda nada');
select is(
  public.billing_apply_event('evt_3', 'PAYMENT_RECEIVED', (select id from t_org), 'sub_0049', 'monthly',
    '{"id":"pay_1","status":"RECEIVED","billingType":"PIX","dueDate":"2026-10-17"}') ->> 'outcome',
  'pago', 'recebido depois do confirmado');
select is((select current_period_end from public.org_subscriptions where org_id = (select id from t_org)),
  '2026-11-17 03:00+00'::timestamptz, 'confirmado e recebido da mesma cobrança não somam dois meses');
select is(
  public.billing_apply_event('evt_4', 'PAYMENT_OVERDUE', (select id from t_org), 'sub_0049', 'monthly',
    '{"id":"pay_2","status":"OVERDUE","billingType":"PIX","dueDate":"2026-11-17","invoiceUrl":"https://sandbox.asaas.com/i/pay_2"}') ->> 'outcome',
  'vencido', 'cobrança vencida');
select row_eq(
  $$select status, pending_invoice_url from public.org_subscriptions where org_id = (select id from t_org)$$,
  row('past_due'::text, 'https://sandbox.asaas.com/i/pay_2'::text),
  'em atraso, com o link da fatura para o app mostrar');
select is(
  public.billing_apply_event('evt_5', 'PAYMENT_CREATED', (select id from t_org), 'sub_outra', 'monthly',
    '{"id":"pay_9","status":"PENDING","billingType":"PIX","dueDate":"2026-11-20"}') ->> 'outcome',
  'outra_assinatura', 'evento de outra assinatura não pago é ignorado');
select is(
  public.billing_apply_event('evt_6', 'PAYMENT_REFUNDED', (select id from t_org), 'sub_0049', 'monthly',
    '{"id":"pay_1","status":"REFUNDED","billingType":"PIX","dueDate":"2026-10-17"}') ->> 'outcome',
  'estornado', 'estorno');
select is((select current_period_end from public.org_subscriptions where org_id = (select id from t_org)),
  '2026-10-17 03:00+00'::timestamptz, 'estorno devolve o período daquela cobrança');
select is(
  public.billing_apply_event('evt_7', 'SUBSCRIPTION_DELETED', (select id from t_org), 'sub_0049', null, null) ->> 'outcome',
  'cancelado', 'assinatura removida no Asaas');
select is((select status from public.org_subscriptions where org_id = (select id from t_org)), 'canceled',
  'fica cancelada');
reset role;

select * from finish();
rollback;
