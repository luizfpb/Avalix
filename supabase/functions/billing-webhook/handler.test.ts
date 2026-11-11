import { describe, expect, it } from 'vitest'
import type { AsaasMethod, WebhookDeps } from '../_shared/deps.ts'
import { HttpError } from '../_shared/http.ts'
import { createWebhookHandler } from './handler.ts'

const TOKEN = 'segredo-do-webhook'
const ORG = '22222222-2222-4222-8222-222222222222'

type Call = [string, ...unknown[]]

function setup(opts: {
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>
  asaas?: (method: AsaasMethod, path: string) => unknown
} = {}) {
  const calls: Call[] = []
  const rpc: Record<string, (args: Record<string, unknown>) => unknown> = {
    billing_find_org: () => null,
    billing_apply_event: () => ({ outcome: 'pago', replaced_subscription_id: null }),
    billing_cancellations_due: () => [],
    billing_cancellation_done: () => null,
    billing_cancellation_failed: () => null,
    ...opts.rpc,
  }
  const deps: WebhookDeps = {
    asaas: (async (method: AsaasMethod, path: string) => {
      calls.push(['asaas', method, path])
      if (!opts.asaas) throw new Error(`Asaas inesperado: ${method} ${path}`)
      return opts.asaas(method, path)
    }) as WebhookDeps['asaas'],
    rpcService: (async (fn: string, args: Record<string, unknown>) => {
      calls.push(['rpc', fn, args])
      if (!rpc[fn]) throw new Error(`rpc inesperada: ${fn}`)
      return rpc[fn](args)
    }) as WebhookDeps['rpcService'],
    env: (name: string) => {
      if (name === 'ASAAS_WEBHOOK_TOKEN') return TOKEN
      throw new Error(name)
    },
  }
  const handle = createWebhookHandler(deps)
  const send = (body: unknown, token = TOKEN) =>
    handle(
      new Request('https://fn.local/billing-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'asaas-access-token': token },
        body: JSON.stringify(body),
      })
    )
  const rpcCalls = (fn: string) => calls.filter((c) => c[0] === 'rpc' && c[1] === fn)
  return { calls, send, rpcCalls }
}

const paidEvent = (payment: Record<string, unknown>) => ({ id: 'evt_1', event: 'PAYMENT_RECEIVED', payment })

describe('billing-webhook: autenticação', () => {
  it('token errado não chega no banco nem no Asaas', async () => {
    const t = setup()
    const res = await t.send(paidEvent({ id: 'pay_1' }), 'outro')
    expect(res.status).toBe(401)
    expect(t.calls).toEqual([])
  })
})

describe('billing-webhook: pagamento', () => {
  const realPayment = {
    id: 'pay_1', status: 'RECEIVED', billingType: 'CREDIT_CARD', dueDate: '2026-11-11',
    subscription: 'sub_real', externalReference: ORG, value: 19.9, customer: 'cus_1',
  }

  it('organização, assinatura e valor saem do pagamento reconsultado, não do corpo', async () => {
    const t = setup({
      rpc: {
        billing_find_org: (args) => (args.p_checkout_id === 'chk_30' && args.p_external_reference === ORG ? ORG : null),
      },
      asaas: (_method, path) => {
        if (path === '/payments/pay_1') return realPayment
        if (path === '/subscriptions/sub_real') return { id: 'sub_real', cycle: 'MONTHLY', checkoutSession: 'chk_30', externalReference: ORG }
        throw new Error(path)
      },
    })
    // corpo forjado: aponta outra assinatura, outra organização e outro valor
    const res = await t.send(paidEvent({
      id: 'pay_1', status: 'RECEIVED', subscription: 'sub_forjada',
      externalReference: '99999999-9999-4999-8999-999999999999', value: 100, dueDate: '2030-01-01',
    }))
    expect(res.status).toBe(200)
    const findArgs = t.rpcCalls('billing_find_org').map((c) => c[2])
    expect(JSON.stringify(findArgs)).not.toContain('sub_forjada')
    expect(JSON.stringify(findArgs)).not.toContain('99999999')
    expect(t.rpcCalls('billing_apply_event')[0][2]).toEqual({
      p_event_id: 'evt_1',
      p_event: 'PAYMENT_RECEIVED',
      p_org: ORG,
      p_subscription_id: 'sub_real',
      p_cycle: 'monthly',
      p_payment: {
        id: 'pay_1', status: 'RECEIVED', billingType: 'CREDIT_CARD', dueDate: '2026-11-11',
        invoiceUrl: null, customer: 'cus_1', subscription: 'sub_real', externalReference: ORG,
        value: 19.9, checkout_id: 'chk_30',
      },
    })
  })

  it('assinatura já conhecida: ainda assim manda o checkout de origem e o ciclo', async () => {
    const t = setup({
      rpc: { billing_find_org: (args) => (args.p_subscription_id === 'sub_real' ? ORG : null) },
      asaas: (_method, path) =>
        path === '/payments/pay_1' ? realPayment : { id: 'sub_real', cycle: 'YEARLY', checkoutSession: 'chk_y' },
    })
    await t.send(paidEvent({ id: 'pay_1' }))
    const args = t.rpcCalls('billing_apply_event')[0][2] as { p_cycle: string; p_payment: { checkout_id: string } }
    expect(args.p_cycle).toBe('yearly')
    expect(args.p_payment.checkout_id).toBe('chk_y')
    expect(t.rpcCalls('billing_find_org')).toHaveLength(1)
  })

  it('pagamento que o Asaas não confirma não libera nada', async () => {
    const t = setup({ asaas: () => ({ ...realPayment, status: 'PENDING' }) })
    const res = await t.send(paidEvent({ id: 'pay_1', status: 'RECEIVED' }))
    expect(await res.json()).toEqual({ ok: true, outcome: 'pagamento_nao_confirmado' })
    expect(t.rpcCalls('billing_apply_event')).toEqual([])
  })

  it('falha no banco responde 500 para o Asaas tentar de novo', async () => {
    const t = setup({
      rpc: {
        billing_find_org: () => ORG,
        billing_apply_event: () => {
          throw new HttpError(500, 'falha em billing_apply_event')
        },
      },
      asaas: (_m, path) => (path === '/payments/pay_1' ? realPayment : { id: 'sub_real', cycle: 'MONTHLY' }),
    })
    const res = await t.send(paidEvent({ id: 'pay_1' }))
    expect(res.status).toBe(500)
  })
})

describe('billing-webhook: eventos sem pagamento confirmado', () => {
  it('fatura criada de assinatura conhecida não consulta o Asaas e não manda checkout', async () => {
    const t = setup({ rpc: { billing_find_org: () => ORG } })
    const res = await t.send({
      id: 'evt_2', event: 'PAYMENT_CREATED',
      payment: { id: 'pay_2', status: 'PENDING', billingType: 'PIX', subscription: 'sub_1', dueDate: '2026-11-11' },
    })
    expect(res.status).toBe(200)
    expect(t.calls.some((c) => c[0] === 'asaas')).toBe(false)
    const args = t.rpcCalls('billing_apply_event')[0][2] as { p_payment: { checkout_id: unknown } }
    expect(args.p_payment.checkout_id).toBeNull()
  })

  it('evento que o app não trata responde 200 sem nada', async () => {
    const t = setup()
    const res = await t.send({ id: 'evt_3', event: 'ACCOUNT_STATUS_UPDATED' })
    expect(await res.json()).toEqual({ ok: true, outcome: 'nao_tratado' })
    expect(t.calls).toEqual([])
  })
})

describe('billing-webhook: fila de cancelamento', () => {
  it('cancela as substituídas no Asaas; 404 conta como cancelada; falha fica para a próxima', async () => {
    const t = setup({
      rpc: {
        billing_find_org: () => ORG,
        billing_cancellations_due: () => [
          { subscription_id: 'sub_old' }, { subscription_id: 'sub_gone' }, { subscription_id: 'sub_err' },
        ],
      },
      asaas: (method, path) => {
        if (method !== 'DELETE') throw new Error(path)
        if (path === '/subscriptions/sub_gone') throw new HttpError(404, 'não encontrada')
        if (path === '/subscriptions/sub_err') throw new HttpError(502, 'Asaas fora do ar')
        return null
      },
    })
    const res = await t.send({ id: 'evt_4', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_x' } })
    expect(res.status).toBe(200)
    expect(t.rpcCalls('billing_cancellation_done').map((c) => c[2])).toEqual([
      { p_subscription_id: 'sub_old' },
      { p_subscription_id: 'sub_gone' },
    ])
    expect(t.rpcCalls('billing_cancellation_failed').map((c) => c[2])).toEqual([
      { p_subscription_id: 'sub_err', p_error: 'Asaas fora do ar' },
    ])
  })

  it('fila ilegível não derruba o webhook (o evento já foi gravado)', async () => {
    const t = setup({
      rpc: {
        billing_find_org: () => ORG,
        billing_cancellations_due: () => {
          throw new Error('função ausente')
        },
      },
    })
    const res = await t.send({ id: 'evt_5', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_x' } })
    expect(res.status).toBe(200)
  })
})
