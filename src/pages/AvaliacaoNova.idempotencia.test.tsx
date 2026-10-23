// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouterProvider, createMemoryRouter } from 'react-router'
import AvaliacaoNova from './AvaliacaoNova'
import type { CreateAssessmentInput } from '../features/assessment/api'

// Resposta perdida depois de o banco gravar: a tela dizia "Falha de conexão…
// tente de novo" e o segundo "Salvar" criava outra avaliação igual, que entrava
// na evolução e no PDF. As duas tentativas levam a mesma identidade, e a 0053
// devolve a avaliação já criada.
const { salvar } = vi.hoisted(() => ({ salvar: vi.fn() }))

vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org-1' } }),
}))
vi.mock('../features/subjects/hooks', () => ({
  useSubject: () => ({
    data: { id: 'subject-1', full_name: 'Pessoa Teste', birth_date: '1990-01-01', sex: 'M', height_cm: 178 },
    isPending: false,
    isError: false,
  }),
}))
vi.mock('../features/consent/hooks', () => ({
  useActiveConsent: () => ({ data: { id: 'consent-1' }, isPending: false }),
}))
vi.mock('../features/assessment/hooks', () => ({
  useAssessment: () => ({ data: null, isPending: false }),
  useCreateAssessment: () => ({ mutateAsync: salvar, isPending: false }),
  useUpdateAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('Nova avaliação com resposta perdida', () => {
  it('a nova tentativa leva a mesma identidade da primeira', async () => {
    salvar
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ id: 'avaliacao-1', updated_at: '2026-10-23T12:00:00Z' })
    render(
      <RouterProvider
        router={createMemoryRouter(
          [
            { path: '/avaliados/:id/avaliacoes/nova', element: <AvaliacaoNova /> },
            { path: '/avaliados/:id/avaliacoes/:assessmentId', element: <p>laudo</p> },
          ],
          { initialEntries: ['/avaliados/subject-1/avaliacoes/nova'] }
        )}
      />
    )
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '80' } })
    for (const campo of screen.getAllByLabelText(/aferição 1$/)) {
      fireEvent.change(campo, { target: { value: '15' } })
    }
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    expect((await screen.findByText(/conexão/i)).textContent).toMatch(/tente de novo/)
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    expect(await screen.findByText('laudo')).toBeTruthy()

    expect(salvar).toHaveBeenCalledTimes(2)
    const primeira = salvar.mock.calls[0][0] as CreateAssessmentInput
    const segunda = salvar.mock.calls[1][0] as CreateAssessmentInput
    expect(primeira.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(segunda.id).toBe(primeira.id)
  })
})
