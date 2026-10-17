// Regras puras da cobrança (sem Deno e sem rede), compartilhadas pelas Edge
// Functions `billing` e `billing-webhook` e testadas no vitest.
//
// A regra de acesso (teste, carência, bloqueio) mora no banco
// (app.org_access, migration 0049). Aqui fica só o que conversa com o Asaas:
// montar o checkout, ler o webhook e comparar o token.

export type Cycle = 'monthly' | 'yearly'

export const CYCLES: readonly Cycle[] = ['monthly', 'yearly']

export function isCycle(value: unknown): value is Cycle {
  return value === 'monthly' || value === 'yearly'
}

export function asaasCycle(cycle: Cycle): 'MONTHLY' | 'YEARLY' {
  return cycle === 'yearly' ? 'YEARLY' : 'MONTHLY'
}

export function cycleFromAsaas(value: unknown): Cycle | null {
  if (value === 'MONTHLY') return 'monthly'
  if (value === 'YEARLY') return 'yearly'
  return null
}

export type PlanPrice = {
  name: string
  monthly_price_brl: number | null
  yearly_price_brl: number | null
  max_subjects: number | null
}

export function planValue(plan: PlanPrice, cycle: Cycle): number | null {
  const value = cycle === 'yearly' ? plan.yearly_price_brl : plan.monthly_price_brl
  return typeof value === 'number' && value > 0 ? value : null
}

// Data civil de São Paulo (YYYY-MM-DD). O Asaas trata vencimento como data,
// e "hoje" às 22h de Brasília já é amanhã em UTC.
export function saoPauloDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function cycleLabel(cycle: Cycle): string {
  return cycle === 'yearly' ? 'anual' : 'mensal'
}

export type CheckoutInput = {
  orgId: string
  planName: string
  cycle: Cycle
  value: number
  today: string
  appUrl: string
  imageBase64: string
}

// Corpo do POST /v3/checkouts. O checkout recorrente do Asaas só aceita
// cartão ("CREDIT_CARD é o único método permitido para RECURRENT"); o Pix
// vai por assinatura criada direto na API (pixSubscriptionBody). Primeira
// cobrança hoje. O org_id vai como referência externa para o webhook achar a
// organização mesmo se o checkout guardado tiver sido substituído.
export function checkoutBody(input: CheckoutInput) {
  const base = input.appUrl.replace(/\/+$/, '')
  const back = (status: string) => `${base}/configuracoes/plano?retorno=${status}`
  return {
    billingTypes: ['CREDIT_CARD'],
    chargeTypes: ['RECURRENT'],
    minutesToExpire: 60,
    externalReference: input.orgId,
    callback: {
      successUrl: back('ok'),
      cancelUrl: back('cancelado'),
      expiredUrl: back('expirado'),
    },
    items: [
      {
        name: `Avalix ${input.planName}`.slice(0, 30),
        description: `Assinatura ${cycleLabel(input.cycle)} do Avalix`.slice(0, 150),
        quantity: 1,
        value: input.value,
        imageBase64: input.imageBase64,
      },
    ],
    subscription: {
      cycle: asaasCycle(input.cycle),
      nextDueDate: input.today,
    },
  }
}

// Assinatura Pix (POST /v3/subscriptions): o Asaas gera uma fatura Pix por
// ciclo e avisa o cliente; a primeira vence hoje. A referência externa é o
// org_id, que o webhook usa para achar a organização.
export function pixSubscriptionBody(input: {
  customerId: string
  orgId: string
  planName: string
  cycle: Cycle
  value: number
  today: string
}) {
  return {
    customer: input.customerId,
    billingType: 'PIX',
    value: input.value,
    nextDueDate: input.today,
    cycle: asaasCycle(input.cycle),
    description: `Avalix ${input.planName} (${cycleLabel(input.cycle)})`,
    externalReference: input.orgId,
  }
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function cpfValid(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false
  const check = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return check(9) === Number(d[9]) && check(10) === Number(d[10])
}

function cnpjValid(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false
  const check = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  return check(12) === Number(d[12]) && check(13) === Number(d[13])
}

// CPF ou CNPJ com dígitos verificadores válidos (o Asaas recusa o resto).
export function validCpfCnpj(value: string): boolean {
  const d = onlyDigits(value)
  return d.length === 11 ? cpfValid(d) : d.length === 14 ? cnpjValid(d) : false
}

// Comparação em tempo constante para o token do webhook.
export function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const x = encoder.encode(a)
  const y = encoder.encode(b)
  const length = Math.max(x.length, y.length)
  let diff = x.length ^ y.length
  for (let i = 0; i < length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

// Eventos que mudam alguma coisa no banco. Os demais recebem 200 e são
// descartados sem consulta extra ao Asaas.
export const HANDLED_EVENTS = new Set([
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'SUBSCRIPTION_DELETED',
  'SUBSCRIPTION_INACTIVATED',
])

export const PAID_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'])

export const PAID_STATUSES = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'])

// O que vai para o banco: só os campos que a regra usa. Nome, CPF e cartão
// do pagador nunca saem do Asaas.
export type PaymentFields = {
  id: string | null
  status: string | null
  billingType: string | null
  dueDate: string | null
  invoiceUrl: string | null
  customer: string | null
}

function str(value: unknown, max = 300): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function paymentFields(payment: Record<string, unknown>): PaymentFields {
  const invoiceUrl = str(payment.invoiceUrl, 2000)
  return {
    id: str(payment.id),
    status: str(payment.status),
    billingType: str(payment.billingType),
    dueDate: str(payment.dueDate),
    invoiceUrl: invoiceUrl && invoiceUrl.startsWith('https://') ? invoiceUrl : null,
    customer: str(payment.customer),
  }
}

export type WebhookEvent = {
  eventId: string
  event: string
  subscriptionId: string | null
  externalReference: string | null
  payment: PaymentFields | null
}

export function parseWebhook(body: unknown): WebhookEvent | null {
  const root = obj(body)
  if (!root) return null
  const eventId = str(root.id, 200)
  const event = str(root.event, 80)
  if (!eventId || !event) return null

  const payment = obj(root.payment)
  if (payment) {
    return {
      eventId,
      event,
      subscriptionId: str(payment.subscription),
      externalReference: str(payment.externalReference, 200),
      payment: paymentFields(payment),
    }
  }
  const subscription = obj(root.subscription)
  return {
    eventId,
    event,
    subscriptionId: subscription ? str(subscription.id) : null,
    externalReference: subscription ? str(subscription.externalReference, 200) : null,
    payment: null,
  }
}
