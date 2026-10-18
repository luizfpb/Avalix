// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

const { signOutMock, useOrgBillingMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  useOrgBillingMock: vi.fn(() => ({ data: undefined as unknown })),
}))

vi.mock('../features/billing/api', () => ({
  useOrgBilling: useOrgBillingMock,
}))

vi.mock('../features/auth/context', () => ({
  useAuth: () => ({ user: { email: 'profissional@avalix.test' }, signOut: signOutMock }),
}))

vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({
    organization: { id: 'org-1', name: 'Equipe de teste', subject_term: 'atleta' },
    role: 'owner',
  }),
}))

vi.mock('../features/anamnesis/intakeHooks', () => ({
  usePendingIntakes: () => ({ data: [] }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AppShell — navegação principal', () => {
  it('oferece exatamente Início, o termo da organização, Plano e Ajustes no desktop e no mobile', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppShell />
      </MemoryRouter>
    )

    const navigations = screen.getAllByRole('navigation', { name: 'Navegação principal' })
    expect(navigations).toHaveLength(2)

    for (const navigation of navigations) {
      const links = within(navigation).getAllByRole('link')
      expect(links).toHaveLength(4)
      expect(links.map((link) => link.textContent)).toEqual(['Início', 'Atletas', 'Plano', 'Ajustes'])
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '/dashboard',
        '/avaliados',
        '/configuracoes/plano',
        '/configuracoes',
      ])
      expect(within(navigation).queryByText('Agenda')).toBeNull()
      expect(within(navigation).queryByText('Carteira')).toBeNull()
    }
  })
})

describe('AppShell — item ativo', () => {
  it('na tela do plano, só Plano fica ativo, não Ajustes', () => {
    render(
      <MemoryRouter initialEntries={['/configuracoes/plano']}>
        <AppShell />
      </MemoryRouter>
    )
    const [desktop] = screen.getAllByRole('navigation', { name: 'Navegação principal' })
    expect(within(desktop).getByRole('link', { name: 'Plano' }).getAttribute('aria-current')).toBe('page')
    expect(within(desktop).getByRole('link', { name: 'Ajustes' }).getAttribute('aria-current')).toBeNull()
  })
})

describe('AppShell — faixa da assinatura', () => {
  const blocked = {
    status: 'trial',
    access: 'blocked',
    max_subjects: null,
    active_subjects: 3,
    trial_ends_at: '2026-01-01T00:00:00Z',
    grace_ends_at: null,
    can_manage: true,
  }

  it('teste encerrado mostra o aviso com o caminho para assinar', () => {
    useOrgBillingMock.mockReturnValue({ data: blocked })
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppShell />
      </MemoryRouter>
    )
    expect(screen.getByRole('alert').textContent).toContain('Seu teste grátis terminou')
    expect(screen.getByRole('link', { name: 'Assinar' }).getAttribute('href')).toBe('/configuracoes/plano')
  })

  it('quem não gerencia a assinatura é orientado a avisar o dono', () => {
    useOrgBillingMock.mockReturnValue({ data: { ...blocked, can_manage: false } })
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppShell />
      </MemoryRouter>
    )
    expect(screen.queryByRole('link', { name: 'Assinar' })).toBeNull()
    expect(screen.getByText('Avise o dono da organização.')).toBeTruthy()
  })

  it('some na própria tela do plano', () => {
    useOrgBillingMock.mockReturnValue({ data: blocked })
    render(
      <MemoryRouter initialEntries={['/configuracoes/plano']}>
        <AppShell />
      </MemoryRouter>
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
