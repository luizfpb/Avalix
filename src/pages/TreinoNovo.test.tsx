// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import TreinoNovo from './TreinoNovo'
import type { SaveWorkoutPlanInput } from '../features/workout/api'

// O builder é a tela mais longa do app e não tinha teste. Estes fixam as duas
// regras novas onde elas de fato acontecem — na interação, não no módulo puro:
// reps/RIR podem ficar em branco e chegam ao payload como null, e agrupar dois
// exercícios produz um bloco válido para o banco.

const { criarMock } = vi.hoisted(() => ({ criarMock: vi.fn() }))

vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org-1' } }),
}))

vi.mock('../features/subjects/hooks', () => ({
  useSubject: () => ({
    data: { id: 'subject-1', full_name: 'Pessoa Teste' },
    isPending: false,
    isError: false,
  }),
}))

const exercicio = (id: string, name: string, primary_muscle: string) => ({
  id,
  org_id: null,
  name,
  primary_muscle,
  secondary_muscles: [],
  equipment: 'barbell',
  movement_pattern: 'horizontal_push',
  is_unilateral: false,
  cues: null,
  created_by: null,
  created_at: 'x',
})

vi.mock('../features/workout/hooks', () => ({
  useExercises: () => ({
    data: [
      exercicio('ex-1', 'Supino reto', 'chest'),
      exercicio('ex-2', 'Crucifixo', 'chest'),
    ],
    isPending: false,
    isError: false,
  }),
  useWorkoutPlan: () => ({ data: null, isPending: false, isError: false }),
  useWorkoutPlans: () => ({ data: [] }),
  useCreateWorkoutPlan: () => ({ mutateAsync: criarMock, isPending: false }),
  useUpdateWorkoutPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateCustomExercise: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCustomExercise: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('../features/anamnesis/hooks', () => ({
  useAnamneses: () => ({ data: [], isPending: false, isError: false }),
}))

vi.mock('../features/assessment/hooks', () => ({
  useAssessments: () => ({ data: [] }),
}))

vi.mock('../features/posture/hooks', () => ({
  useSessions: () => ({ data: [] }),
}))

vi.mock('../features/auth/context', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

beforeEach(() => {
  localStorage.clear()
  criarMock.mockReset()
  criarMock.mockResolvedValue({ id: 'plan-1' })
})
afterEach(cleanup)

function abrir() {
  render(
    <MemoryRouter initialEntries={['/avaliados/subject-1/treinos/nova']}>
      <Routes>
        <Route path="/avaliados/:id/treinos/nova" element={<TreinoNovo />} />
      </Routes>
    </MemoryRouter>
  )
}

// Divisão A com os dois exercícios do catálogo, na ordem.
function montarDivisaoComDoisExercicios() {
  fireEvent.click(screen.getByRole('button', { name: /Adicionar divisão/ }))
  for (const nome of ['Supino reto', 'Crucifixo']) {
    fireEvent.click(screen.getByRole('button', { name: /Adicionar exercício/ }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(nome) }))
  }
}

function salvar() {
  fireEvent.change(screen.getByLabelText('Nome do plano'), { target: { value: 'Plano A' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar plano' }))
}

describe('TreinoNovo — reps e RIR em branco', () => {
  it('salva sem faixa de reps e sem RIR, em vez de recusar', async () => {
    abrir()
    montarDivisaoComDoisExercicios()

    fireEvent.change(screen.getByLabelText('Repetições de Supino reto na divisão A'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByLabelText('RIR de Supino reto na divisão A'), {
      target: { value: '' },
    })
    salvar()

    await vi.waitFor(() => expect(criarMock).toHaveBeenCalled())
    const enviado = criarMock.mock.calls[0][0] as SaveWorkoutPlanInput
    expect(enviado.days[0].exercises[0].reps).toBeNull()
    expect(enviado.days[0].exercises[0].rir).toBeNull()
    // o segundo exercício não foi tocado e mantém a prescrição padrão
    expect(enviado.days[0].exercises[1].reps).toBe('8-12')
  })
})

describe('TreinoNovo — agrupamentos', () => {
  it('agrupa dois exercícios numa super-série e grava o bloco', async () => {
    abrir()
    montarDivisaoComDoisExercicios()

    fireEvent.click(
      screen.getByRole('button', { name: 'Agrupar Crucifixo com o exercício acima' })
    )
    // o rótulo do bloco também é uma opção do select de tipo; a instrução de
    // execução é o que só existe no cabeçalho desenhado
    expect(screen.getByText(/sem descanso entre eles/)).toBeTruthy()
    salvar()

    await vi.waitFor(() => expect(criarMock).toHaveBeenCalled())
    const [a, b] = (criarMock.mock.calls[0][0] as SaveWorkoutPlanInput).days[0].exercises
    expect(a.groupKey).toBeTruthy()
    expect(a.groupKey).toBe(b.groupKey)
    expect([a.groupKind, b.groupKind]).toEqual(['superset', 'superset'])
  })

  it('troca o bloco para circuito e avisa quando as voltas divergem', () => {
    abrir()
    montarDivisaoComDoisExercicios()
    fireEvent.click(
      screen.getByRole('button', { name: 'Agrupar Crucifixo com o exercício acima' })
    )

    fireEvent.change(
      screen.getByLabelText('Tipo do bloco que começa em Supino reto'),
      { target: { value: 'circuit' } }
    )
    expect(screen.getByText(/no fim de cada volta/)).toBeTruthy()
    expect(screen.queryByText(/as séries de cada exercício são as voltas/)).toBeNull()

    // no circuito, séries = voltas: membros com séries diferentes são ambíguos
    fireEvent.change(screen.getByLabelText('Séries de Crucifixo na divisão A'), {
      target: { value: '5' },
    })
    expect(screen.getByText(/as séries de cada exercício são as voltas/)).toBeTruthy()
  })

  it('desagrupar desfaz o par', () => {
    abrir()
    montarDivisaoComDoisExercicios()
    fireEvent.click(
      screen.getByRole('button', { name: 'Agrupar Crucifixo com o exercício acima' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Tirar Crucifixo do bloco' }))
    expect(screen.queryByLabelText(/^Tipo do bloco/)).toBeNull()
  })

  it('a técnica de intensidade fica no exercício, e não no bloco', async () => {
    abrir()
    montarDivisaoComDoisExercicios()

    const selectTecnica = screen.getByLabelText(
      'Técnica de intensidade de Supino reto na divisão A'
    )
    fireEvent.change(selectTecnica, { target: { value: 'drop_set' } })
    expect((selectTecnica as HTMLSelectElement).value).toBe('drop_set')
    salvar()

    await vi.waitFor(() => expect(criarMock).toHaveBeenCalled())
    const enviado = criarMock.mock.calls[0][0] as SaveWorkoutPlanInput
    expect(enviado.days[0].exercises[0].technique).toBe('drop_set')
    expect(enviado.days[0].exercises[1].technique).toBeNull()
  })
})
