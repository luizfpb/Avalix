// Regra da Edge Function `billing` (o index.ts só liga isto ao Deno.serve).
// O app pede para assinar, trocar de plano ou cancelar. A function exige o
// JWT do usuário (verify_jwt) e confere no banco se ele é owner/admin com 2FA
// em dia (billing_manage_org). O resto roda com a service role, pelas funções
// billing_* das migrations 0049, 0052 e 0058.
//
// POST { action: 'checkout', org_id, plan, cycle, method: 'card' } -> { url } (checkout do Asaas)
// POST { action: 'checkout', org_id, plan, cycle, method: 'pix', name, cpf_cnpj, email }
//        -> { url, method: 'pix' } (fatura Pix)
// POST { action: 'change',   org_id, plan, cycle } -> { ok: true }
// POST { action: 'cancel',   org_id }              -> { ok: true }
//        (sem assinatura em vigor, desiste do Pix gerado e não pago)
//
// Um pedido por organização de cada vez (billing_try_lock, 0058): clique
// duplo ou duas abas não criam duas assinaturas nem cruzam trocas de plano.
import {
  asaasCycle,
  checkoutBody,
  cycleLabel,
  isCycle,
  onlyDigits,
  pixSubscriptionBody,
  planValue,
  sameMoney,
  saoPauloDate,
  validCpfCnpj,
  type Cycle,
  type PlanPrice,
} from '../_shared/billing.ts'
import type { BillingDeps } from '../_shared/deps.ts'
import { HttpError, json } from '../_shared/http.ts'
import { ITEM_IMAGE_BASE64 } from '../_shared/itemImage.ts'

type Snapshot = {
  org_id: string
  org_name: string
  status: 'courtesy' | 'trial' | 'active' | 'past_due' | 'canceled'
  access: 'full' | 'grace' | 'blocked'
  plan_id: string
  billing_cycle: Cycle | null
  asaas_subscription_id: string | null
  // Pix gerado e não pago (0052)
  has_pending: boolean
  active_subjects: number
  plans: Record<string, PlanPrice>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACTIONS = new Set(['checkout', 'change', 'cancel'])

// Cobre o pior caso do Pix (várias chamadas ao Asaas) e vence sozinha se a
// function morrer no meio.
export const LOCK_SECONDS = 150

export const BUSY_MESSAGE =
  'Já existe um pedido de assinatura em andamento para esta organização. Aguarde alguns segundos e tente de novo.'

type AsaasList<T> = { data?: T[] }
type AsaasPayment = { id: string; invoiceUrl?: string; status?: string }
type Picked = { planId: string; cycle: Cycle; plan: PlanPrice; value: number }

export function createBillingHandler(deps: BillingDeps): (req: Request) => Promise<Response> {
  const { asaas, rpcService, rpcAsUser, env } = deps

  function corsHeaders(origin: string | null): Record<string, string> {
    const appUrl = env('APP_URL', 'https://avalixfit.com.br').replace(/\/+$/, '')
    const allowed = [appUrl, 'http://localhost:5173', 'http://127.0.0.1:5173']
    return {
      'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : appUrl,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
    }
  }

  function hasLiveSubscription(s: Snapshot): boolean {
    return !!s.asaas_subscription_id && (s.status === 'active' || s.status === 'past_due')
  }

  function pickPlan(s: Snapshot, planId: unknown, cycle: unknown): Picked {
    if (typeof planId !== 'string' || !s.plans[planId]) throw new HttpError(400, 'Plano inválido.')
    if (!isCycle(cycle)) throw new HttpError(400, 'Escolha mensal ou anual.')
    const plan = s.plans[planId]
    const value = planValue(plan, cycle)
    if (value === null) throw new HttpError(400, 'Plano sem preço para este ciclo.')
    return { planId, cycle, plan, value }
  }

  function deleteSubscription(id: string): Promise<unknown> {
    return asaas('DELETE', `/subscriptions/${encodeURIComponent(id)}`).catch((error) => {
      // já removida no Asaas
      if (!(error instanceof HttpError && error.status === 404)) throw error
    })
  }

  async function startCheckout(s: Snapshot, body: Record<string, unknown>) {
    if (s.status === 'courtesy') {
      throw new HttpError(409, 'Esta organização é cortesia e não precisa de assinatura.')
    }
    if (hasLiveSubscription(s)) {
      throw new HttpError(409, 'Você já tem uma assinatura. Para mudar de plano, use "Trocar plano".')
    }
    const picked = pickPlan(s, body.plan, body.cycle)
    return body.method === 'pix' ? startPix(s, body, picked) : startCard(s, picked)
  }

  // Cartão: checkout hospedado do Asaas, recorrente. O cartão nunca passa por aqui.
  async function startCard(s: Snapshot, { planId, cycle, plan, value }: Picked) {
    const checkout = await asaas<{ id: string; link?: string }>(
      'POST',
      '/checkouts',
      checkoutBody({
        orgId: s.org_id,
        planName: plan.name,
        cycle,
        value,
        today: saoPauloDate(deps.now()),
        appUrl: env('APP_URL', 'https://avalixfit.com.br'),
        imageBase64: ITEM_IMAGE_BASE64,
      })
    )
    if (!checkout?.id) throw new HttpError(502, 'O serviço de pagamento não abriu o checkout.')
    // registra plano e valor deste checkout (0058): o pagamento libera o
    // plano do checkout pago, não o do último aberto
    await rpcService('billing_checkout_started', {
      p_org: s.org_id,
      p_checkout_id: checkout.id,
      p_plan: planId,
      p_cycle: cycle,
    })
    return { url: checkout.link || deps.checkoutUrl(checkout.id) }
  }

  // Pix: o checkout recorrente não aceita Pix, então a assinatura é criada
  // direto na API. O Asaas exige cliente com nome e CPF/CNPJ; o documento vai
  // só para o Asaas, o Avalix não guarda.
  async function startPix(s: Snapshot, body: Record<string, unknown>, { planId, cycle, plan, value }: Picked) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : ''
    const document = typeof body.cpf_cnpj === 'string' ? onlyDigits(body.cpf_cnpj) : ''
    const email =
      typeof body.email === 'string' && body.email.includes('@') ? body.email.trim().slice(0, 200) : undefined
    if (name.length < 3) throw new HttpError(400, 'Informe o nome completo de quem paga.')
    if (!validCpfCnpj(document)) throw new HttpError(400, 'CPF ou CNPJ inválido.')

    // assinatura Pix anterior que ficou sem pagar: sai antes de criar outra
    if (s.asaas_subscription_id) await deleteSubscription(s.asaas_subscription_id)

    const found = await asaas<AsaasList<{ id: string }>>(
      'GET',
      `/customers?cpfCnpj=${encodeURIComponent(document)}&limit=1`
    )
    const customerId =
      found.data?.[0]?.id ??
      (
        await asaas<{ id: string }>('POST', '/customers', {
          name,
          cpfCnpj: document,
          email,
          externalReference: s.org_id,
        })
      ).id

    const subscription = await asaas<{ id: string }>(
      'POST',
      '/subscriptions',
      pixSubscriptionBody({
        customerId,
        orgId: s.org_id,
        planName: plan.name,
        cycle,
        value,
        today: saoPauloDate(deps.now()),
      })
    )
    // o plano escolhido fica pendente até o pagamento, como no checkout
    await rpcService('billing_checkout_started', {
      p_org: s.org_id,
      p_checkout_id: `pix:${subscription.id}`,
      p_plan: planId,
      p_cycle: cycle,
    })

    // a primeira fatura (vence hoje) nasce junto com a assinatura
    for (let attempt = 0; attempt < 4; attempt++) {
      const payments = await asaas<AsaasList<AsaasPayment>>(
        'GET',
        `/subscriptions/${encodeURIComponent(subscription.id)}/payments`
      )
      const invoice = payments.data?.find((p) => p.invoiceUrl)?.invoiceUrl
      if (invoice) return { url: invoice, method: 'pix' }
      await deps.sleep(1000)
    }
    throw new HttpError(502, 'A fatura Pix ainda está sendo gerada. Ela aparece nesta tela em instantes.')
  }

  // O Asaas já está com o valor e o ciclo novos? (a resposta do PUT pode se
  // perder depois de aplicado). Na dúvida, false: desfaz no banco.
  async function asaasAlreadyHas(subscriptionId: string, value: number, cycle: Cycle): Promise<boolean> {
    try {
      const sub = await asaas<{ value?: unknown; cycle?: unknown }>(
        'GET',
        `/subscriptions/${encodeURIComponent(subscriptionId)}`
      )
      return sameMoney(sub?.value, value) && sub?.cycle === asaasCycle(cycle)
    } catch (error) {
      console.error('não foi possível conferir a assinatura no Asaas', error)
      return false
    }
  }

  async function changePlan(s: Snapshot, body: Record<string, unknown>) {
    if (!hasLiveSubscription(s)) throw new HttpError(409, 'Não há assinatura em vigor para trocar de plano.')
    const { planId, cycle, plan, value } = pickPlan(s, body.plan, body.cycle)
    if (planId === s.plan_id && cycle === s.billing_cycle) return { ok: true }
    const subscriptionId = s.asaas_subscription_id!

    // banco primeiro: é ele que recusa descer de plano acima do limite
    const previous = await rpcService<{ plan_id: string; billing_cycle: Cycle | null }>(
      'billing_change_plan',
      { p_org: s.org_id, p_plan: planId, p_cycle: cycle }
    )
    try {
      await asaas('PUT', `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
        value,
        cycle: asaasCycle(cycle),
        description: `Avalix ${plan.name} (${cycleLabel(cycle)})`,
        updatePendingPayments: true,
      })
    } catch (error) {
      if (await asaasAlreadyHas(subscriptionId, value, cycle)) return { ok: true }
      await rpcService('billing_change_plan', {
        p_org: s.org_id,
        p_plan: previous.plan_id,
        p_cycle: previous.billing_cycle ?? cycle,
      }).catch((e) => console.error('falha ao desfazer troca de plano', e))
      throw error
    }
    return { ok: true }
  }

  async function cancel(s: Snapshot) {
    if (!hasLiveSubscription(s)) {
      if (s.has_pending) return discardPending(s)
      throw new HttpError(409, 'Não há assinatura em vigor para cancelar.')
    }
    await deleteSubscription(s.asaas_subscription_id!)
    await rpcService('billing_mark_canceled', { p_org: s.org_id })
    return { ok: true }
  }

  // Desistir do Pix gerado e não pago: a assinatura sai do Asaas (senão ele
  // segue mandando uma fatura por ciclo) e o pendente sai daqui. O teste
  // grátis, se ainda valer, continua como estava.
  async function discardPending(s: Snapshot) {
    if (s.asaas_subscription_id) await deleteSubscription(s.asaas_subscription_id)
    await rpcService('billing_discard_pending', { p_org: s.org_id })
    return { ok: true }
  }

  async function perform(orgId: string, body: Record<string, unknown>) {
    const snapshot = await rpcService<Snapshot | null>('billing_snapshot', { p_org: orgId })
    if (!snapshot) throw new HttpError(404, 'Organização sem registro de assinatura.')
    switch (body.action) {
      case 'checkout':
        return startCheckout(snapshot, body)
      case 'change':
        return changePlan(snapshot, body)
      default:
        return cancel(snapshot)
    }
  }

  return async function handle(req: Request): Promise<Response> {
    const cors = corsHeaders(req.headers.get('Origin'))
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405, cors)

    try {
      const authorization = req.headers.get('Authorization')
      if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Faça login de novo.')

      let body: Record<string, unknown>
      try {
        body = await req.json()
      } catch {
        throw new HttpError(400, 'Pedido inválido.')
      }
      if (!body || typeof body !== 'object') throw new HttpError(400, 'Pedido inválido.')
      const orgId = body.org_id
      if (typeof orgId !== 'string' || !UUID.test(orgId)) throw new HttpError(400, 'Organização inválida.')
      if (typeof body.action !== 'string' || !ACTIONS.has(body.action)) throw new HttpError(400, 'Ação inválida.')

      // permissão conferida pelo banco, com o JWT de quem pediu
      await rpcAsUser(authorization, 'billing_manage_org', { p_org: orgId })

      const token = await rpcService<string | null>('billing_try_lock', {
        p_org: orgId,
        p_seconds: LOCK_SECONDS,
      })
      if (!token) throw new HttpError(409, BUSY_MESSAGE)
      try {
        return json(await perform(orgId, body), 200, cors)
      } finally {
        await rpcService('billing_unlock', { p_org: orgId, p_token: token }).catch((e) =>
          console.error('falha ao soltar a trava da cobrança', e)
        )
      }
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.status >= 500) console.error(error.message)
        return json({ error: error.message }, error.status, cors)
      }
      console.error('billing: erro inesperado', error)
      return json({ error: 'Algo deu errado. Tente de novo em instantes.' }, 500, cors)
    }
  }
}
