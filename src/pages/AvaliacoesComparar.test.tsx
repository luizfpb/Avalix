// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import AvaliacoesComparar from './AvaliacoesComparar'

const { assessments } = vi.hoisted(() => ({
  assessments: [
    {
      id: 'assessment-2',
      assessed_at: '2026-08-20',
      created_at: '2026-08-20T10:00:00Z',
      protocol_id: 'pollock3',
      weight_kg: 78,
      height_cm: 178,
      results: null,
    },
    {
      id: 'assessment-1',
      assessed_at: '2026-08-20',
      created_at: '2026-08-20T09:00:00Z',
      protocol_id: 'pollock3',
      weight_kg: 80,
      height_cm: 178,
      results: null,
    },
  ],
}))

vi.mock('../features/subjects/hooks', () => ({
  useSubject: () => ({ data: { full_name: 'Pessoa Teste' }, isPending: false }),
}))

vi.mock('../features/assessment/hooks', () => ({
  useAssessments: () => ({ data: assessments, isPending: false }),
  useAssessment: (id: string) => ({
    data: {
      assessment: assessments.find((assessment) => assessment.id === id) ?? null,
      circumferences: [],
    },
    isPending: false,
  }),
}))

afterEach(cleanup)

describe('AvaliacoesComparar', () => {
  it('associa os dois selects aos respectivos rótulos', () => {
    render(
      <MemoryRouter initialEntries={['/avaliados/subject-1/comparar']}>
        <Routes>
          <Route path="/avaliados/:id/comparar" element={<AvaliacoesComparar />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByLabelText('De (antes)')).toBeTruthy()
    expect(screen.getByLabelText('Para (depois)')).toBeTruthy()
  })

  it('distingue avaliações feitas no mesmo dia pelo horário de registro', () => {
    render(
      <MemoryRouter initialEntries={['/avaliados/subject-1/comparar']}>
        <Routes>
          <Route path="/avaliados/:id/comparar" element={<AvaliacoesComparar />} />
        </Routes>
      </MemoryRouter>
    )

    const labels = screen.getAllByRole('option').map((option) => option.textContent)
    expect(labels.some((label) => label?.includes('registro 09:00'))).toBe(true)
    expect(labels.some((label) => label?.includes('registro 10:00'))).toBe(true)
  })
})
