// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import PosturaSessaoNova from './PosturaSessaoNova'

vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org-1' } }),
}))

vi.mock('../features/subjects/hooks', () => ({
  useSubject: () => ({
    data: { id: 'subject-1', full_name: 'Pessoa Teste' },
    isPending: false,
  }),
}))

vi.mock('../features/consent/hooks', () => ({
  useActiveConsent: () => ({ data: { id: 'consent-1' }, isPending: false }),
}))

const { criar } = vi.hoisted(() => ({ criar: vi.fn() }))
vi.mock('../features/posture/hooks', () => ({
  useCreateSession: () => ({ mutateAsync: criar, isPending: false }),
}))

afterEach(cleanup)

describe('PosturaSessaoNova', () => {
  it('associa nomes acessíveis à data e às observações', () => {
    render(
      <MemoryRouter initialEntries={['/avaliados/subject-1/postural/nova']}>
        <Routes>
          <Route
            path="/avaliados/:id/postural/nova"
            element={<PosturaSessaoNova />}
          />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByLabelText('Data')).toBeTruthy()
    expect(screen.getByLabelText('Observações (opcional)')).toBeTruthy()
  })

  // Resposta perdida depois de gravar: o segundo "Criar sessão" deixava uma
  // sessão vazia a mais na ficha. As duas tentativas levam a mesma identidade.
  it('a nova tentativa depois de uma resposta perdida leva a mesma identidade', async () => {
    criar.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ id: 'sessao-1' })
    render(
      <MemoryRouter initialEntries={['/avaliados/subject-1/postural/nova']}>
        <Routes>
          <Route path="/avaliados/:id/postural/nova" element={<PosturaSessaoNova />} />
          <Route path="/avaliados/:id/postural/:sessionId" element={<p>sessão</p>} />
        </Routes>
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Criar sessão' }))
    expect((await screen.findByText(/conexão/i)).textContent).toMatch(/tente de novo/)
    fireEvent.click(screen.getByRole('button', { name: 'Criar sessão' }))
    expect(await screen.findByText('sessão')).toBeTruthy()
    await waitFor(() => expect(criar).toHaveBeenCalledTimes(2))
    const [primeira, segunda] = criar.mock.calls.map((call) => (call[0] as { id?: string }).id)
    expect(primeira).toMatch(/^[0-9a-f-]{36}$/)
    expect(segunda).toBe(primeira)
  })
})

