// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
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

vi.mock('../features/posture/hooks', () => ({
  useCreateSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
})
