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

vi.mock('../features/auth/context', () => ({
  useAuth: () => ({ user: { email: 'dono@estudio.test' } }),
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

function renderPage(data: OrgBilling, client = new QueryClient()) {
  useOrgBillingMock.mockReturnValue({ data, isPending: false, isError: false, refetch: vi.fn() })
  return render(
    <QueryClientProvider client={client}>
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
  it('em teste, assina o plano anual com cartão e vai para o checkout', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    billingRequestMock.mockResolvedValue({ url: 'https://sandbox.asaas.com/checkoutSession/show?id=chk' })
    renderPage(billing())

    expect(screen.getByText('Teste grátis')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Anual/ }))
    expect(screen.getByText('R$ 499,00')).toBeTruthy()
    expect(screen.getByText(/Economia de R\$ 99,80/)).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Assinar' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Pagar com cartão' }))
    await waitFor(() =>
      expect(billingRequestMock).toHaveBeenCalledWith('org-1', {
        action: 'checkout', plan: 'ate30', cycle: 'yearly', method: 'card',
      })
    )
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://sandbox.asaas.com/checkoutSession/show?id=chk'))
  })

  it('Pix pede nome e CPF válido e mostra o link da fatura', async () => {
    vi.stubGlobal('scrollTo', vi.fn())
    billingRequestMock.mockResolvedValue({ url: 'https://sandbox.asaas.com/i/pay_1', method: 'pix' })
    renderPage(billing())

    fireEvent.click(screen.getAllByRole('button', { name: 'Assinar' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'Pagar com Pix' }))
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Fulana de Tal' } })
    fireEvent.change(screen.getByLabelText('CPF ou CNPJ'), { target: { value: '529.982.247-24' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Pix' }))
    expect(screen.getByText('CPF ou CNPJ inválido.')).toBeTruthy()
    expect(billingRequestMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('CPF ou CNPJ'), { target: { value: '529.982.247-25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Pix' }))
    await waitFor(() =>
      expect(billingRequestMock).toHaveBeenCalledWith('org-1', {
        action: 'checkout', plan: 'ilimitado', cycle: 'monthly', method: 'pix',
        name: 'Fulana de Tal', cpf_cnpj: '529.982.247-25', email: 'dono@estudio.test',
      })
    )
    const link = await screen.findByRole('link', { name: /Pagar com Pix/ })
    expect(link.getAttribute('href')).toBe('https://sandbox.asaas.com/i/pay_1')
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

  it('Pix gerado e não pago: dá para pagar, assinar de outro jeito ou desistir', async () => {
    billingRequestMock.mockResolvedValue({ ok: true })
    // antes da 0052 o banco marcava has_subscription no Pix pendente do teste
    renderPage(
      billing({
        has_subscription: true,
        billing_cycle: 'yearly',
        pending_invoice_url: 'https://sandbox.asaas.com/i/pay_p1',
        pending_due_date: '2026-10-21',
        pending_plan_id: 'ate30',
        pending_cycle: 'yearly',
      })
    )

    expect(screen.getByText(/Pix gerado para o plano Até 30 \(anual\), vence em 21\/10\/2026/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Pagar fatura/ }).getAttribute('href')).toBe('https://sandbox.asaas.com/i/pay_p1')
    // sem "Trocar plano" nem "Cancelar assinatura", que o servidor recusa
    expect(screen.getByRole('heading', { name: 'Escolha seu plano' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancelar assinatura' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Assinar' }).length).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Desistir deste Pix' }))
    fireEvent.click(screen.getByRole('button', { name: 'Desistir do Pix' }))
    await waitFor(() => expect(billingRequestMock).toHaveBeenCalledWith('org-1', { action: 'cancel' }))
  })

  it('trocar de plano confirma sem botão de ação destrutiva', () => {
    renderPage(
      billing({ status: 'active', billing_cycle: 'monthly', has_subscription: true, current_period_end: '2026-11-17T03:00:00Z' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Trocar para este' }))
    const confirm = screen.getByRole('button', { name: 'Trocar plano' })
    expect(confirm.className).not.toMatch(/bg-destructive/)
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

describe('Plano: falhas e teclado', () => {
  it('as setas trocam mensal e anual, como o role="radio" promete', () => {
    renderPage(billing())
    const mensal = screen.getByRole('radio', { name: /Mensal/ })
    expect(mensal.getAttribute('tabindex')).toBe('0')
    mensal.focus()
    fireEvent.keyDown(mensal, { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: /Anual/ }).getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: /Anual/ }))
    expect(screen.getByText('R$ 499,00')).toBeTruthy()
  })

  // A function cria a assinatura e grava o pendente antes de procurar a fatura;
  // se a fatura demora, ela responde 502 dizendo que a fatura "aparece nesta
  // tela em instantes". Sem reler o estado, a tela nunca mostrava o Pix.
  it('depois de uma falha, relê o estado da assinatura', async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    billingRequestMock.mockRejectedValue(new Error('A fatura Pix ainda está sendo gerada. Ela aparece nesta tela em instantes.'))
    renderPage(billing(), client)
    fireEvent.click(screen.getAllByRole('button', { name: 'Assinar' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Pagar com Pix' }))
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Maria da Silva' } })
    fireEvent.change(screen.getByLabelText('CPF ou CNPJ'), { target: { value: '529.982.247-25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Pix' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/aparece nesta tela/)
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['billing', 'org-1'] }))
  })
})
