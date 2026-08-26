// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import AvaliacaoNova from './AvaliacaoNova'

vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org-1' } }),
}))

vi.mock('../features/subjects/hooks', () => ({
  useSubject: () => ({
    data: {
      id: 'subject-1',
      full_name: 'Pessoa Teste',
      birth_date: '1990-01-01',
      sex: 'M',
      height_cm: 178,
    },
    isPending: false,
    isError: false,
  }),
}))

vi.mock('../features/consent/hooks', () => ({
  useActiveConsent: () => ({ data: { id: 'consent-1' }, isPending: false }),
}))

vi.mock('../features/assessment/hooks', () => ({
  useAssessment: () => ({ data: null, isPending: false }),
  useCreateAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('AvaliacaoNova — nomes acessíveis', () => {
  it('associa labels aos campos, às dobras e aos medicamentos', () => {
    render(
      <MemoryRouter initialEntries={['/avaliados/subject-1/avaliacoes/nova']}>
        <Routes>
          <Route
            path="/avaliados/:id/avaliacoes/nova"
            element={<AvaliacaoNova />}
          />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByLabelText('Data')).toBeTruthy()
    expect(screen.getByLabelText('Protocolo')).toBeTruthy()
    expect(screen.getByLabelText('Peso (kg)')).toBeTruthy()
    expect(screen.getByLabelText('Altura (cm)')).toBeTruthy()
    expect(screen.getAllByLabelText(/aferição 1$/).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Medicamentos em uso')).toBeTruthy()
    expect(screen.getByLabelText('Observações (opcional)')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(screen.getByLabelText('Nome da circunferência personalizada 1')).toBeTruthy()
    expect(
      screen.getByLabelText('Medida da circunferência personalizada 1 em centímetros')
    ).toBeTruthy()
  })
})
