// Edge Function `billing`: o app pede para assinar, trocar de plano ou
// cancelar. Exige o JWT do usuário (verify_jwt) e confere no banco se ele é
// owner/admin com 2FA em dia (billing_manage_org). O resto roda com a service
// role, pelas funções billing_* da migration 0049.
//
// POST { action: 'checkout', org_id, plan, cycle } -> { url }
// POST { action: 'change',   org_id, plan, cycle } -> { ok: true }
// POST { action: 'cancel',   org_id }              -> { ok: true }
import {
  checkoutBody,
  cycleLabel,
  isCycle,
  planValue,
  saoPauloDate,
  type Cycle,
  type PlanPrice,
} from '../_shared/billing.ts'
import { ITEM_IMAGE_BASE64 } from '../_shared/itemImage.ts'
import {
  HttpError,
  asaas,
  asaasCheckoutUrl,
  env,
  json,
  rpcAsUser,
  rpcService,
} from '../_shared/server.ts'

type Snapshot = {
  org_id: string
  org_name: string
  status: 'courtesy' | 'trial' | 'active' | 'past_due' | 'canceled'
  access: 'full' | 'grace' | 'blocked'
  plan_id: string
  billing_cycle: Cycle | null
  asaas_subscription_id: string | null
  active_subjects: number
  plans: Record<string, PlanPrice>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

function pickPlan(s: Snapshot, planId: unknown, cycle: unknown) {
  if (typeof planId !== 'string' || !s.plans[planId]) throw new HttpError(400, 'Plano inválido.')
  if (!isCycle(cycle)) throw new HttpError(400, 'Escolha mensal ou anual.')
  const plan = s.plans[planId]
  const value = planValue(plan, cycle)
  if (value === null) throw new HttpError(400, 'Plano sem preço para este ciclo.')
  return { planId, cycle, plan, value }
}

async function startCheckout(s: Snapshot, body: Record<string, unknown>) {
  if (s.status === 'courtesy') {
    throw new HttpError(409, 'Esta organização é cortesia e não precisa de assinatura.')
  }
  if (hasLiveSubscription(s)) {
    throw new HttpError(409, 'Você já tem uma assinatura. Para mudar de plano, use "Trocar plano".')
  }
  const { planId, cycle, plan, value } = pickPlan(s, body.plan, body.cycle)
  const checkout = await asaas<{ id: string; link?: string }>(
    'POST',
    '/checkouts',
    checkoutBody({
      orgId: s.org_id,
      planName: plan.name,
      cycle,
      value,
      today: saoPauloDate(new Date()),
      appUrl: env('APP_URL', 'https://avalixfit.com.br'),
      imageBase64: ITEM_IMAGE_BASE64,
    })
  )
  if (!checkout?.id) throw new HttpError(502, 'O serviço de pagamento não abriu o checkout.')
  await rpcService('billing_checkout_started', {
    p_org: s.org_id,
    p_checkout_id: checkout.id,
    p_plan: planId,
    p_cycle: cycle,
  })
  return { url: checkout.link || asaasCheckoutUrl(checkout.id) }
}

async function changePlan(s: Snapshot, body: Record<string, unknown>) {
  if (!hasLiveSubscription(s)) throw new HttpError(409, 'Não há assinatura em vigor para trocar de plano.')
  const { planId, cycle, plan, value } = pickPlan(s, body.plan, body.cycle)
  if (planId === s.plan_id && cycle === s.billing_cycle) return { ok: true }

  // banco primeiro: é ele que recusa descer de plano acima do limite
  const previous = await rpcService<{ plan_id: string; billing_cycle: Cycle | null }>(
    'billing_change_plan',
    { p_org: s.org_id, p_plan: planId, p_cycle: cycle }
  )
  try {
    await asaas('PUT', `/subscriptions/${encodeURIComponent(s.asaas_subscription_id!)}`, {
      value,
      cycle: cycle === 'yearly' ? 'YEARLY' : 'MONTHLY',
      description: `Avalix ${plan.name} (${cycleLabel(cycle)})`,
      updatePendingPayments: true,
    })
  } catch (error) {
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
  if (!hasLiveSubscription(s)) throw new HttpError(409, 'Não há assinatura em vigor para cancelar.')
  try {
    await asaas('DELETE', `/subscriptions/${encodeURIComponent(s.asaas_subscription_id!)}`)
  } catch (error) {
    // já removida no Asaas: segue e marca aqui
    if (!(error instanceof HttpError && error.status === 404)) throw error
  }
  await rpcService('billing_mark_canceled', { p_org: s.org_id })
  return { ok: true }
}

Deno.serve(async (req) => {
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
    const orgId = body.org_id
    if (typeof orgId !== 'string' || !UUID.test(orgId)) throw new HttpError(400, 'Organização inválida.')

    // permissão conferida pelo banco, com o JWT de quem pediu
    await rpcAsUser(authorization, 'billing_manage_org', { p_org: orgId })
    const snapshot = await rpcService<Snapshot | null>('billing_snapshot', { p_org: orgId })
    if (!snapshot) throw new HttpError(404, 'Organização sem registro de assinatura.')

    switch (body.action) {
      case 'checkout':
        return json(await startCheckout(snapshot, body), 200, cors)
      case 'change':
        return json(await changePlan(snapshot, body), 200, cors)
      case 'cancel':
        return json(await cancel(snapshot), 200, cors)
      default:
        throw new HttpError(400, 'Ação inválida.')
    }
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status >= 500) console.error(error.message)
      return json({ error: error.message }, error.status, cors)
    }
    console.error('billing: erro inesperado', error)
    return json({ error: 'Algo deu errado. Tente de novo em instantes.' }, 500, cors)
  }
})
