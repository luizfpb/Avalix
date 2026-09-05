import { beforeEach, describe, expect, it, vi } from 'vitest'

// Publicar um plano novo era DUAS gravações independentes, e a primeira delas
// (o insert do cabeçalho) já trocava o treino vigente pelo trigger da 0027.
// Falhar na segunda deixava o aluno sem treino nenhum. A 0031 fecha as duas
// numa transação só; o que este arquivo fixa é que o cliente usa esse caminho.

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}))

import { createWorkoutPlan } from './api'
import type { SaveWorkoutPlanInput } from './api'

function entrada(patch: Partial<SaveWorkoutPlanInput> = {}): SaveWorkoutPlanInput {
  return {
    orgId: 'org-1',
    subjectId: 'sub-1',
    name: 'Mesociclo 1',
    goal: null,
    weeks: 4,
    startsOn: null,
    notes: null,
    status: 'active',
    weeklySchedule: ['A'],
    sourceAssessmentId: null,
    sourcePostureSessionId: null,
    volume: { engineVersion: 'v1', perMuscle: {} } as unknown as SaveWorkoutPlanInput['volume'],
    days: [
      {
        label: 'A',
        name: 'Superiores',
        exercises: [
          {
            clientKey: 'k1',
            exerciseId: 'ex-1',
            sets: 3,
            reps: '10',
            rir: 2,
            restSeconds: 60,
            tempo: null,
            notes: null,
            groupKey: null,
            groupKind: null,
            technique: null,
          },
        ],
      },
    ],
    overrides: [],
    weeksMeta: [],
    ...patch,
  }
}

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: { id: 'p1' }, error: null })
  mocks.from.mockReset()
})

describe('createWorkoutPlan', () => {
  it('grava cabeçalho e estrutura numa chamada só, sem insert direto na tabela', async () => {
    const plan = await createWorkoutPlan(entrada())

    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc.mock.calls[0][0]).toBe('create_workout_plan')
    // nenhum insert/delete direto: era o par de gravações que deixava o aluno
    // sem treino quando a segunda falhava
    expect(mocks.from).not.toHaveBeenCalled()
    expect(plan.id).toBe('p1')
  })

  it('leva org, avaliado e a estrutura filha no mesmo payload', async () => {
    await createWorkoutPlan(entrada())

    const args = mocks.rpc.mock.calls[0][1] as Record<string, unknown>
    expect(args.p_org).toBe('org-1')
    expect(args.p_subject).toBe('sub-1')
    expect(args.p_status).toBe('active')
    expect((args.p_days as unknown[]).length).toBe(1)
  })

  it('omite os argumentos opcionais nulos, em vez de mandá-los explícitos', async () => {
    await createWorkoutPlan(entrada())

    const args = mocks.rpc.mock.calls[0][1] as Record<string, unknown>
    expect(args).not.toHaveProperty('p_goal')
    expect(args).not.toHaveProperty('p_starts_on')
    expect(args).not.toHaveProperty('p_notes')
  })

  it('propaga a recusa do banco sem tentar limpeza nenhuma', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'agrupamento invalido' },
    })

    await expect(createWorkoutPlan(entrada())).rejects.toMatchObject({
      message: 'agrupamento invalido',
    })
    // a transação já desfez tudo: o plano anterior nem chegou a ser arquivado
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
