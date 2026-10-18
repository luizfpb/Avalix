import { describe, expect, it } from 'vitest'
import {
  billingBanner,
  daysLeft,
  formatDate,
  freeMonths,
  monthlyEquivalent,
  planLimitLabel,
  statusLabel,
  yearlySavings,
  type OrgBilling,
} from './rules'

const NOW = new Date('2026-10-17T15:00:00Z')

function billing(patch: Partial<OrgBilling> = {}): OrgBilling {
  return {
    status: 'active',
    access: 'full',
    plan_id: 'ate30',
    plan_name: 'Até 30',
    max_subjects: 30,
    active_subjects: 10,
    billing_cycle: 'monthly',
    trial_ends_at: null,
    current_period_end: '2026-11-17T03:00:00Z',
    grace_ends_at: '2026-11-22T03:00:00Z',
    has_subscription: true,
    canceled_at: null,
    pending_invoice_url: null,
    pending_due_date: null,
    can_manage: true,
    plans: [],
    ...patch,
  }
}

describe('preços', () => {
  const plan = { monthly_price_brl: 49.9, yearly_price_brl: 499 }
  it('anual sai por 10 mensalidades', () => {
    expect(yearlySavings(plan)).toBe(99.8)
    expect(monthlyEquivalent(plan)).toBe(41.58)
  })
  it('conta os meses grátis do anual pelos preços reais', () => {
    expect(freeMonths(plan)).toBe(2)
    expect(freeMonths({ monthly_price_brl: 19.9, yearly_price_brl: 159 })).toBe(4)
    expect(freeMonths({ monthly_price_brl: 39.9, yearly_price_brl: 319 })).toBe(4)
  })
  it('descreve o limite com o termo da organização', () => {
    expect(planLimitLabel(30, 'alunos')).toBe('Até 30 alunos ativos')
    expect(planLimitLabel(null, 'alunos')).toBe('Alunos ilimitados')
  })
})

describe('datas', () => {
  it('data pura não volta um dia por causa do fuso', () => {
    expect(formatDate('2026-11-17')).toBe('17/11/2026')
  })
  it('instante é mostrado no horário de Brasília', () => {
    expect(formatDate('2026-11-17T03:00:00Z')).toBe('17/11/2026')
    expect(formatDate(null)).toBe('-')
  })
  it('dias restantes arredondam para cima e não ficam negativos', () => {
    expect(daysLeft('2026-10-17T16:00:00Z', NOW)).toBe(1)
    expect(daysLeft('2026-10-20T15:00:00Z', NOW)).toBe(3)
    expect(daysLeft('2026-10-10T00:00:00Z', NOW)).toBe(0)
  })
})

describe('billingBanner', () => {
  it('cortesia e assinatura em dia não mostram nada', () => {
    expect(billingBanner(billing({ status: 'courtesy' }), NOW, 'alunos')).toBeNull()
    expect(billingBanner(billing(), NOW, 'alunos')).toBeNull()
  })

  it('mostra o teste grátis desde o primeiro dia e reforça nos últimos 5', () => {
    const trial = { status: 'trial' as const, has_subscription: false, current_period_end: null }
    expect(billingBanner(billing({ ...trial, trial_ends_at: '2026-10-31T15:00:00Z' }), NOW, 'alunos')).toMatchObject({
      tone: 'note',
      text: 'Você está no teste grátis de 14 dias: faltam 14 dias (até 31/10/2026). Todos os recursos estão liberados, sem precisar de cartão.',
    })
    expect(billingBanner(billing({ ...trial, trial_ends_at: '2026-10-20T15:00:00Z' }), NOW, 'alunos')).toMatchObject({
      tone: 'warn',
      text: 'Seu teste grátis termina em 3 dias (20/10/2026). Assine para continuar criando e editando.',
    })
  })

  it('carência diz quando o acesso fica só leitura', () => {
    expect(
      billingBanner(billing({ status: 'past_due', access: 'grace', grace_ends_at: '2026-10-19T15:00:00Z' }), NOW, 'alunos')
    ).toMatchObject({ tone: 'warn', cta: 'Pagar agora', text: expect.stringContaining('Em 2 dias o acesso fica só leitura') })
  })

  it('bloqueio explica que os dados continuam guardados', () => {
    const banner = billingBanner(billing({ status: 'trial', access: 'blocked' }), NOW, 'alunos')
    expect(banner?.tone).toBe('danger')
    expect(banner?.text).toContain('Seus dados estão guardados')
    expect(billingBanner(billing({ status: 'past_due', access: 'blocked' }), NOW, 'alunos')?.cta).toBe('Regularizar')
  })

  it('avisa quando bate o limite do plano', () => {
    expect(billingBanner(billing({ active_subjects: 30 }), NOW, 'alunos')?.text).toBe(
      'Você chegou ao limite do plano: 30 de 30 alunos ativos.'
    )
    expect(billingBanner(billing({ active_subjects: 30, max_subjects: null }), NOW, 'alunos')).toBeNull()
  })
})

describe('statusLabel', () => {
  it('nomeia cada situação', () => {
    expect(statusLabel(billing())).toBe('Ativa')
    expect(statusLabel(billing({ status: 'trial', access: 'full' }))).toBe('Teste grátis')
    expect(statusLabel(billing({ status: 'trial', access: 'blocked' }))).toBe('Teste encerrado')
    expect(statusLabel(billing({ status: 'past_due', access: 'grace' }))).toBe('Pagamento pendente')
    expect(statusLabel(billing({ status: 'canceled', access: 'full' }))).toBe('Cancelada')
    expect(statusLabel(billing({ status: 'canceled', access: 'blocked' }))).toBe('Encerrada')
  })
})
