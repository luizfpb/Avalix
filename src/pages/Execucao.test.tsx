// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouterProvider, createMemoryRouter } from 'react-router'
import Execucao from './Execucao'
import type { WorkoutPlanDetail } from '../features/workout/api'

// Registrar o treino que ACONTECEU, e não só o que estava no papel: aparelho
// ocupado, dor no dia e troca combinada na hora são rotina de academia. O banco
// sempre permitiu (workout_log_sets aponta para o catálogo, não para o
// exercício do plano — 0009); estes testes fixam o caminho na tela.

const { criarMock, planoMock } = vi.hoisted(() => ({
  criarMock: vi.fn(),
  planoMock: vi.fn(),
}))

vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org-1' } }),
}))

const exercicio = (id: string, name: string) => ({
  id,
  org_id: null,
  name,
  primary_muscle: 'chest',
  secondary_muscles: [],
  equipment: 'barbell',
  movement_pattern: 'horizontal_push',
  is_unilateral: false,
  cues: null,
  created_by: null,
  created_at: 'x',
})

vi.mock('../features/workout/hooks', () => ({
  useWorkoutPlan: () => planoMock(),
  useExercises: () => ({
    data: [exercicio('ex-1', 'Supino reto'), exercicio('ex-2', 'Crucifixo')],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useWorkoutLogs: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
  usePlanSetHistory: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
  useWorkoutLogSets: () => ({ data: [], isPending: false, isError: false }),
  useCreateWorkoutLog: () => ({ mutateAsync: criarMock, isPending: false }),
  useDeleteWorkoutLog: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}))

function plano(): WorkoutPlanDetail {
  return {
    plan: {
      id: 'plan-1',
      org_id: 'org-1',
      subject_id: 'subject-1',
      evaluator_id: 'user-1',
      name: 'Mesociclo A',
      goal: 'hypertrophy',
      weeks: 4,
      starts_on: null,
      notes: null,
      status: 'active',
      source_assessment_id: null,
      source_posture_session_id: null,
      weekly_schedule: [],
      volume: null,
      volume_engine_version: null,
      created_at: '2026-08-01T10:00:00Z',
      updated_at: '2026-08-01T10:00:00Z',
    },
    days: [
      { id: 'day-1', org_id: 'org-1', plan_id: 'plan-1', label: 'A', name: 'Peito', position: 0, created_at: 'x' },
    ],
    exercises: [
      {
        id: 'we-1', org_id: 'org-1', day_id: 'day-1', exercise_id: 'ex-1', position: 0,
        sets: 3, reps: '8-12', rir: 2, rest_seconds: 90, tempo: null, notes: null,
        group_key: null, group_kind: null, technique: null, created_at: 'x',
      },
    ],
    overrides: [],
    weeks: [],
  } as unknown as WorkoutPlanDetail
}

function abrir() {
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/avaliados/:id/treinos/:planId/execucao', element: <Execucao /> },
          { path: '/avaliados/:id/treinos/:planId', element: <div>detalhe do plano</div> },
        ],
        { initialEntries: ['/avaliados/subject-1/treinos/plan-1/execucao'] }
      )}
    />
  )
}

function adicionarCrucifixo() {
  fireEvent.click(screen.getByRole('button', { name: /Adicionar exercício/ }))
  fireEvent.click(screen.getByRole('button', { name: /Crucifixo/ }))
}

beforeEach(() => {
  criarMock.mockReset().mockResolvedValue({ id: 'log-1' })
  planoMock.mockReset().mockReturnValue({ data: plano(), isPending: false, isError: false })
})
afterEach(cleanup)

describe('Execucao — exercício fora do plano', () => {
  it('registra o avulso junto do prescrito, numerando as séries por exercício', async () => {
    abrir()
    adicionarCrucifixo()

    fireEvent.change(screen.getByLabelText('Carga da série 1 de Supino reto'), {
      target: { value: '40' },
    })
    fireEvent.change(screen.getByLabelText('Repetições da série 1 de Supino reto'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Carga da série 1 de Crucifixo'), {
      target: { value: '14' },
    })
    fireEvent.change(screen.getByLabelText('Repetições da série 2 de Crucifixo'), {
      target: { value: '12' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar treino' }))

    await waitFor(() => expect(criarMock).toHaveBeenCalled())
    expect(criarMock.mock.calls[0][0].sets).toEqual([
      { exerciseId: 'ex-1', setNumber: 1, weightKg: 40, reps: 10, rir: null },
      { exerciseId: 'ex-2', setNumber: 1, weightKg: 14, reps: null, rir: null },
      { exerciseId: 'ex-2', setNumber: 2, weightKg: null, reps: 12, rir: null },
    ])
  })

  it('o avulso pertence à sessão gravada e não reaparece na próxima', async () => {
    abrir()
    adicionarCrucifixo()
    fireEvent.change(screen.getByLabelText('Carga da série 1 de Crucifixo'), {
      target: { value: '14' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar treino' }))

    await screen.findByText('Treino registrado!')
    expect(screen.queryByLabelText('Carga da série 1 de Crucifixo')).toBeNull()
  })

  it('não oferece exercício que já está na divisão do dia', () => {
    abrir()
    fireEvent.click(screen.getByRole('button', { name: /Adicionar exercício/ }))

    expect(screen.getByRole('button', { name: /Crucifixo/ })).toBeTruthy()
    // Supino reto já está prescrito hoje: dois cartões do mesmo movimento na
    // mesma sessão só confundiriam quem digita.
    expect(screen.queryByRole('button', { name: /Supino reto/ })).toBeNull()
  })

  it('remover o avulso tira as séries dele do registro', async () => {
    abrir()
    adicionarCrucifixo()
    fireEvent.change(screen.getByLabelText('Carga da série 1 de Crucifixo'), {
      target: { value: '14' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remover Crucifixo da sessão' }))

    fireEvent.change(screen.getByLabelText('Carga da série 1 de Supino reto'), {
      target: { value: '40' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar treino' }))

    await waitFor(() => expect(criarMock).toHaveBeenCalled())
    expect(criarMock.mock.calls[0][0].sets).toEqual([
      { exerciseId: 'ex-1', setNumber: 1, weightKg: 40, reps: null, rir: null },
    ])
  })
})
