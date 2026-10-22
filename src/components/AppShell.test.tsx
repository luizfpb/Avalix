// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { ReadOnlyNotice } from './ReadOnlyGate'

const { signOutMock, useOrgBillingMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  useOrgBillingMock: vi.fn(() => ({ data: undefined as unknown })),
}))

vi.mock('../features/billing/api', () => ({
  useOrgBilling: useOrgBillingMock,
  useReadOnly: () => {
    const data = useOrgBillingMock().data as { access?: string; can_manage?: boolean } | undefined
    return { readOnly: data?.access === 'blocked', canManage: !!data?.can_manage }
  },
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

describe('AppShell — ferramentas', () => {
  it('Agenda, Exercícios e 1RM ficam num grupo à parte, só na barra lateral', () => {
    render(
      <MemoryRouter initialEntries={['/agenda']}>
        <AppShell />
      </MemoryRouter>
    )
    const tools = screen.getByRole('navigation', { name: 'Ferramentas' })
    const links = within(tools).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/agenda', '/exercicios', '/ferramentas/1rm'])
    expect(within(tools).getByRole('link', { name: 'Agenda' }).getAttribute('aria-current')).toBe('page')
    expect(document.title).toBe('Agenda · Avalix')
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

  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="*" element={<p>formulário</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
  }

  it('só leitura: formulário de criação abre o aviso no lugar dos campos', () => {
    useOrgBillingMock.mockReturnValue({ data: blocked })
    renderAt('/avaliados/s-1/avaliacoes/nova')
    expect(screen.getByRole('heading', { name: 'Conta em modo só leitura' })).toBeTruthy()
    expect(screen.queryByText('formulário')).toBeNull()
    expect(screen.getByRole('link', { name: 'Ver plano e cobrança' }).getAttribute('href')).toBe('/configuracoes/plano')
  })

  it('só leitura: corrigir o cadastro e consultar continuam abrindo', () => {
    useOrgBillingMock.mockReturnValue({ data: blocked })
    renderAt('/avaliados/s-1/editar')
    expect(screen.getByText('formulário')).toBeTruthy()
    cleanup()
    renderAt('/avaliados/s-1/avaliacoes/a-1')
    expect(screen.getByText('formulário')).toBeTruthy()
  })

  it('com acesso, o formulário abre normalmente', () => {
    useOrgBillingMock.mockReturnValue({ data: { ...blocked, access: 'full' } })
    renderAt('/avaliados/s-1/treinos/nova')
    expect(screen.getByText('formulário')).toBeTruthy()
  })

  it('só leitura: telas de consulta e registro abrem com o aviso', () => {
    useOrgBillingMock.mockReturnValue({ data: blocked })
    render(
      <MemoryRouter initialEntries={['/avaliados/s-1/treinos/p-1/execucao']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="*" element={<ReadOnlyNotice>O registro da sessão não será gravado.</ReadOnlyNotice>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText(/Conta em modo só leitura. O registro da sessão não será gravado./)).toBeTruthy()
  })
})
