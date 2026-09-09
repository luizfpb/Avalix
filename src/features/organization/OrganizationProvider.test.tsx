// @vitest-environment jsdom
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { request, identity } = vi.hoisted(() => ({ request: vi.fn(), identity: { id: 'user-a' } }))
vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => ({
    maybeSingle: request,
  }) }) }) }) }) },
}))
vi.mock('../../lib/errlog', () => ({ setErrlogOrg: vi.fn() }))
vi.mock('../auth/context', () => ({
  useAuth: () => ({ user: { id: identity.id }, status: 'signedIn', mfaStatus: 'ok', isRecovering: false }),
}))
import { OrganizationProvider } from './OrganizationProvider'
import { RouteGuard } from '../../routes/RouteGuard'

const organization = { id: 'org-a', name: 'Organização de teste' }
const membership = { org_id: 'org-a', user_id: 'user-a', role: 'owner' }

beforeEach(() => {
  identity.id = 'user-a'
  request.mockReset().mockResolvedValue({ data: null, error: new Error('Falha de conexão'), status: 503 })
})
afterEach(cleanup)

function setup(cached = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  if (cached) client.setQueryData(['organization', 'user-a'], { organization, membership })
  const unmounted = vi.fn()
  function Form() {
    useEffect(() => unmounted, [])
    return <input aria-label="Anotação" defaultValue="Original" />
  }
  const tree = () => <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={['/avaliados/novo']}>
      <OrganizationProvider><RouteGuard><Routes>
        <Route path="/avaliados/novo" element={<Form />} />
        <Route path="/onboarding" element={<p>Organização ausente</p>} />
      </Routes></RouteGuard></OrganizationProvider>
    </MemoryRouter>
  </QueryClientProvider>
  const view = render(tree())
  return { client, unmounted, tree, ...view }
}

describe('organização durante uma edição', () => {
  it('mantém formulário e preenchimento no erro transitório e na recuperação', async () => {
    const { client, unmounted } = setup()
    fireEvent.change(screen.getByLabelText('Anotação'), { target: { value: 'Ainda não salvo' } })
    await act(async () => { await client.refetchQueries({ queryKey: ['organization', 'user-a'] }) })
    expect(await screen.findByText(/Seu preenchimento foi mantido/)).toBeTruthy()
    expect(screen.getByLabelText('Anotação')).toHaveProperty('value', 'Ainda não salvo')
    expect(unmounted).not.toHaveBeenCalled()

    request.mockResolvedValue({ data: { ...membership, organizations: organization }, error: null, status: 200 })
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(screen.queryByText(/Seu preenchimento foi mantido/)).toBeNull())
    expect(screen.getByLabelText('Anotação')).toHaveProperty('value', 'Ainda não salvo')
    expect(unmounted).not.toHaveBeenCalled()
  })

  it('bloqueia quando o primeiro carregamento falha, sem dados anteriores', async () => {
    setup(false)
    expect(await screen.findByText('Não foi possível carregar sua organização.')).toBeTruthy()
    expect(screen.queryByLabelText('Anotação')).toBeNull()
  })

  it.each([401, 403])('bloqueia recusa de acesso HTTP %i mesmo com cache', async (status) => {
    const { client, unmounted } = setup()
    request.mockResolvedValue({ data: null, error: { message: 'Sem acesso' }, status })
    await act(async () => { await client.refetchQueries({ queryKey: ['organization', 'user-a'] }) })
    expect(await screen.findByText('Não foi possível carregar sua organização.')).toBeTruthy()
    expect(screen.queryByLabelText('Anotação')).toBeNull()
    expect(unmounted).toHaveBeenCalledOnce()
  })

  it('abandona o cache quando o servidor confirma que a membership não existe', async () => {
    const { client, unmounted } = setup()
    request.mockResolvedValue({ data: null, error: null, status: 200 })
    await act(async () => { await client.refetchQueries({ queryKey: ['organization', 'user-a'] }) })
    expect(await screen.findByText('Organização ausente')).toBeTruthy()
    expect(screen.queryByLabelText('Anotação')).toBeNull()
    expect(unmounted).toHaveBeenCalledOnce()
  })

  it('não reaproveita a organização da conta anterior quando a nova falha', async () => {
    const view = setup()
    identity.id = 'user-b'
    view.rerender(view.tree())
    expect(await screen.findByText('Não foi possível carregar sua organização.')).toBeTruthy()
    expect(screen.queryByLabelText('Anotação')).toBeNull()
  })
})
