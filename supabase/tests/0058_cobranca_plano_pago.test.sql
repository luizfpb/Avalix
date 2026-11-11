-- Somente PostgreSQL/Supabase descartável, com migrations até a 0058.
-- Fixtures fictícias e chamadas reais sob authenticated e service_role; rollback ao fim.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(37);

select ok(public.app_schema_version() >= '0058', 'schema inclui a 0058');

-- grants: tudo novo é só da service role
select ok(
  not has_table_privilege('authenticated', 'public.billing_checkouts', 'select')
  and not has_table_privilege('anon', 'public.billing_checkouts', 'select')
  and not has_table_privilege('authenticated', 'public.billing_pending_cancellations', 'select')
  and not has_table_privilege('authenticated', 'public.billing_locks', 'select'),
  'checkouts, fila de cancelamento e travas ficam fora do alcance do app');
select ok(
  not has_function_privilege('authenticated', 'public.billing_try_lock(uuid,integer)', 'execute')
  and not has_function_privilege('anon', 'public.billing_try_lock(uuid,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.billing_unlock(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.billing_cancellations_due(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.billing_cancellation_done(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.billing_cancellation_failed(text,text)', 'execute'),
  'o profissional não chama as funções novas');
select ok(
  has_function_privilege('service_role', 'public.billing_try_lock(uuid,integer)', 'execute')
  and has_function_privilege('service_role', 'public.billing_unlock(uuid,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.billing_cancellations_due(integer)', 'execute')
  and has_function_privilege('service_role', 'public.billing_cancellation_done(text)', 'execute')
  and has_function_privilege('service_role', 'public.billing_cancellation_failed(text,text)', 'execute'),
  'a service role chama');

create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  select set_config('request.jwt.claims', case when p_user is null then '' else json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text end, true);
$$;
grant execute on function pg_temp.act(uuid, text) to authenticated, service_role;

create temp table t_org(k text primary key, id uuid);
grant all on t_org to authenticated, service_role;

-- uma organização (e um dono) por cenário
do $$
declare
  k text;
  n int := 0;
  u uuid;
begin
  foreach k in array array['a','b','c','d','e','f','g'] loop
    n := n + 1;
    u := ('58000000-0000-0000-0000-00000000000' || n)::uuid;
    insert into auth.users(id, raw_user_meta_data) values (u, jsonb_build_object('full_name', 'Owner 0058 ' || k));
    perform set_config('request.jwt.claim.sub', u::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    insert into t_org values (k, public.create_organization('Org pgTAP 0058 ' || k));
  end loop;
end $$;

select pg_temp.act(null, null);
set local role service_role;

create function pg_temp.org(p text) returns uuid language sql as $$ select id from t_org where k = p $$;
create function pg_temp.plan(p text) returns text language sql as $$
  select plan_id from public.org_subscriptions where org_id = pg_temp.org(p) $$;
create function pg_temp.paid(p_value numeric, p_checkout text, p_id text, p_due text default '2026-11-11')
returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_id, 'status', 'RECEIVED', 'billingType', 'CREDIT_CARD', 'dueDate', p_due,
    'value', p_value, 'checkout_id', p_checkout))
$$;
grant execute on function pg_temp.org(text), pg_temp.plan(text), pg_temp.paid(numeric, text, text, text)
  to service_role;

-- =====================================================================
-- A: dois checkouts abertos, paga o mais barato
-- =====================================================================
select public.billing_checkout_started(pg_temp.org('a'), 'chk_a30', 'ate30', 'monthly');
select public.billing_checkout_started(pg_temp.org('a'), 'chk_ailim', 'ilimitado', 'monthly');
select is(
  (select count(*)::int from public.billing_checkouts where org_id = pg_temp.org('a')), 2,
  'cada checkout aberto fica registrado com o próprio plano');
select is(
  (select value_brl from public.billing_checkouts where id = 'chk_ailim'), 100.00::numeric,
  'com o valor do plano no ciclo, tirado da tabela plans');
select is(
  public.billing_apply_event('e58_a1', 'PAYMENT_RECEIVED', pg_temp.org('a'), 'sub_a', 'monthly',
    pg_temp.paid(19.90, 'chk_a30', 'pay_a1')) ->> 'outcome',
  'pago', 'pagamento do checkout do Até 30');
select is(pg_temp.plan('a'), 'ate30',
  'libera o plano do checkout pago, não o do último aberto (antes: Ilimitado por R$ 19,90)');
select is(
  (select count(*)::int from public.billing_checkouts where org_id = pg_temp.org('a')), 0,
  'os checkouts da organização são consumidos no primeiro pagamento');

-- renovação depois de trocar de plano não volta ao plano do checkout
select public.billing_change_plan(pg_temp.org('a'), 'ilimitado', 'monthly');
select is(
  public.billing_apply_event('e58_a2', 'PAYMENT_RECEIVED', pg_temp.org('a'), 'sub_a', 'monthly',
    pg_temp.paid(100.00, 'chk_a30', 'pay_a2', '2026-12-11')) ->> 'outcome',
  'pago', 'renovação');
select is(pg_temp.plan('a'), 'ilimitado', 'renovação mantém o plano trocado');
select ok(
  (select current_period_end from public.org_subscriptions where org_id = pg_temp.org('a'))
    = ('2027-01-11'::timestamp at time zone 'America/Sao_Paulo'),
  'e estica o período até o vencimento seguinte');

-- =====================================================================
-- B: pagou menos do que o checkout pede
-- =====================================================================
select public.billing_checkout_started(pg_temp.org('b'), 'chk_b', 'ilimitado', 'monthly');
select is(
  public.billing_apply_event('e58_b1', 'PAYMENT_RECEIVED', pg_temp.org('b'), 'sub_b', 'monthly',
    pg_temp.paid(19.90, 'chk_b', 'pay_b1')) ->> 'outcome',
  'pago_valor_divergente', 'valor abaixo do checkout fica registrado como divergente');
select is(pg_temp.plan('b'), 'ate30', 'e libera só o plano que o valor pago cobre');

-- =====================================================================
-- C: assinatura sem checkout conhecido
-- =====================================================================
select is(
  public.billing_apply_event('e58_c1', 'PAYMENT_RECEIVED', pg_temp.org('c'), 'sub_c', 'monthly',
    pg_temp.paid(39.90, 'chk_desconhecido', 'pay_c1')) ->> 'outcome',
  'pago_valor_divergente', 'checkout desconhecido');
select is(pg_temp.plan('c'), 'ate100', 'o plano sai do valor pago (39,90 = Até 100)');
select is(
  public.billing_apply_event('e58_c2', 'PAYMENT_RECEIVED', pg_temp.org('c'), 'sub_c2', 'monthly',
    pg_temp.paid(5.00, null, 'pay_c2')) ->> 'outcome',
  'pago_valor_divergente', 'valor menor que qualquer plano');
select is(pg_temp.plan('c'), 'ate30', 'cai no plano mais barato');

-- =====================================================================
-- D e E: checkout aberto antes da 0058 (sem linha em billing_checkouts)
-- =====================================================================
select public.billing_checkout_started(pg_temp.org('d'), 'chk_d', 'ate100', 'yearly');
delete from public.billing_checkouts where id = 'chk_d';
select is(
  public.billing_apply_event('e58_d1', 'PAYMENT_RECEIVED', pg_temp.org('d'), 'sub_d', 'yearly',
    pg_temp.paid(319.00, 'chk_d', 'pay_d1')) ->> 'outcome',
  'pago', 'checkout antigo pago: reconhecido pelo id guardado na assinatura');
select is(pg_temp.plan('d'), 'ate100', 'e libera o plano dele');

select public.billing_checkout_started(pg_temp.org('e'), 'chk_e', 'ilimitado', 'monthly');
delete from public.billing_checkouts where id = 'chk_e';
select is(
  public.billing_apply_event('e58_e1', 'PAYMENT_RECEIVED', pg_temp.org('e'), 'sub_e', 'monthly',
    '{"id":"pay_e1","status":"RECEIVED","billingType":"CREDIT_CARD","dueDate":"2026-11-11"}') ->> 'outcome',
  'pago', 'Edge Function anterior (sem valor no evento) segue funcionando');
select is(pg_temp.plan('e'), 'ilimitado', 'com a regra antiga, até a function nova ser publicada');

-- =====================================================================
-- F: Pix do Até 30 e depois checkout de cartão do Ilimitado; paga o Pix
-- =====================================================================
select public.billing_checkout_started(pg_temp.org('f'), 'pix:sub_f', 'ate30', 'monthly');
select public.billing_apply_event('e58_f1', 'PAYMENT_CREATED', pg_temp.org('f'), 'sub_f', 'monthly',
  '{"id":"pay_f1","status":"PENDING","billingType":"PIX","dueDate":"2026-11-11","invoiceUrl":"https://sandbox.asaas.com/i/pay_f1"}');
select public.billing_checkout_started(pg_temp.org('f'), 'chk_f', 'ilimitado', 'monthly');
select is(
  public.billing_apply_event('e58_f2', 'PAYMENT_RECEIVED', pg_temp.org('f'), 'sub_f', 'monthly',
    '{"id":"pay_f1","status":"RECEIVED","billingType":"PIX","dueDate":"2026-11-11","value":19.9}') ->> 'outcome',
  'pago', 'Pix pago');
select is(pg_temp.plan('f'), 'ate30', 'o Pix é reconhecido pela assinatura (pix:<id>) e libera o Até 30');

-- =====================================================================
-- G: assinatura substituída vai para a fila de cancelamento
-- =====================================================================
select public.billing_checkout_started(pg_temp.org('g'), 'chk_g1', 'ate30', 'monthly');
select public.billing_apply_event('e58_g1', 'PAYMENT_RECEIVED', pg_temp.org('g'), 'sub_g1', 'monthly',
  pg_temp.paid(19.90, 'chk_g1', 'pay_g1'));
select public.billing_checkout_started(pg_temp.org('g'), 'chk_g2', 'ilimitado', 'monthly');
select is(
  public.billing_apply_event('e58_g2', 'PAYMENT_RECEIVED', pg_temp.org('g'), 'sub_g2', 'monthly',
    pg_temp.paid(100.00, 'chk_g2', 'pay_g2')),
  '{"outcome":"pago","replaced_subscription_id":"sub_g1"}'::jsonb,
  'o retorno continua o mesmo da 0052');
select ok(
  exists (select 1 from public.billing_pending_cancellations where subscription_id = 'sub_g1'),
  'a assinatura substituída entra na fila, mesmo que o webhook caia depois do commit');
select ok('sub_g1' in (select subscription_id from public.billing_cancellations_due(50)),
  'e aparece como pendente');

select public.billing_cancellation_failed('sub_g1', 'Asaas fora do ar');
select is(
  (select attempts from public.billing_pending_cancellations where subscription_id = 'sub_g1'), 1,
  'falha conta tentativa');
select ok('sub_g1' not in (select subscription_id from public.billing_cancellations_due(50)),
  'e adia a próxima');

update public.billing_pending_cancellations set next_attempt_at = now() - interval '1 second'
 where subscription_id = 'sub_g1';
select public.billing_cancellation_done('sub_g1');
select ok(not exists (select 1 from public.billing_pending_cancellations where subscription_id = 'sub_g1'),
  'cancelada no Asaas: sai da fila');

insert into public.billing_pending_cancellations (subscription_id, org_id) values ('sub_g2', pg_temp.org('g'));
select ok('sub_g2' not in (select subscription_id from public.billing_cancellations_due(50)),
  'a assinatura em uso nunca é cancelada pela fila');
select ok(not exists (select 1 from public.billing_pending_cancellations where subscription_id = 'sub_g2'),
  'e sai da fila');

-- =====================================================================
-- Trava por organização
-- =====================================================================
create temp table t_lock(token uuid);
grant all on t_lock to service_role;
insert into t_lock select public.billing_try_lock(pg_temp.org('g'), 120);
select ok((select token from t_lock) is not null, 'primeiro pedido pega a trava');
select ok(public.billing_try_lock(pg_temp.org('g'), 120) is null, 'segundo pedido simultâneo é recusado');
select public.billing_unlock(pg_temp.org('g'), gen_random_uuid());
select ok(public.billing_try_lock(pg_temp.org('g'), 120) is null, 'token errado não solta a trava');
select public.billing_unlock(pg_temp.org('g'), (select token from t_lock));
select ok(public.billing_try_lock(pg_temp.org('g'), 120) is not null, 'quem pegou solta');
update public.billing_locks set locked_until = now() - interval '1 second' where org_id = pg_temp.org('g');
select ok(public.billing_try_lock(pg_temp.org('g'), 120) is not null,
  'trava vencida (function que morreu no meio) não prende a organização');
reset role;

select * from finish();
rollback;
