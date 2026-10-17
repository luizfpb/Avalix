// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Plano from './Plano'
import type { OrgBilling } from '../features/billing/rules'

const { useOrgBillingMock, billingRequestMock } = vi.hoisted(() => ({
  useOrgBillingMock: vi.fn(),
  billingRequestMock: vi.fn(),
}))

vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org-1', name: 'Estúdio', subject_term: 'aluno' }, role: 'owner' }),
}))

vi.mock('../features/billing/api', () => ({
  useOrgBilling: useOrgBillingMock,
  billingRequest: billingRequestMock,
}))

const PLANS = [
  { id: 'ate30', name: 'Até 30', monthly_price_brl: 49.9, yearly_price_brl: 499, max_subjects: 30 },
  { id: 'ilimitado', name: 'Ilimitado', monthly_price_brl: 89.9, yearly_price_brl: 899, max_subjects: null },
]

function billing(patch: Partial<OrgBilling> = {}): OrgBilling {
  return {
    status: 'trial',
    access: 'full',
    plan_id: 'ilimitado',
    plan_name: 'Ilimitado',
    max_subjects: null,
    active_subjects: 12,
    billing_cycle: null,
    trial_ends_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    current_period_end: null,
    grace_ends_at: null,
    has_subscription: false,
    canceled_at: null,
    pending_invoice_url: null,
    pending_due_date: null,
    can_manage: true,
    plans: PLANS,
    ...patch,
  }
}

function renderPage(data: OrgBilling) {
  useOrgBillingMock.mockReturnValue({ data, isPending: false, isError: false, refetch: vi.fn() })
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/configuracoes/plano']}>
        <Plano />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('Plano', () => {
  it('em teste, assina o plano anual escolhido e vai para o pagamento', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    billingRequestMock.mockResolvedValue({ url: 'https://sandbox.asaas.com/checkoutSession/show?id=chk' })
    renderPage(billing())

    expect(screen.getByText('Teste grátis')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Anual/ }))
    expect(screen.getByText('R$ 499,00')).toBeTruthy()
    expect(screen.getByText(/Economia de R\$ 99,80/)).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Assinar' })[0])
    await waitFor(() =>
      expect(billingRequestMock).toHaveBeenCalledWith('org-1', { action: 'checkout', plan: 'ate30', cycle: 'yearly' })
    )
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://sandbox.asaas.com/checkoutSession/show?id=chk'))
  })

  it('assinante vê o plano atual, não desce acima do limite e confirma antes de cancelar', async () => {
    billingRequestMock.mockResolvedValue({ ok: true })
    renderPage(
      billing({
        status: 'active',
        billing_cycle: 'monthly',
        has_subscription: true,
        active_subjects: 40,
        current_period_end: '2026-11-17T03:00:00Z',
      })
    )

    expect(screen.getByRole('button', { name: 'Plano atual' })).toBeTruthy()
    expect(screen.getByText(/Você tem 40 alunos ativos/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar assinatura' }))
    expect(screen.getByText(/continua com acesso completo até 17\/11\/2026/)).toBeTruthy()
    const confirm = screen.getAllByRole('button', { name: 'Cancelar assinatura' }).at(-1)!
    fireEvent.click(confirm)
    await waitFor(() => expect(billingRequestMock).toHaveBeenCalledWith('org-1', { action: 'cancel' }))
  })

  it('mostra a fatura em aberto com link para pagar', () => {
    renderPage(
      billing({
        status: 'past_due',
        access: 'grace',
        has_subscription: true,
        billing_cycle: 'monthly',
        current_period_end: '2026-10-15T03:00:00Z',
        grace_ends_at: '2026-10-20T03:00:00Z',
        pending_invoice_url: 'https://sandbox.asaas.com/i/pay_2',
        pending_due_date: '2026-10-15',
      })
    )
    expect(screen.getByText(/vence em 15\/10\/2026/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Pagar fatura/ }).getAttribute('href')).toBe('https://sandbox.asaas.com/i/pay_2')
  })

  it('cortesia não oferece planos', () => {
    renderPage(billing({ status: 'courtesy', trial_ends_at: null }))
    expect(screen.getByText(/acesso de cortesia/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Assinar' })).toBeNull()
  })

  it('membro sem permissão só vê o estado', () => {
    renderPage(billing({ can_manage: false }))
    expect(screen.getByText(/Só o dono ou um administrador/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Assinar' })).toBeNull()
  })
})
