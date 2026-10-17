-- 0049 — assinatura paga (Asaas): planos, teste grátis, carência e bloqueio.
-- Aplicar depois da 0048. Não apaga nem altera dado clínico.
--
-- As tabelas plans e org_subscriptions existem desde a 0001, vazias e sem uso.
-- Esta migration as completa e liga a cobrança ao banco:
--
-- 1. Dois planos: "Até 30" (até 30 avaliados ativos) e "Ilimitado", cada um
--    com preço mensal e anual (anual = 10 mensalidades). O preço mora aqui:
--    a Edge Function lê da tabela, então mudar preço é um UPDATE, sem deploy.
-- 2. Toda organização tem uma linha em org_subscriptions. As que já existem
--    viram 'courtesy' (cortesia, sem cobrança): ninguém que já usa o app é
--    bloqueado quando a migration entra. Organização nova nasce em teste
--    grátis de 14 dias no plano Ilimitado. Só a primeira organização de cada
--    usuário ganha o teste; as seguintes já nascem com o teste encerrado.
-- 3. Acesso (app.org_access): 'full', 'grace' ou 'blocked'.
--    - courtesy: sempre full.
--    - trial: full até trial_ends_at; depois, blocked.
--    - active/past_due: full até current_period_end (past_due vira grace) e
--      grace por mais 5 dias; depois, blocked.
--    - canceled: full até o fim do período já pago; depois, blocked.
-- 4. Bloqueado = só leitura. Triggers recusam criar avaliado, avaliação,
--    anamnese, sessão postural, agendamento, plano de treino e links novos, e
--    editar avaliação e plano. Continua permitido: ler, exportar, corrigir o
--    cadastro do avaliado (direito de retificação), revogar consentimento e
--    excluir (direito de eliminação). Nada é apagado por falta de pagamento.
--    O aluno continua registrando treino pelo link: a trava só vale para o
--    profissional autenticado (auth.uid() presente). Service role e as RPCs
--    públicas do aluno não passam pela regra.
-- 5. Limite do plano: criar ou reativar avaliado acima de max_subjects é
--    recusado. Quem já tem mais avaliados ativos que o limite não perde nada;
--    só não cria nem reativa até ficar abaixo.
-- 6. Webhook: billing_events guarda o id de cada evento recebido do Asaas
--    (entrega "pelo menos uma vez"), então reprocessar não muda nada. Não
--    guarda o payload: só os identificadores necessários para auditoria.
-- 7. As funções billing_* só rodam com service_role (Edge Functions), exceto
--    billing_manage_org e get_org_billing, chamadas com o JWT do usuário.
begin;

-- =====================================================================
-- 1. PLANOS
-- =====================================================================
alter table public.plans
  add column yearly_price_brl numeric(8,2),
  add column sort_order int not null default 0;

alter table public.plans
  add constraint plans_prices_check check (
    (monthly_price_brl is null or monthly_price_brl > 0)
    and (yearly_price_brl is null or yearly_price_brl > 0)
  ),
  add constraint plans_max_subjects_check check (max_subjects is null or max_subjects > 0);

insert into public.plans (id, name, monthly_price_brl, yearly_price_brl, max_subjects, sort_order)
values
  ('ate30', 'Até 30', 49.90, 499.00, 30, 1),
  ('ilimitado', 'Ilimitado', 89.90, 899.00, null, 2)
on conflict (id) do nothing;

-- =====================================================================
-- 2. ASSINATURA DA ORGANIZAÇÃO
-- =====================================================================
alter table public.org_subscriptions
  drop constraint org_subscriptions_status_check;

alter table public.org_subscriptions
  add constraint org_subscriptions_status_check
    check (status in ('courtesy','trial','active','past_due','canceled')),
  add column trial_ends_at            timestamptz,
  add column billing_cycle            text check (billing_cycle in ('monthly','yearly')),
  add column asaas_customer_id        text,
  add column asaas_subscription_id    text unique,
  add column asaas_checkout_id        text unique,
  add column checkout_plan_id         text references public.plans(id),
  add column checkout_cycle           text check (checkout_cycle in ('monthly','yearly')),
  add column checkout_created_at      timestamptz,
  add column pending_payment_id       text,
  add column pending_invoice_url      text check (pending_invoice_url is null or pending_invoice_url ~ '^https://'),
  add column pending_due_date         date,
  add column canceled_at              timestamptz,
  add column created_at               timestamptz not null default now(),
  add column updated_at               timestamptz not null default now();

alter table public.org_subscriptions
  add constraint org_subscriptions_trial_check check (status <> 'trial' or trial_ends_at is not null);

create trigger org_subscriptions_updated_at
  before update on public.org_subscriptions
  for each row execute function app.set_updated_at();

-- Organizações que já existem: cortesia no Ilimitado.
insert into public.org_subscriptions (org_id, plan_id, status)
select o.id, 'ilimitado', 'courtesy'
  from public.organizations o
on conflict (org_id) do nothing;

-- Organização nova: teste grátis de 14 dias, só na primeira do usuário. O
-- trigger roda antes do insert em org_members (create_organization insere a
-- org e depois o vínculo), então "já é dono de outra" conta só as anteriores.
create or replace function app.org_subscription_start()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_other_orgs int := 0;
begin
  if (select auth.uid()) is not null then
    select count(*) into v_other_orgs
      from public.org_members m
     where m.user_id = (select auth.uid()) and m.role = 'owner' and m.org_id <> new.id;
  end if;
  insert into public.org_subscriptions (org_id, plan_id, status, trial_ends_at)
  values (
    new.id, 'ilimitado', 'trial',
    case when v_other_orgs = 0 then now() + interval '14 days' else now() end
  )
  on conflict (org_id) do nothing;
  return new;
end;
$$;

revoke execute on function app.org_subscription_start() from public, anon, authenticated;

create trigger organizations_subscription_start
  after insert on public.organizations
  for each row execute function app.org_subscription_start();

-- =====================================================================
-- 3. EVENTOS DO WEBHOOK (idempotência)
-- =====================================================================
create table public.billing_events (
  id               text primary key check (char_length(id) between 1 and 200),
  event            text not null check (char_length(event) between 1 and 80),
  org_id           uuid references public.organizations(id) on delete set null,
  subscription_id  text,
  payment_id       text,
  outcome          text,
  received_at      timestamptz not null default now()
);

create index billing_events_org_idx on public.billing_events (org_id, received_at desc);

alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;
grant select, insert, update on public.billing_events to service_role;
-- sem policy: só service_role (que ignora RLS) lê e escreve.

-- =====================================================================
-- 4. REGRA DE ACESSO
-- =====================================================================
create or replace function app.billing_grace()
returns interval
language sql immutable set search_path = ''
as $$ select interval '5 days' $$;

create or replace function app.org_access(p_org uuid, p_now timestamptz default now())
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when s.status = 'courtesy' then 'full'
      when s.status = 'trial' then
        case when p_now < s.trial_ends_at then 'full' else 'blocked' end
      when s.status in ('active', 'past_due') then
        case
          when s.current_period_end is null then 'blocked'
          when p_now < s.current_period_end then
            case when s.status = 'past_due' then 'grace' else 'full' end
          when p_now < s.current_period_end + app.billing_grace() then 'grace'
          else 'blocked'
        end
      when s.status = 'canceled' then
        case when p_now < coalesce(s.current_period_end, '-infinity'::timestamptz)
             then 'full' else 'blocked' end
      else 'blocked'
    end
    from public.org_subscriptions s
   where s.org_id = p_org
  ), 'full');
$$;

revoke execute on function app.org_access(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function app.billing_grace() from public, anon, authenticated;

-- =====================================================================
-- 5. TRAVAS (só leitura quando bloqueado; limite do plano)
-- =====================================================================
create or replace function app.billing_blocked_message()
returns text
language sql immutable set search_path = ''
as $$
  select 'Sua assinatura do Avalix não está ativa. Seus dados continuam disponíveis para consulta e exportação; para criar ou editar, assine em Ajustes > Plano e cobrança.'::text
$$;

revoke execute on function app.billing_blocked_message() from public, anon, authenticated;

create or replace function app.billing_write_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- aluno pelo link (anon), service role e manutenção não passam pela regra
  if (select auth.uid()) is null then
    return new;
  end if;
  if app.org_access(new.org_id) = 'blocked' then
    raise exception using errcode = 'P0001', message = app.billing_blocked_message();
  end if;
  return new;
end;
$$;

revoke execute on function app.billing_write_guard() from public, anon, authenticated;

create or replace function app.billing_subject_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_max    int;
  v_count  int;
  v_term   text;
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  -- editar o cadastro (retificação) é sempre permitido; só criar ou reativar conta
  if tg_op = 'UPDATE' and (old.is_active or not new.is_active) then
    return new;
  end if;
  if app.org_access(new.org_id) = 'blocked' then
    raise exception using errcode = 'P0001', message = app.billing_blocked_message();
  end if;
  -- criar já inativo não ocupa vaga
  if not new.is_active then
    return new;
  end if;

  select p.max_subjects into v_max
    from public.org_subscriptions s
    join public.plans p on p.id = s.plan_id
   where s.org_id = new.org_id;
  if v_max is null then
    return new;
  end if;

  -- serializa a contagem por organização: duas abas criando ao mesmo tempo
  -- não passam juntas do limite
  perform pg_advisory_xact_lock(hashtextextended('billing-subjects:' || new.org_id::text, 0));
  select count(*) into v_count
    from public.subjects x
   where x.org_id = new.org_id and x.is_active and x.id <> new.id;
  if v_count >= v_max then
    select o.subject_term into v_term from public.organizations o where o.id = new.org_id;
    raise exception using
      errcode = 'P0001',
      message = format(
        'Seu plano permite até %s %ss ativos. Inative um cadastro ou mude para o plano Ilimitado em Ajustes > Plano e cobrança.',
        v_max, coalesce(v_term, 'avaliado'));
  end if;
  return new;
end;
$$;

revoke execute on function app.billing_subject_guard() from public, anon, authenticated;

-- b9: depois dos b1_org (que preenchem org_id nas tabelas filhas) e dos
-- b2_evaluator; antes de freeze, single_active e updated_at.
create trigger subjects_b9_billing
  before insert or update of is_active on public.subjects
  for each row execute function app.billing_subject_guard();

create trigger assessments_b9_billing
  before insert or update on public.assessments
  for each row execute function app.billing_write_guard();

create trigger anamneses_b9_billing
  before insert on public.anamneses
  for each row execute function app.billing_write_guard();

create trigger workout_plans_b9_billing
  before insert or update on public.workout_plans
  for each row execute function app.billing_write_guard();

create trigger posture_sessions_b9_billing
  before insert on public.posture_sessions
  for each row execute function app.billing_write_guard();

create trigger appointments_b9_billing
  before insert on public.appointments
  for each row execute function app.billing_write_guard();

create trigger anamnese_intakes_b9_billing
  before insert on public.anamnese_intakes
  for each row execute function app.billing_write_guard();

create trigger workout_links_b9_billing
  before insert on public.workout_links
  for each row execute function app.billing_write_guard();

-- =====================================================================
-- 6. LEITURA PARA O APP (membro da organização)
-- =====================================================================
create or replace function public.get_org_billing(p_org uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_s      public.org_subscriptions;
  v_plan   public.plans;
  v_access text;
  v_active int;
begin
  if not app.is_member(p_org) then
    raise exception 'organização inexistente ou sem acesso';
  end if;
  select * into v_s from public.org_subscriptions s where s.org_id = p_org;
  select * into v_plan from public.plans p where p.id = v_s.plan_id;
  v_access := app.org_access(p_org);
  select count(*) into v_active from public.subjects x where x.org_id = p_org and x.is_active;

  return jsonb_build_object(
    'status', coalesce(v_s.status, 'courtesy'),
    'access', v_access,
    'plan_id', v_s.plan_id,
    'plan_name', v_plan.name,
    'max_subjects', v_plan.max_subjects,
    'active_subjects', v_active,
    'billing_cycle', v_s.billing_cycle,
    'trial_ends_at', v_s.trial_ends_at,
    'current_period_end', v_s.current_period_end,
    'grace_ends_at', case when v_s.current_period_end is not null
                          then v_s.current_period_end + app.billing_grace() end,
    'has_subscription', v_s.asaas_subscription_id is not null and v_s.status <> 'canceled',
    'canceled_at', v_s.canceled_at,
    'pending_invoice_url', v_s.pending_invoice_url,
    'pending_due_date', v_s.pending_due_date,
    'can_manage', app.role_in(p_org, array['owner','admin']),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name,
               'monthly_price_brl', p.monthly_price_brl,
               'yearly_price_brl', p.yearly_price_brl,
               'max_subjects', p.max_subjects
             ) order by p.sort_order, p.id)
        from public.plans p
       where p.monthly_price_brl is not null and p.yearly_price_brl is not null
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_org_billing(uuid) from public, anon;
grant execute on function public.get_org_billing(uuid) to authenticated;

-- Quem pode contratar, trocar ou cancelar: owner/admin com 2FA em dia. A Edge
-- Function chama com o JWT do usuário e só segue se esta função devolver a org.
create or replace function public.billing_manage_org(p_org uuid)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'não autenticado';
  end if;
  if not app.role_in(p_org, array['owner','admin']) then
    raise exception 'Só o dono ou um administrador da organização gerencia a assinatura.';
  end if;
  if not app.mfa_satisfied() then
    raise exception 'verificação em duas etapas pendente';
  end if;
  return p_org;
end;
$$;

revoke execute on function public.billing_manage_org(uuid) from public, anon;
grant execute on function public.billing_manage_org(uuid) to authenticated;

-- =====================================================================
-- 7. FUNÇÕES DA EDGE FUNCTION (somente service_role)
-- =====================================================================

-- Estado atual + preços, para montar o checkout ou a troca de plano.
create or replace function public.billing_snapshot(p_org uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'org_id', s.org_id,
    'org_name', o.name,
    'status', s.status,
    'access', app.org_access(s.org_id),
    'plan_id', s.plan_id,
    'billing_cycle', s.billing_cycle,
    'asaas_subscription_id', s.asaas_subscription_id,
    'active_subjects', (select count(*) from public.subjects x where x.org_id = s.org_id and x.is_active),
    'plans', (
      select jsonb_object_agg(p.id, jsonb_build_object(
               'name', p.name, 'monthly_price_brl', p.monthly_price_brl,
               'yearly_price_brl', p.yearly_price_brl, 'max_subjects', p.max_subjects))
        from public.plans p
    )
  )
  from public.org_subscriptions s
  join public.organizations o on o.id = s.org_id
  where s.org_id = p_org;
$$;

create or replace function public.billing_checkout_started(
  p_org uuid, p_checkout_id text, p_plan text, p_cycle text
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.plans p where p.id = p_plan and p.monthly_price_brl is not null) then
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
end;
$$;

-- De qual organização é este evento: pela assinatura já conhecida, pelo
-- checkout que a originou ou pela referência externa (o org_id que a Edge
-- Function mandou no checkout).
create or replace function public.billing_find_org(
  p_subscription_id text, p_checkout_id text, p_external_reference text
)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select s.org_id from public.org_subscriptions s
      where p_subscription_id is not null and s.asaas_subscription_id = p_subscription_id),
    (select s.org_id from public.org_subscriptions s
      where p_checkout_id is not null and s.asaas_checkout_id = p_checkout_id),
    (select s.org_id from public.org_subscriptions s
      where s.org_id = app.uuid_or_null(p_external_reference))
  );
$$;

create or replace function app.date_or_null(p text)
returns date
language plpgsql immutable set search_path = ''
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return p::date;
exception when others then
  return null;
end;
$$;

revoke execute on function app.date_or_null(text) from public, anon, authenticated;

-- Aplica um evento do Asaas. Idempotente pelo id do evento. Devolve
-- {outcome, replaced_subscription_id}: quando uma assinatura nova é paga e a
-- organização tinha outra ativa, a Edge Function cancela a antiga no Asaas.
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
  v_s          public.org_subscriptions;
  v_payment_id text := p_payment ->> 'id';
  v_due        date := app.date_or_null(p_payment ->> 'dueDate');
  v_invoice    text := p_payment ->> 'invoiceUrl';
  v_type       text := p_payment ->> 'billingType';
  v_cycle      text;
  v_end        timestamptz;
  v_replaced   text;
  v_outcome    text;
  v_paid       boolean := p_event in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED');
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

  -- Assinatura que a organização ainda não conhece. Só é adotada quando a
  -- organização não tem outra em vigor, ou quando a nova é paga (troca por
  -- checkout novo depois de cancelar, ou checkout antigo pago tardiamente).
  if v_s.asaas_subscription_id is distinct from p_subscription_id then
    if p_subscription_id is null then
      update public.billing_events set outcome = 'sem_assinatura' where id = p_event_id;
      return jsonb_build_object('outcome', 'sem_assinatura');
    end if;
    if v_s.asaas_subscription_id is not null and v_s.status <> 'canceled' and not v_paid then
      update public.billing_events set outcome = 'outra_assinatura' where id = p_event_id;
      return jsonb_build_object('outcome', 'outra_assinatura');
    end if;
    if v_s.status <> 'canceled' then
      v_replaced := v_s.asaas_subscription_id;
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
    -- pago até o próximo vencimento (meia-noite de São Paulo); a carência
    -- conta a partir daí. Pagar atrasado não estica o período.
    v_end := ((v_due + case v_cycle when 'yearly' then interval '1 year' else interval '1 month' end)::date
              )::timestamp at time zone 'America/Sao_Paulo';
    update public.org_subscriptions
       set status = 'active',
           plan_id = coalesce(checkout_plan_id, plan_id),
           billing_cycle = v_cycle,
           checkout_plan_id = null,
           checkout_cycle = null,
           current_period_end = greatest(coalesce(current_period_end, v_end), v_end),
           canceled_at = null,
           pending_payment_id = case when pending_payment_id = v_payment_id then null else pending_payment_id end,
           pending_invoice_url = case when pending_payment_id = v_payment_id then null else pending_invoice_url end,
           pending_due_date = case when pending_payment_id = v_payment_id then null else pending_due_date end
     where org_id = p_org;
    v_outcome := 'pago';

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
           canceled_at = coalesce(canceled_at, now()),
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

-- Troca de plano ou de ciclo numa assinatura em vigor. Valor novo vale a
-- partir da próxima cobrança; o limite novo vale na hora. Devolve o plano e o
-- ciclo anteriores para a Edge Function desfazer se o Asaas recusar.
create or replace function public.billing_change_plan(p_org uuid, p_plan text, p_cycle text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_s      public.org_subscriptions;
  v_max    int;
  v_active int;
  v_term   text;
begin
  if p_cycle not in ('monthly', 'yearly') then
    raise exception 'ciclo inválido';
  end if;
  select p.max_subjects into v_max from public.plans p
   where p.id = p_plan and p.monthly_price_brl is not null;
  if not found then
    raise exception 'plano inválido';
  end if;
  select * into v_s from public.org_subscriptions s where s.org_id = p_org for update;
  if not found or v_s.asaas_subscription_id is null or v_s.status not in ('active', 'past_due') then
    raise exception 'Não há assinatura em vigor para trocar de plano.';
  end if;
  if v_max is not null then
    select count(*) into v_active from public.subjects x where x.org_id = p_org and x.is_active;
    if v_active > v_max then
      select o.subject_term into v_term from public.organizations o where o.id = p_org;
      raise exception using
        errcode = 'P0001',
        message = format(
          'Você tem %s %ss ativos e o plano escolhido permite %s. Inative cadastros antes de trocar.',
          v_active, coalesce(v_term, 'avaliado'), v_max);
    end if;
  end if;
  update public.org_subscriptions
     set plan_id = p_plan, billing_cycle = p_cycle
   where org_id = p_org;
  return jsonb_build_object('plan_id', v_s.plan_id, 'billing_cycle', v_s.billing_cycle);
end;
$$;

-- Cancelamento pedido pelo app (a Edge Function já removeu a assinatura no
-- Asaas). O acesso segue até o fim do período pago.
create or replace function public.billing_mark_canceled(p_org uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.org_subscriptions
     set status = case when status in ('active', 'past_due') then 'canceled' else status end,
         canceled_at = coalesce(canceled_at, now()),
         pending_payment_id = null, pending_invoice_url = null, pending_due_date = null
   where org_id = p_org;
$$;

revoke execute on function public.billing_snapshot(uuid) from public, anon, authenticated;
revoke execute on function public.billing_checkout_started(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.billing_find_org(text, text, text) from public, anon, authenticated;
revoke execute on function public.billing_apply_event(text, text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.billing_change_plan(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.billing_mark_canceled(uuid) from public, anon, authenticated;
grant execute on function public.billing_snapshot(uuid) to service_role;
grant execute on function public.billing_checkout_started(uuid, text, text, text) to service_role;
grant execute on function public.billing_find_org(text, text, text) to service_role;
grant execute on function public.billing_apply_event(text, text, uuid, text, text, jsonb) to service_role;
grant execute on function public.billing_change_plan(uuid, text, text) to service_role;
grant execute on function public.billing_mark_canceled(uuid) to service_role;

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0049'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
