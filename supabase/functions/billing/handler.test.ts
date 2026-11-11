import { describe, expect, it, vi } from 'vitest'
import type { AsaasMethod, BillingDeps } from '../_shared/deps.ts'
import { HttpError } from '../_shared/http.ts'
import { BUSY_MESSAGE, LOCK_SECONDS, createBillingHandler } from './handler.ts'

const ORG = '11111111-1111-4111-8111-111111111111'

const PLANS = {
  ate30: { name: 'Até 30', monthly_price_brl: 19.9, yearly_price_brl: 159, max_subjects: 30 },
  ilimitado: { name: 'Ilimitado', monthly_price_brl: 100, yearly_price_brl: 799, max_subjects: null },
}

function snapshot(over: Record<string, unknown> = {}) {
  return {
    org_id: ORG,
    org_name: 'Org',
    status: 'trial',
    access: 'full',
    plan_id: 'ilimitado',
    billing_cycle: null,
    asaas_subscription_id: null,
    has_pending: false,
    active_subjects: 3,
    plans: PLANS,
    ...over,
  }
}

type Call = [string, ...unknown[]]

function setup(opts: {
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>
  asaas?: (method: AsaasMethod, path: string, body?: unknown) => unknown
  asUser?: () => unknown
} = {}) {
  const calls: Call[] = []
  const rpc: Record<string, (args: Record<string, unknown>) => unknown> = {
    billing_try_lock: () => 'tok',
    billing_unlock: () => null,
    billing_snapshot: () => snapshot(),
    billing_checkout_started: () => null,
    billing_change_plan: () => ({ plan_id: 'ate30', billing_cycle: 'monthly' }),
    billing_mark_canceled: () => null,
    billing_discard_pending: () => null,
    ...opts.rpc,
  }
  const deps: BillingDeps = {
    asaas: (async (method: AsaasMethod, path: string, body?: unknown) => {
      calls.push(['asaas', method, path, body])
      if (!opts.asaas) throw new Error(`Asaas inesperado: ${method} ${path}`)
      return opts.asaas(method, path, body)
    }) as BillingDeps['asaas'],
    rpcService: (async (fn: string, args: Record<string, unknown>) => {
      calls.push(['rpc', fn, args])
      if (!rpc[fn]) throw new Error(`rpc inesperada: ${fn}`)
      return rpc[fn](args)
    }) as BillingDeps['rpcService'],
    rpcAsUser: (async (authorization: string, fn: string, args: Record<string, unknown>) => {
      calls.push(['user', fn, args, authorization])
      return opts.asUser ? opts.asUser() : ORG
    }) as BillingDeps['rpcAsUser'],
    env: (name: string, fallback?: string) => {
      if (name === 'APP_URL') return 'https://avalixfit.com.br'
      if (fallback) return fallback
      throw new Error(name)
    },
    checkoutUrl: (id) => `https://sandbox.asaas.com/checkoutSession/show?id=${id}`,
    now: () => new Date('2026-11-11T15:00:00Z'),
    sleep: vi.fn(async () => {}),
  }
  const handle = createBillingHandler(deps)
  const send = (body: unknown, headers: Record<string, string> = { Authorization: 'Bearer jwt' }) =>
    handle(
      new Request('https://fn.local/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      })
    )
  const rpcCalls = (fn: string) => calls.filter((c) => c[0] === 'rpc' && c[1] === fn)
  return { calls, send, rpcCalls, deps }
}

describe('billing: entrada e permissão', () => {
  it('sem login recusa antes de tocar no banco', async () => {
    const t = setup()
    const res = await t.send({ action: 'cancel', org_id: ORG }, {})
    expect(res.status).toBe(401)
    expect(t.calls).toEqual([])
  })

  it('ação desconhecida é recusada antes de pegar a trava', async () => {
    const t = setup()
    const res = await t.send({ action: 'apagar_tudo', org_id: ORG })
    expect(res.status).toBe(400)
    expect(t.calls).toEqual([])
  })

  it('quem não é owner/admin para na permissão, sem trava', async () => {
    const t = setup({
      asUser: () => {
        throw new HttpError(409, 'Só o dono ou um administrador da organização gerencia a assinatura.')
      },
    })
    const res = await t.send({ action: 'cancel', org_id: ORG })
    expect(res.status).toBe(409)
    expect(t.rpcCalls('billing_try_lock')).toEqual([])
  })
})

describe('billing: trava por organização', () => {
  it('pedido simultâneo da mesma organização é recusado sem falar com o Asaas', async () => {
    const t = setup({ rpc: { billing_try_lock: () => null } })
    const res = await t.send({ action: 'checkout', org_id: ORG, plan: 'ate30', cycle: 'monthly', method: 'card' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: BUSY_MESSAGE })
    expect(t.calls.some((c) => c[0] === 'asaas')).toBe(false)
    expect(t.rpcCalls('billing_unlock')).toEqual([])
  })

  it('solta a trava mesmo quando o Asaas falha', async () => {
    const t = setup({
      asaas: () => {
        throw new HttpError(502, 'O serviço de pagamento não respondeu.')
      },
    })
    const res = await t.send({ action: 'checkout', org_id: ORG, plan: 'ate30', cycle: 'monthly', method: 'card' })
    expect(res.status).toBe(502)
    expect(t.rpcCalls('billing_try_lock')).toEqual([['rpc', 'billing_try_lock', { p_org: ORG, p_seconds: LOCK_SECONDS }]])
    expect(t.rpcCalls('billing_unlock')).toEqual([['rpc', 'billing_unlock', { p_org: ORG, p_token: 'tok' }]])
  })
})

describe('billing: checkout', () => {
  it('cartão: preço do banco, checkout registrado com o plano escolhido, trava solta', async () => {
    const t = setup({ asaas: () => ({ id: 'chk_1', link: 'https://asaas/chk_1' }) })
    const res = await t.send({
      action: 'checkout', org_id: ORG, plan: 'ate30', cycle: 'monthly', method: 'card', value: 0.01,
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://asaas/chk_1' })
    const post = t.calls.find((c) => c[0] === 'asaas')!
    expect(post[1]).toBe('POST')
    expect(post[2]).toBe('/checkouts')
    expect((post[3] as { items: { value: number }[] }).items[0].value).toBe(19.9)
    expect(t.rpcCalls('billing_checkout_started')).toEqual([
      ['rpc', 'billing_checkout_started', { p_org: ORG, p_checkout_id: 'chk_1', p_plan: 'ate30', p_cycle: 'monthly' }],
    ])
    const order = t.calls.map((c) => `${c[0]}:${c[1]}`)
    expect(order).toEqual([
      'user:billing_manage_org',
      'rpc:billing_try_lock',
      'rpc:billing_snapshot',
      'asaas:POST',
      'rpc:billing_checkout_started',
      'rpc:billing_unlock',
    ])
  })

  it('Pix: remove o Pix anterior, cria cliente e assinatura e registra pix:<id>', async () => {
    const t = setup({
      rpc: { billing_snapshot: () => snapshot({ asaas_subscription_id: 'sub_old' }) },
      asaas: (method, path) => {
        if (method === 'DELETE') return null
        if (path.startsWith('/customers?')) return { data: [] }
        if (path === '/customers') return { id: 'cus_1' }
        if (path === '/subscriptions') return { id: 'sub_new' }
        if (path === '/subscriptions/sub_new/payments') return { data: [{ id: 'pay_1', invoiceUrl: 'https://asaas/i/pay_1' }] }
        throw new Error(path)
      },
    })
    const res = await t.send({
      action: 'checkout', org_id: ORG, plan: 'ate30', cycle: 'yearly', method: 'pix',
      name: 'Fulano de Tal', cpf_cnpj: '529.982.247-25',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://asaas/i/pay_1', method: 'pix' })
    expect(t.calls.filter((c) => c[0] === 'asaas').map((c) => `${c[1]} ${String(c[2]).split('?')[0]}`)).toEqual([
      'DELETE /subscriptions/sub_old',
      'GET /customers',
      'POST /customers',
      'POST /subscriptions',
      'GET /subscriptions/sub_new/payments',
    ])
    const sub = t.calls.find((c) => c[0] === 'asaas' && c[2] === '/subscriptions')!
    expect(sub[3]).toMatchObject({ value: 159, cycle: 'YEARLY', nextDueDate: '2026-11-11', externalReference: ORG })
    expect(t.rpcCalls('billing_checkout_started')[0][2]).toEqual({
      p_org: ORG, p_checkout_id: 'pix:sub_new', p_plan: 'ate30', p_cycle: 'yearly',
    })
  })

  it('não abre checkout para quem já tem assinatura em vigor', async () => {
    const t = setup({
      rpc: { billing_snapshot: () => snapshot({ status: 'active', asaas_subscription_id: 'sub_1' }) },
    })
    const res = await t.send({ action: 'checkout', org_id: ORG, plan: 'ate30', cycle: 'monthly', method: 'card' })
    expect(res.status).toBe(409)
    expect(t.calls.some((c) => c[0] === 'asaas')).toBe(false)
  })
})

describe('billing: troca de plano', () => {
  const active = () => snapshot({ status: 'active', plan_id: 'ate30', billing_cycle: 'monthly', asaas_subscription_id: 'sub_1' })

  it('banco primeiro, depois o Asaas com valor e ciclo do plano novo', async () => {
    const t = setup({ rpc: { billing_snapshot: active }, asaas: () => ({}) })
    const res = await t.send({ action: 'change', org_id: ORG, plan: 'ilimitado', cycle: 'monthly' })
    expect(res.status).toBe(200)
    expect(t.calls.filter((c) => c[0] === 'asaas')).toEqual([
      ['asaas', 'PUT', '/subscriptions/sub_1',
        { value: 100, cycle: 'MONTHLY', description: 'Avalix Ilimitado (mensal)', updatePendingPayments: true }],
    ])
    expect(t.rpcCalls('billing_change_plan')).toHaveLength(1)
  })

  it('resposta do Asaas perdida mas troca aplicada: confere e não desfaz', async () => {
    const t = setup({
      rpc: { billing_snapshot: active },
      asaas: (method) => {
        if (method === 'PUT') throw new HttpError(502, 'O serviço de pagamento não respondeu.')
        return { id: 'sub_1', value: 100, cycle: 'MONTHLY' }
      },
    })
    const res = await t.send({ action: 'change', org_id: ORG, plan: 'ilimitado', cycle: 'monthly' })
    expect(res.status).toBe(200)
    expect(t.rpcCalls('billing_change_plan')).toHaveLength(1)
  })

  it('Asaas recusou de fato: desfaz no banco para o plano anterior', async () => {
    const t = setup({
      rpc: { billing_snapshot: active },
      asaas: (method) => {
        if (method === 'PUT') throw new HttpError(502, 'Asaas recusou: valor inválido')
        return { id: 'sub_1', value: 19.9, cycle: 'MONTHLY' }
      },
    })
    const res = await t.send({ action: 'change', org_id: ORG, plan: 'ilimitado', cycle: 'monthly' })
    expect(res.status).toBe(502)
    expect(t.rpcCalls('billing_change_plan').map((c) => c[2])).toEqual([
      { p_org: ORG, p_plan: 'ilimitado', p_cycle: 'monthly' },
      { p_org: ORG, p_plan: 'ate30', p_cycle: 'monthly' },
    ])
  })

  it('sem conseguir conferir o Asaas: desfaz (na dúvida, não libera plano maior)', async () => {
    const t = setup({
      rpc: { billing_snapshot: active },
      asaas: () => {
        throw new HttpError(502, 'O serviço de pagamento não respondeu.')
      },
    })
    const res = await t.send({ action: 'change', org_id: ORG, plan: 'ilimitado', cycle: 'monthly' })
    expect(res.status).toBe(502)
    expect(t.rpcCalls('billing_change_plan')).toHaveLength(2)
    expect(t.rpcCalls('billing_unlock')).toHaveLength(1)
  })
})

describe('billing: cancelamento', () => {
  it('assinatura já removida no Asaas (404) é marcada cancelada aqui', async () => {
    const t = setup({
      rpc: { billing_snapshot: () => snapshot({ status: 'active', asaas_subscription_id: 'sub_1' }) },
      asaas: () => {
        throw new HttpError(404, 'não encontrada')
      },
    })
    const res = await t.send({ action: 'cancel', org_id: ORG })
    expect(res.status).toBe(200)
    expect(t.rpcCalls('billing_mark_canceled')).toHaveLength(1)
  })

  it('sem assinatura em vigor e com Pix pendente: desiste do Pix', async () => {
    const t = setup({
      rpc: { billing_snapshot: () => snapshot({ has_pending: true, asaas_subscription_id: 'sub_p' }) },
      asaas: () => null,
    })
    const res = await t.send({ action: 'cancel', org_id: ORG })
    expect(res.status).toBe(200)
    expect(t.calls.filter((c) => c[0] === 'asaas').map((c) => c[2])).toEqual(['/subscriptions/sub_p'])
    expect(t.rpcCalls('billing_discard_pending')).toHaveLength(1)
  })
})
