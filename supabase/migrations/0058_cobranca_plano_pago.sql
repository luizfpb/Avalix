-- 0058 — cobrança: plano pago = plano liberado, cancelamento com retentativa
-- e trava por organização (AUDITORIA.md, achados 1, 4 e 5).
-- Aplicar depois da 0057 e ANTES de publicar as Edge Functions novas.
-- Não apaga nem altera dado clínico.
--
-- 1. Plano pago = plano liberado. Cada checkout novo sobrescrevia o plano
--    pendente (checkout_plan_id) sem invalidar o link anterior, e o pagamento
--    liberava esse plano pendente sem olhar qual link foi pago nem o valor:
--    abrir o checkout do Até 30, abrir o do Ilimitado e pagar o primeiro
--    deixava a organização no Ilimitado pagando R$ 19,90 por mês. Agora cada
--    checkout (cartão ou Pix) vira uma linha em billing_checkouts com plano,
--    ciclo e valor, e o PRIMEIRO pagamento de uma assinatura libera o plano
--    do checkout de onde ela nasceu (checkoutSession do Asaas, ou
--    pix:<assinatura>), desde que o valor pago cubra o do checkout. Sem
--    checkout conhecido, ou com valor menor, o plano sai do valor pago: o
--    maior plano que ele cobre ('pago_valor_divergente' em billing_events).
--    Renovação não mexe no plano (a troca de plano já gravou o novo).
--    O id do checkout e o valor chegam dentro de p_payment (checkout_id,
--    value): a assinatura da função não muda, e a Edge Function anterior, que
--    não manda o valor, segue com a regra antiga até a nova ser publicada.
-- 2. Cancelamento com retentativa. Quando uma assinatura nova substitui
--    outra, a antiga entra em billing_pending_cancellations na MESMA
--    transação do evento. A Edge Function cancela no Asaas e tira da fila; se
--    o Asaas falhar, a fila guarda e o próximo webhook tenta de novo (antes
--    o erro só ia para o log e o cliente seguia com duas cobranças). A
--    assinatura em uso por alguma organização nunca é cancelada pela fila.
-- 3. Trava por organização. billing_try_lock/billing_unlock: um pedido de
--    assinar, trocar ou cancelar por organização de cada vez (duas abas ou
--    clique duplo deixavam banco e Asaas divergentes). A trava vence sozinha
--    (padrão 120 s) se a function morrer no meio.
begin;

-- =====================================================================
-- 1. CHECKOUTS
-- =====================================================================
create table public.billing_checkouts (
  id             text primary key check (char_length(id) between 1 and 200),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  plan_id        text not null references public.plans(id),
  billing_cycle  text not null check (billing_cycle in ('monthly', 'yearly')),
  value_brl      numeric(10,2) not null check (value_brl > 0),
  created_at     timestamptz not null default now()
);
create index billing_checkouts_org_idx on public.billing_checkouts (org_id, created_at desc);
alter table public.billing_checkouts enable row level security;
revoke all on public.billing_checkouts from anon, authenticated;
grant select, insert, update, delete on public.billing_checkouts to service_role;
-- sem policy: só service_role (que ignora RLS) lê e escreve.

create or replace function app.plan_price(p_plan text, p_cycle text)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select case p_cycle when 'yearly' then p.yearly_price_brl else p.monthly_price_brl end
    from public.plans p
   where p.id = p_plan;
$$;

-- O maior plano que o valor pago cobre no ciclo; abaixo de todos, o mais barato.
create or replace function app.billing_plan_for_value(p_value numeric, p_cycle text)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.id from public.plans p
      where app.plan_price(p.id, p_cycle) > 0
        and app.plan_price(p.id, p_cycle) <= p_value + 0.009
      order by app.plan_price(p.id, p_cycle) desc, p.sort_order desc
      limit 1),
    (select p.id from public.plans p
      where app.plan_price(p.id, p_cycle) > 0
      order by app.plan_price(p.id, p_cycle), p.sort_order
      limit 1)
  );
$$;

create or replace function app.numeric_or_null(p text)
returns numeric
language plpgsql immutable set search_path = ''
as $$
begin
  if p is null or p !~ '^\d{1,8}(\.\d{1,4})?$' then
    return null;
  end if;
  return p::numeric;
end;
$$;

revoke execute on function app.plan_price(text, text) from public, anon, authenticated;
revoke execute on function app.billing_plan_for_value(numeric, text) from public, anon, authenticated;
revoke execute on function app.numeric_or_null(text) from public, anon, authenticated;

-- Mesma assinatura da 0049; passa a registrar o checkout com o valor do plano.
create or replace function public.billing_checkout_started(
  p_org uuid, p_checkout_id text, p_plan text, p_cycle text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_value numeric;
begin
  if not exists (select 1 from public.plans p where p.id = p_plan and p.monthly_price_brl is not null) then
    raise exception 'plano inválido';
  end if;
  v_value := app.plan_price(p_plan, p_cycle);
  if v_value is null or v_value <= 0 then
    raise exception 'plano inválido';
  end if;
  update public.org_subscriptions
     set asaas_checkout_id = p_checkout_id,
         checkout_plan_id = p_plan,
         checkout_cycle = p_cycle,
         checkout_created_at = now()
   where org_id = p_org;
  if not found then
    raise exception 'organização sem registro de assinatura';
  end if;
  insert into public.billing_checkouts (id, org_id, plan_id, billing_cycle, value_brl)
  values (p_checkout_id, p_org, p_plan, p_cycle, v_value)
  on conflict (id) do nothing;
end;
$$;

-- =====================================================================
-- 2. FILA DE CANCELAMENTO
-- =====================================================================
create table public.billing_pending_cancellations (
  subscription_id  text primary key check (char_length(subscription_id) between 1 and 200),
  org_id           uuid references public.organizations(id) on delete set null,
  attempts         int not null default 0,
  last_error       text check (last_error is null or char_length(last_error) <= 500),
  next_attempt_at  timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
alter table public.billing_pending_cancellations enable row level security;
revoke all on public.billing_pending_cancellations from anon, authenticated;
grant select, insert, update, delete on public.billing_pending_cancellations to service_role;

-- Pendentes vencidos, já sem nenhuma assinatura em uso (essas saem da fila).
create or replace function public.billing_cancellations_due(p_limit int default 10)
returns table (subscription_id text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  delete from public.billing_pending_cancellations q
   where exists (select 1 from public.org_subscriptions s
                  where s.asaas_subscription_id = q.subscription_id);
  return query
    select q.subscription_id
      from public.billing_pending_cancellations q
     where q.next_attempt_at <= now()
     order by q.created_at, q.subscription_id
     limit greatest(1, least(coalesce(p_limit, 10), 50));
end;
$$;

create or replace function public.billing_cancellation_done(p_subscription_id text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.billing_pending_cancellations where subscription_id = p_subscription_id;
$$;

-- Espera dobrando a cada falha: 1, 2, 4... minutos, até 6 horas.
create or replace function public.billing_cancellation_failed(p_subscription_id text, p_error text)
returns void
language sql security definer set search_path = ''
as $$
  update public.billing_pending_cancellations
     set attempts = attempts + 1,
         last_error = left(p_error, 500),
         next_attempt_at = now() + least(interval '1 minute' * power(2, least(attempts, 20)),
                                         interval '6 hours')
   where subscription_id = p_subscription_id;
$$;

-- =====================================================================
-- 3. TRAVA POR ORGANIZAÇÃO
-- =====================================================================
create table public.billing_locks (
  org_id        uuid primary key references public.organizations(id) on delete cascade,
  token         uuid not null,
  locked_until  timestamptz not null
);
alter table public.billing_locks enable row level security;
revoke all on public.billing_locks from anon, authenticated;
grant select, insert, update, delete on public.billing_locks to service_role;

-- Devolve o token da trava, ou null se outro pedido da organização a segura.
create or replace function public.billing_try_lock(p_org uuid, p_seconds int default 120)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_got uuid;
begin
  insert into public.billing_locks as l (org_id, token, locked_until)
  values (p_org, gen_random_uuid(),
          now() + make_interval(secs => greatest(5, least(coalesce(p_seconds, 120), 600))))
  on conflict (org_id) do update
     set token = excluded.token, locked_until = excluded.locked_until
   where l.locked_until <= now()
  returning l.token into v_got;
  return v_got;
end;
$$;

create or replace function public.billing_unlock(p_org uuid, p_token uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.billing_locks where org_id = p_org and token = p_token;
$$;

-- =====================================================================
-- 4. WEBHOOK
-- =====================================================================
create or replace function public.billing_apply_event(
  p_event_id text,
  p_event text,
  p_org uuid,
  p_subscription_id text,
  p_cycle text default null,
  p_payment jsonb default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_s           public.org_subscriptions;
  v_payment_id  text := p_payment ->> 'id';
  v_due         date := app.date_or_null(p_payment ->> 'dueDate');
  v_invoice     text := p_payment ->> 'invoiceUrl';
  v_type        text := p_payment ->> 'billingType';
  v_value       numeric := app.numeric_or_null(p_payment ->> 'value');
  v_checkout_id text := nullif(p_payment ->> 'checkout_id', '');
  v_cycle       text;
  v_end         timestamptz;
  v_replaced    text;
  v_outcome     text;
  v_first       boolean;
  v_plan        text;
  v_co_plan     text;
  v_co_cycle    text;
  v_co_value    numeric;
  v_divergent   boolean := false;
  v_paid        boolean := p_event in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED');
  v_adoptable   boolean := p_event in ('PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_OVERDUE',
                                       'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED');
begin
  if p_cycle is not null and p_cycle not in ('monthly', 'yearly') then
    raise exception 'ciclo inválido: %', p_cycle;
  end if;
  if v_invoice is not null and v_invoice !~ '^https://' then
    v_invoice := null;
  end if;

  insert into public.billing_events (id, event, org_id, subscription_id, payment_id)
  values (p_event_id, p_event, p_org, p_subscription_id, v_payment_id)
  on conflict (id) do nothing;
  if not found then
    return jsonb_build_object('outcome', 'duplicate');
  end if;

  if p_org is null then
    update public.billing_events set outcome = 'sem_org' where id = p_event_id;
    return jsonb_build_object('outcome', 'sem_org');
  end if;

  select * into v_s from public.org_subscriptions s where s.org_id = p_org for update;
  if not found then
    update public.billing_events set outcome = 'sem_org' where id = p_event_id;
    return jsonb_build_object('outcome', 'sem_org');
  end if;

  -- primeiro pagamento desta assinatura: é só nele que o plano é decidido
  v_first := v_s.status not in ('active', 'past_due')
             or v_s.asaas_subscription_id is distinct from p_subscription_id;

  -- Assinatura que a organização ainda não conhece. Só eventos que criam ou
  -- cobram a adotam; com outra em vigor, só o pagamento (troca por checkout
  -- novo, ou checkout antigo pago tardiamente).
  if v_s.asaas_subscription_id is distinct from p_subscription_id then
    if p_subscription_id is null then
      update public.billing_events set outcome = 'sem_assinatura' where id = p_event_id;
      return jsonb_build_object('outcome', 'sem_assinatura');
    end if;
    if not v_adoptable
       or (v_s.asaas_subscription_id is not null and v_s.status in ('active', 'past_due') and not v_paid) then
      update public.billing_events set outcome = 'outra_assinatura' where id = p_event_id;
      return jsonb_build_object('outcome', 'outra_assinatura');
    end if;
    -- a anterior (em vigor ou Pix pendente do teste) sai no Asaas, pela fila
    if v_s.status <> 'canceled' then
      v_replaced := v_s.asaas_subscription_id;
    end if;
    if v_replaced is not null then
      insert into public.billing_pending_cancellations (subscription_id, org_id)
      values (v_replaced, p_org)
      on conflict (subscription_id) do nothing;
    end if;
    update public.org_subscriptions
       set asaas_subscription_id = p_subscription_id,
           asaas_customer_id = coalesce(p_payment ->> 'customer', asaas_customer_id),
           billing_cycle = coalesce(p_cycle, checkout_cycle, billing_cycle),
           -- assinatura nova sem pagamento ainda: não herda o estado da antiga
           pending_payment_id = null, pending_invoice_url = null, pending_due_date = null
     where org_id = p_org
     returning * into v_s;
  end if;

  v_cycle := coalesce(p_cycle, v_s.billing_cycle, v_s.checkout_cycle, 'monthly');

  if v_paid then
    if v_due is null then
      raise exception 'pagamento sem vencimento';
    end if;

    if v_first then
      -- o checkout de onde esta assinatura nasceu
      select c.plan_id, c.billing_cycle, c.value_brl
        into v_co_plan, v_co_cycle, v_co_value
        from public.billing_checkouts c
       where c.org_id = p_org
         and (c.id = v_checkout_id or c.id = 'pix:' || p_subscription_id)
       order by case when c.id = v_checkout_id then 0 else 1 end
       limit 1;
      -- checkout aberto antes da 0058: só vale se for o guardado na assinatura
      if v_co_plan is null and v_s.checkout_plan_id is not null
         and v_s.asaas_checkout_id in (v_checkout_id, 'pix:' || p_subscription_id) then
        v_co_plan := v_s.checkout_plan_id;
        v_co_cycle := coalesce(v_s.checkout_cycle, v_cycle);
        v_co_value := app.plan_price(v_co_plan, v_co_cycle);
      end if;
      v_cycle := coalesce(p_cycle, v_co_cycle, v_cycle);

      if v_value is null then
        -- Edge Function anterior à 0058 não manda o valor: regra antiga
        v_plan := coalesce(v_co_plan, v_s.checkout_plan_id, v_s.plan_id);
      elsif v_co_plan is not null and v_value + 0.009 >= coalesce(v_co_value, 0) then
        v_plan := v_co_plan;
      else
        v_plan := app.billing_plan_for_value(v_value, v_cycle);
        v_divergent := true;
      end if;
    else
      v_plan := v_s.plan_id;
    end if;

    -- pago até o próximo vencimento (meia-noite de São Paulo); a carência
    -- conta a partir daí. Pagar atrasado não estica o período.
    v_end := ((v_due + case v_cycle when 'yearly' then interval '1 year' else interval '1 month' end)::date
              )::timestamp at time zone 'America/Sao_Paulo';
    update public.org_subscriptions
       set status = 'active',
           plan_id = coalesce(v_plan, plan_id),
           billing_cycle = v_cycle,
           checkout_plan_id = null,
           checkout_cycle = null,
           current_period_end = greatest(coalesce(current_period_end, v_end), v_end),
           canceled_at = null,
           pending_payment_id = case when pending_payment_id = v_payment_id then null else pending_payment_id end,
           pending_invoice_url = case when pending_payment_id = v_payment_id then null else pending_invoice_url end,
           pending_due_date = case when pending_payment_id = v_payment_id then null else pending_due_date end
     where org_id = p_org;
    if v_first then
      -- os links abertos ficam sem efeito sobre o plano: pagar um deles
      -- depois cai no plano pelo valor
      delete from public.billing_checkouts where org_id = p_org;
    end if;
    v_outcome := case when v_divergent then 'pago_valor_divergente' else 'pago' end;

  elsif p_event in ('PAYMENT_CREATED', 'PAYMENT_UPDATED') then
    -- cartão é cobrado sozinho; fatura em aberto só interessa a Pix/boleto
    if coalesce(p_payment ->> 'status', '') in ('PENDING', 'OVERDUE') and v_type is distinct from 'CREDIT_CARD' then
      update public.org_subscriptions
         set pending_payment_id = v_payment_id,
             pending_invoice_url = v_invoice,
             pending_due_date = v_due
       where org_id = p_org;
      v_outcome := 'fatura';
    else
      v_outcome := 'ignorado';
    end if;

  elsif p_event = 'PAYMENT_OVERDUE' then
    update public.org_subscriptions
       set status = case when status = 'active' then 'past_due' else status end,
           pending_payment_id = v_payment_id,
           pending_invoice_url = v_invoice,
           pending_due_date = v_due
     where org_id = p_org;
    v_outcome := 'vencido';

  elsif p_event = 'PAYMENT_DELETED' then
    update public.org_subscriptions
       set pending_payment_id = null, pending_invoice_url = null, pending_due_date = null
     where org_id = p_org and pending_payment_id = v_payment_id;
    v_outcome := 'fatura_removida';

  elsif p_event in ('PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED') then
    -- estorno (inclui o arrependimento de 7 dias) e chargeback devolvem o
    -- período daquela cobrança: o acesso pago termina no vencimento dela
    if v_due is not null then
      update public.org_subscriptions
         set current_period_end = least(
               current_period_end,
               (v_due::timestamp at time zone 'America/Sao_Paulo'))
       where org_id = p_org and current_period_end is not null;
    end if;
    v_outcome := 'estornado';

  elsif p_event in ('SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED') then
    update public.org_subscriptions
       set status = case when status in ('active', 'past_due') then 'canceled' else status end,
           canceled_at = case when status in ('active', 'past_due') then coalesce(canceled_at, now())
                              else canceled_at end,
           pending_payment_id = null, pending_invoice_url = null, pending_due_date = null
     where org_id = p_org;
    v_outcome := 'cancelado';

  else
    v_outcome := 'ignorado';
  end if;

  update public.billing_events set outcome = v_outcome where id = p_event_id;
  return jsonb_build_object('outcome', v_outcome, 'replaced_subscription_id', v_replaced);
end;
$$;

-- =====================================================================
-- 5. GRANTS
-- =====================================================================
revoke execute on function public.billing_checkout_started(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.billing_apply_event(text, text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.billing_cancellations_due(int) from public, anon, authenticated;
revoke execute on function public.billing_cancellation_done(text) from public, anon, authenticated;
revoke execute on function public.billing_cancellation_failed(text, text) from public, anon, authenticated;
revoke execute on function public.billing_try_lock(uuid, int) from public, anon, authenticated;
revoke execute on function public.billing_unlock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.billing_checkout_started(uuid, text, text, text) to service_role;
grant execute on function public.billing_apply_event(text, text, uuid, text, text, jsonb) to service_role;
grant execute on function public.billing_cancellations_due(int) to service_role;
grant execute on function public.billing_cancellation_done(text) to service_role;
grant execute on function public.billing_cancellation_failed(text, text) to service_role;
grant execute on function public.billing_try_lock(uuid, int) to service_role;
grant execute on function public.billing_unlock(uuid, uuid) to service_role;

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0058'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
