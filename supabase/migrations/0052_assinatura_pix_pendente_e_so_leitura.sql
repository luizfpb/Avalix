-- 0052 — Pix pendente sem beco sem saída e "só leitura" completo.
-- Aplicar depois da 0051. Não apaga nem altera dado clínico.
--
-- 1. Pix gerado e não pago. O PAYMENT_CREATED do Pix grava a assinatura na
--    organização ainda em teste, e get_org_billing dizia has_subscription =
--    true. A tela trocava para "Trocar plano" e "Cancelar", que a Edge
--    Function recusa ("Não há assinatura em vigor"): não dava para pagar com
--    cartão, mudar de plano nem desistir, e o Asaas seguia mandando uma fatura
--    por mês. Agora:
--    - has_subscription só vale para assinatura em vigor (active/past_due);
--    - get_org_billing devolve o plano e o ciclo do Pix pendente;
--    - billing_discard_pending limpa o pendente depois de a Edge Function
--      remover a assinatura no Asaas ("Desistir deste Pix").
-- 2. Adoção de assinatura desconhecida (billing_apply_event):
--    - só é recusada quando a organização tem outra EM VIGOR. Antes, um
--      segundo Pix gerado ainda no teste era ignorado ('outra_assinatura') e a
--      fatura nova nunca aparecia na tela;
--    - só eventos que criam ou cobram adotam (criada, atualizada, vencida,
--      paga). Remoção, estorno e afins de uma assinatura que a organização não
--      conhece não a adotam: o aviso atrasado do Pix descartado não volta a
--      grudar na organização.
--    - SUBSCRIPTION_DELETED só marca canceled_at em assinatura em vigor.
-- 3. Só leitura completo. A 0049 travava criar avaliado, avaliação, anamnese,
--    sessão postural, agendamento, plano e links, mas deixava passar fotos e
--    marcações posturais, edição de anamnese, de sessão postural e de
--    agendamento, sessões de treino registradas pelo profissional e
--    exercícios e vídeos personalizados. Continua valendo só para o
--    profissional autenticado: o aluno pelo link (anon) segue registrando.
--    Excluir continua liberado em tudo.
-- 4. Mensagem do limite do plano: com três planos, "mude de plano" (antes
--    mandava para o Ilimitado).
begin;

-- =====================================================================
-- 1. LEITURA PARA O APP
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
  v_live   boolean;
begin
  if not app.is_member(p_org) then
    raise exception 'organização inexistente ou sem acesso';
  end if;
  select * into v_s from public.org_subscriptions s where s.org_id = p_org;
  select * into v_plan from public.plans p where p.id = v_s.plan_id;
  v_access := app.org_access(p_org);
  select count(*) into v_active from public.subjects x where x.org_id = p_org and x.is_active;
  v_live := v_s.asaas_subscription_id is not null and v_s.status in ('active', 'past_due');

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
    'has_subscription', coalesce(v_live, false),
    'canceled_at', v_s.canceled_at,
    'pending_invoice_url', v_s.pending_invoice_url,
    'pending_due_date', v_s.pending_due_date,
    -- Pix gerado e ainda não pago, fora de uma assinatura em vigor
    'pending_plan_id', case when not coalesce(v_live, false) and v_s.pending_invoice_url is not null
                            then v_s.checkout_plan_id end,
    'pending_cycle', case when not coalesce(v_live, false) and v_s.pending_invoice_url is not null
                          then v_s.checkout_cycle end,
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

-- A Edge Function precisa saber se há Pix pendente para oferecer o descarte.
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
    'has_pending', s.pending_invoice_url is not null,
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

-- Desistir do Pix pendente (a Edge Function já removeu a assinatura no
-- Asaas). Não mexe em assinatura em vigor: essa sai por billing_mark_canceled.
create or replace function public.billing_discard_pending(p_org uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.org_subscriptions
     set pending_payment_id = null, pending_invoice_url = null, pending_due_date = null,
         asaas_checkout_id = null, checkout_plan_id = null, checkout_cycle = null,
         checkout_created_at = null
   where org_id = p_org and status not in ('active', 'past_due');
  if not found then
    raise exception 'Não há Pix pendente para descartar.';
  end if;
end;
$$;

revoke execute on function public.billing_discard_pending(uuid) from public, anon, authenticated;
grant execute on function public.billing_discard_pending(uuid) to service_role;

-- =====================================================================
-- 2. WEBHOOK
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
  v_adoptable  boolean := p_event in ('PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_OVERDUE',
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
    -- a anterior (em vigor ou Pix pendente do teste) sai no Asaas
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

revoke execute on function public.billing_snapshot(uuid) from public, anon, authenticated;
revoke execute on function public.billing_apply_event(text, text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.billing_snapshot(uuid) to service_role;
grant execute on function public.billing_apply_event(text, text, uuid, text, text, jsonb) to service_role;

-- =====================================================================
-- 3. SÓ LEITURA COMPLETO
-- =====================================================================
-- O mesmo app.billing_write_guard da 0049 (auth.uid() nulo passa: aluno pelo
-- link, service role e manutenção). b9: depois dos b1 que preenchem org_id.
drop trigger if exists anamneses_b9_billing on public.anamneses;
create trigger anamneses_b9_billing
  before insert or update on public.anamneses
  for each row execute function app.billing_write_guard();

drop trigger if exists posture_sessions_b9_billing on public.posture_sessions;
create trigger posture_sessions_b9_billing
  before insert or update on public.posture_sessions
  for each row execute function app.billing_write_guard();

create trigger posture_photos_b9_billing
  before insert or update on public.posture_photos
  for each row execute function app.billing_write_guard();

create trigger posture_annotations_b9_billing
  before insert or update on public.posture_annotations
  for each row execute function app.billing_write_guard();

drop trigger if exists appointments_b9_billing on public.appointments;
create trigger appointments_b9_billing
  before insert or update on public.appointments
  for each row execute function app.billing_write_guard();

-- sessões: as RPCs do link rodam como anon e passam; as do profissional não
create trigger workout_logs_b9_billing
  before insert or update on public.workout_logs
  for each row execute function app.billing_write_guard();

-- exercício global (org_id nulo) não tem assinatura e passa (org_access = full)
create trigger exercises_b9_billing
  before insert or update on public.exercises
  for each row execute function app.billing_write_guard();

create trigger exercise_videos_b9_billing
  before insert or update on public.exercise_videos
  for each row execute function app.billing_write_guard();

-- =====================================================================
-- 4. LIMITE DO PLANO: "mude de plano"
-- =====================================================================
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
        'Seu plano permite até %s %ss ativos. Inative um cadastro ou mude de plano em Ajustes > Plano e cobrança.',
        v_max, coalesce(v_term, 'avaliado'));
  end if;
  return new;
end;
$$;

revoke execute on function app.billing_subject_guard() from public, anon, authenticated;

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0052'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
