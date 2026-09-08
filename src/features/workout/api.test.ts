import { beforeEach, describe, expect, it, vi } from 'vitest'

// Publicar um plano novo era DUAS gravações independentes, e a primeira delas
// (o insert do cabeçalho) já trocava o treino vigente pelo trigger da 0027.
// Falhar na segunda deixava o aluno sem treino nenhum. A 0031 fecha as duas
// numa transação só; o que este arquivo fixa é que o cliente usa esse caminho.

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}))

import { createWorkoutLog, createWorkoutPlan, updateWorkoutLog } from './api'
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

describe('createWorkoutLog', () => {
  it('leva o descanso real de cada série para a gravação atômica', async () => {
    await createWorkoutLog({
      orgId: 'org-1', subjectId: 'sub-1', planId: 'plan-1', dayLabel: 'A',
      weekNumber: 1, performedAt: '2026-09-08', notes: null,
      sets: [90, 0, null, undefined].map((restSeconds, index) => ({
        exerciseId: 'ex-1', setNumber: index + 1, weightKg: 40, reps: 10, rir: null,
        ...(restSeconds === undefined ? {} : { restSeconds }),
      })),
    })
    expect(mocks.rpc).toHaveBeenCalledWith('create_workout_log', expect.objectContaining({
      p_sets: [90, 0, null, null].map((rest_seconds, index) => ({
        exercise_id: 'ex-1', set_number: index + 1, weight_kg: 40, reps: 10, rir: null,
        rest_seconds, reached_failure: null,
      })),
    }))
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('distingue falha confirmada, não marcada e desconhecida, sem inferir pelo RIR', async () => {
    await createWorkoutLog({
      orgId: 'org-1', subjectId: 'sub-1', planId: 'plan-1', dayLabel: 'A',
      weekNumber: 1, performedAt: '2026-09-08', notes: null,
      sets: [true, false, null, undefined].map((reachedFailure, index) => ({
        exerciseId: 'ex-1', setNumber: index + 1, weightKg: 40, reps: 10, rir: 0,
        ...(reachedFailure === undefined ? {} : { reachedFailure }),
      })),
    })
    const args = mocks.rpc.mock.calls[0][1]
    expect(args.p_sets.map((set: { reached_failure: boolean | null }) => set.reached_failure)).toEqual([true, false, null, null])
  })
})

describe('updateWorkoutLog', () => {
  it('substitui a sessão existente numa RPC com a versão-base e todos os campos editáveis', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { id: 'log-1' }, error: null })
    const result = await updateWorkoutLog({
      id: 'log-1', expectedUpdatedAt: '2026-09-08T10:00:00Z', performedAt: '2026-09-07',
      notes: 'Carga corrigida',
      sets: [{ exerciseId: 'ex-1', setNumber: 1, weightKg: 42, reps: 10, rir: 0, restSeconds: 75, reachedFailure: true }],
    })
    expect(result.id).toBe('log-1')
    expect(mocks.rpc).toHaveBeenCalledWith('update_workout_log', {
      p_log: 'log-1', p_expected_updated_at: '2026-09-08T10:00:00Z',
      p_performed_at: '2026-09-07', p_notes: 'Carga corrigida',
      p_sets: [{exercise_id:'ex-1',set_number:1,weight_kg:42,reps:10,rir:0,rest_seconds:75,reached_failure:true}],
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('limpa notas por default e mantém descanso/falha desconhecidos nos registros legados', async () => {
    await updateWorkoutLog({
      id: 'log-1', expectedUpdatedAt: '2026-09-08T10:00:00Z', performedAt: '2026-09-08', notes: null,
      sets: [{ exerciseId: 'ex-1', setNumber: 1, weightKg: 40, reps: 10, rir: 0 }],
    })
    const args = mocks.rpc.mock.calls[0][1]
    expect(args).not.toHaveProperty('p_notes')
    expect(args.p_sets[0]).toMatchObject({ rir: 0, rest_seconds: null, reached_failure: null })
  })

  it('propaga conflito de edição sem criar outra sessão ou tentar sobrescrever', async () => {
    const error = { code: '40001', message: 'registro de treino alterado por outra pessoa' }
    mocks.rpc.mockResolvedValue({ data: null, error })
    await expect(updateWorkoutLog({
      id: 'log-1', expectedUpdatedAt: 'antiga', performedAt: '2026-09-08', notes: null,
      sets: [{ exerciseId: 'ex-1', setNumber: 1, weightKg: 40, reps: 10, rir: 1 }],
    })).rejects.toEqual(error)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
