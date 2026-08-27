// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./routes/RouteGuard', () => ({
  RouteGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('./components/AppShell', async () => {
  const { Outlet } = await vi.importActual<typeof import('react-router')>('react-router')
  return { AppShell: () => <Outlet /> }
})

vi.mock('./pages/Dashboard', () => ({
  default: () => <div>Painel de teste</div>,
}))

function LocationProbe() {
  return <output aria-label="Caminho atual">{useLocation().pathname}</output>
}

afterEach(cleanup)

describe('rotas legadas', () => {
  it('redireciona /carteira para /dashboard e renderiza o destino', async () => {
    render(
      <MemoryRouter initialEntries={['/carteira']}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    )

    await screen.findByText('Painel de teste')
    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Caminho atual' }).textContent).toBe('/dashboard')
    })
  })
})
