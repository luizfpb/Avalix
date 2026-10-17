// Apresentação da assinatura. A regra de acesso é do banco (app.org_access,
// migration 0049); aqui só se decide o que mostrar com o estado que ele devolve.

export type BillingStatus = 'courtesy' | 'trial' | 'active' | 'past_due' | 'canceled'
export type BillingAccess = 'full' | 'grace' | 'blocked'
export type BillingCycle = 'monthly' | 'yearly'

export type BillingPlan = {
  id: string
  name: string
  monthly_price_brl: number
  yearly_price_brl: number
  max_subjects: number | null
}

export type OrgBilling = {
  status: BillingStatus
  access: BillingAccess
  plan_id: string | null
  plan_name: string | null
  max_subjects: number | null
  active_subjects: number
  billing_cycle: BillingCycle | null
  trial_ends_at: string | null
  current_period_end: string | null
  grace_ends_at: string | null
  has_subscription: boolean
  canceled_at: string | null
  pending_invoice_url: string | null
  pending_due_date: string | null
  can_manage: boolean
  plans: BillingPlan[]
}

// Pedido de reembolso (arrependimento em 7 dias, CDC art. 49) e dúvidas.
export const SUPPORT_EMAIL = 'contato@avalixfit.com.br'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(value: number): string {
  return BRL.format(value)
}

const DATE = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
})

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  // data pura (YYYY-MM-DD) é data civil: meio-dia evita cair no dia anterior
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00-03:00`) : new Date(iso)
  return Number.isNaN(date.getTime()) ? '-' : DATE.format(date)
}

// Dias inteiros que faltam, arredondando para cima: 1h restante ainda é "1 dia".
export function daysLeft(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null
  const end = new Date(iso).getTime()
  if (Number.isNaN(end)) return null
  return Math.max(0, Math.ceil((end - now.getTime()) / 86_400_000))
}

// Quanto o anual economiza em relação a 12 mensalidades.
export function yearlySavings(plan: Pick<BillingPlan, 'monthly_price_brl' | 'yearly_price_brl'>): number {
  return Math.max(0, Math.round((plan.monthly_price_brl * 12 - plan.yearly_price_brl) * 100) / 100)
}

export function monthlyEquivalent(plan: Pick<BillingPlan, 'yearly_price_brl'>): number {
  return Math.round((plan.yearly_price_brl / 12) * 100) / 100
}

export function planLimitLabel(max: number | null, subjectPlural: string): string {
  return max === null ? `${capitalize(subjectPlural)} ilimitados` : `Até ${max} ${subjectPlural} ativos`
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

export type BannerTone = 'info' | 'warn' | 'danger'
export type Banner = { tone: BannerTone; text: string; cta: string }

// Faixa no topo do app. Só aparece quando há algo a fazer: teste acabando,
// pagamento em atraso, assinatura bloqueada ou limite do plano batendo.
export function billingBanner(b: OrgBilling, now: Date, subjectPlural: string): Banner | null {
  if (b.status === 'courtesy') return null

  if (b.access === 'blocked') {
    const text =
      b.status === 'trial'
        ? 'Seu teste grátis terminou. Seus dados estão guardados; assine para voltar a criar e editar.'
        : b.status === 'canceled'
          ? 'Sua assinatura terminou. Seus dados estão guardados; assine de novo para voltar a criar e editar.'
          : 'Sua assinatura está suspensa por falta de pagamento. Seus dados estão guardados; regularize para voltar a criar e editar.'
    return { tone: 'danger', text, cta: b.status === 'past_due' ? 'Regularizar' : 'Assinar' }
  }

  if (b.access === 'grace') {
    const days = daysLeft(b.grace_ends_at, now)
    const when = days === null || days === 0
      ? ''
      : ` Em ${days} ${plural(days, 'dia', 'dias')} o acesso fica só leitura.`
    return { tone: 'warn', text: `Não identificamos o pagamento da sua assinatura.${when}`, cta: 'Pagar agora' }
  }

  if (b.status === 'trial') {
    const days = daysLeft(b.trial_ends_at, now)
    if (days !== null && days <= 5) {
      return {
        tone: 'info',
        text: days === 0
          ? 'Seu teste grátis termina hoje.'
          : `Seu teste grátis termina em ${days} ${plural(days, 'dia', 'dias')}.`,
        cta: 'Ver planos',
      }
    }
  }

  if (b.max_subjects !== null && b.active_subjects >= b.max_subjects) {
    return {
      tone: 'info',
      text: `Você chegou ao limite do plano: ${b.active_subjects} de ${b.max_subjects} ${subjectPlural} ativos.`,
      cta: 'Mudar de plano',
    }
  }

  return null
}

export function statusLabel(b: OrgBilling): string {
  switch (b.status) {
    case 'courtesy':
      return 'Cortesia'
    case 'trial':
      return b.access === 'blocked' ? 'Teste encerrado' : 'Teste grátis'
    case 'active':
      return b.access === 'full' ? 'Ativa' : b.access === 'grace' ? 'Pagamento pendente' : 'Suspensa'
    case 'past_due':
      return b.access === 'blocked' ? 'Suspensa' : 'Pagamento pendente'
    case 'canceled':
      return b.access === 'blocked' ? 'Encerrada' : 'Cancelada'
  }
}
