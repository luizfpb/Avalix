// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import AvaliadoDetalhe from './AvaliadoDetalhe'

vi.mock('../features/auth/context', () => ({ useAuth: () => ({ user: { id: 'user' } }) }))
vi.mock('../features/organization/context', () => ({ useOrganization: () => ({ organization: { id: 'org', name: 'Org' } }) }))
vi.mock('../features/subjects/api', () => ({ getSubject: async () => { throw new Error('Não deveria buscar: o avaliado está no cache fresco') } }))
vi.mock('../features/assessment/hooks', () => ({
  useAssessment: () => ({ data: null }), useAssessments: () => ({ data: [] }), useSubjectCircumferences: () => ({ data: [] }),
}))
vi.mock('../features/anamnesis/hooks', () => ({ useAnamneses: () => ({ data: [] }) }))
vi.mock('../features/anamnesis/intakeHooks', () => ({
  useSubjectIntakes: () => ({ data: [] }), useGenerateIntakeLink: () => ({ mutateAsync: async ({ subjectId }: { subjectId: string }) => ({ url: `https://example.test/a#token-anamnese-${subjectId}` }) }), useCancelIntake: () => ({}),
}))
vi.mock('../features/posture/hooks', () => ({ useSessions: () => ({ data: [] }) }))
vi.mock('../features/consent/hooks', () => ({
  useActiveConsent: () => ({ data: null }), useGrantConsent: () => ({}), useRevokeConsent: () => ({}),
}))
vi.mock('../features/workout/hooks', () => ({
  useWorkoutPlans: () => ({ data: [] }),
  useWorkoutLink: (subjectId: string) => ({ data: { id: `link-${subjectId}`, expires_at: '2026-10-01', sessions_count: 0 } }),
  useIssueWorkoutLink: (subjectId: string) => ({ mutateAsync: async () => ({ url: `https://example.test/t#token-ficticio-${subjectId}` }) }),
  useRevokeWorkoutLink: () => ({}),
}))
vi.mock('../features/workout/linkStore', () => ({ loadWorkoutLinkLocal: (id: string) => `https://example.test/t#token-local-${id}` }))
afterEach(cleanup)

it('não reutiliza o link de anamnese ao voltar diretamente a outro perfil', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  for (const [id, name] of [['alice', 'Alice Ficticia'], ['bruno', 'Bruno Ficticio']]) {
    qc.setQueryData(['subject', id], { id, full_name: name, birth_date: '1990-01-01', sex: 'F', is_active: true })
  }
  // Sequência produzida ao visitar Bruno, voltar à lista e abrir Alice.
  // POP de duas posições modela escolher Bruno no histórico do botão Voltar.
  const router = createMemoryRouter([
    { path: '/avaliados/:id', element: <AvaliadoDetalhe /> },
    { path: '/avaliados', element: <div>Lista</div> },
  ], { initialEntries: ['/avaliados/bruno', '/avaliados', '/avaliados/alice'], initialIndex: 2 })
  render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>)
  await screen.findByRole('heading', { name: 'Alice Ficticia' })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
  await waitFor(() => expect(screen.getByDisplayValue('https://example.test/a#token-anamnese-alice')).toBeTruthy())
  await act(async () => { await router.navigate(-2) })
  await screen.findByRole('heading', { name: 'Bruno Ficticio' })
  expect(screen.queryByDisplayValue('https://example.test/a#token-anamnese-alice')).toBeNull()
  expect(screen.getAllByRole('link', { name: 'WhatsApp' }).some((link) => decodeURIComponent(link.getAttribute('href')!).includes('token-anamnese-alice'))).toBe(false)
  qc.clear()
})
