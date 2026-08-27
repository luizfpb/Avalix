// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }))

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
  it('oferece exatamente Início, o termo da organização e Ajustes no desktop e no mobile', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppShell />
      </MemoryRouter>
    )

    const navigations = screen.getAllByRole('navigation', { name: 'Navegação principal' })
    expect(navigations).toHaveLength(2)

    for (const navigation of navigations) {
      const links = within(navigation).getAllByRole('link')
      expect(links).toHaveLength(3)
      expect(links.map((link) => link.textContent)).toEqual(['Início', 'Atletas', 'Ajustes'])
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '/dashboard',
        '/avaliados',
        '/configuracoes',
      ])
      expect(within(navigation).queryByText('Agenda')).toBeNull()
      expect(within(navigation).queryByText('Carteira')).toBeNull()
    }
  })
})
