import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: mocks }))
import { getWorkoutPlan, updateWorkoutPlan } from './api'
import { planDetailToEditor, editorToSaveInput, snapshotFromEditor } from './builder'

function database(cap: number, versions = ['v1', 'v1']) {
  const tables: Record<string, unknown> = {
    workout_plans: { id: 'p', org_id: 'org', subject_id: 'student', name: '52 semanas', weeks: 52,
      status: 'active', weekly_schedule: [], updated_at: 'v1' },
    workout_days: Array.from({ length: 3 }, (_, i) => ({ id: `day-${i}`, label: String.fromCharCode(65 + i), position: i })),
    workout_exercises: Array.from({ length: 21 }, (_, i) => ({ id: `we-${i}`, day_id: `day-${Math.floor(i / 7)}`,
      exercise_id: `catalog-${i}`, position: i % 7, sets: 3, reps: '8-12', rir: 2, rest_seconds: 90 })),
    workout_week_overrides: Array.from({ length: 52 }, (_, w) => Array.from({ length: 21 }, (_, e) => ({
      id: `override-${w}-${e}`, plan_id: 'p', workout_exercise_id: `we-${e}`,
      week_number: w + 1, sets: 2, reps: null, rir: 4, rest_seconds: null, is_skipped: false, notes: null,
    }))).flat(),
    workout_weeks: Array.from({ length: 52 }, (_, i) => ({ id: `week-${i}`, plan_id: 'p', week_number: i + 1 })),
  }
  const ranges: Record<string, number[]> = {}
  let versionRead = 0
  mocks.from.mockImplementation((table: string) => {
    let from = 0
    let to = 499
    const data = tables[table]
    const result = () => ({ data: Array.isArray(data) ? data.slice(from, Math.min(to + 1, from + cap)) : data,
      count: Array.isArray(data) ? data.length : null, error: null })
    const chain = {
      select: () => chain, eq: () => chain, in: () => chain, order: () => chain,
      range: (start: number, end: number) => { from = start; to = end; (ranges[table] ??= []).push(start); return chain },
      maybeSingle: async () => ({ data: { ...(data as object), updated_at: versions[Math.min(versionRead++, versions.length - 1)] }, error: null }),
      then: <T>(resolve: (value: ReturnType<typeof result>) => T) => Promise.resolve(result()).then(resolve),
    }
    return chain
  })
  mocks.rpc.mockResolvedValue({ data: tables.workout_plans, error: null })
  return ranges
}
beforeEach(() => vi.clearAllMocks())

describe('leitura integral e consistente do plano', () => {
  it.each([1000, 200])('preserva 1092 overrides ao abrir e salvar com teto de %i linhas', async (cap) => {
    const ranges = database(cap)
    const detail = await getWorkoutPlan('p')
    expect(detail.overrides).toHaveLength(1092)
    expect(detail.weeks).toHaveLength(52)
    expect(new Set(detail.overrides.map((row) => row.id)).size).toBe(1092)
    expect(ranges.workout_week_overrides).toEqual(cap < 500 ? [0, 200, 400, 600, 800, 1000] : [0, 500, 1000])
    const editor = planDetailToEditor(detail)
    const save = editorToSaveInput(editor, { orgId: 'org', subjectId: 'student' }, snapshotFromEditor(editor, new Map()))
    await updateWorkoutPlan('p', save, detail.plan!.updated_at)
    expect(mocks.rpc.mock.calls[0][1].p_overrides).toHaveLength(1092)
  })

  it('repete a leitura inteira se o plano mudou entre duas páginas', async () => {
    const ranges = database(500, ['v1', 'v2', 'v2', 'v2'])
    const detail = await getWorkoutPlan('p')
    expect(detail.plan?.updated_at).toBe('v2')
    expect(ranges.workout_week_overrides).toEqual([0, 500, 1000, 0, 500, 1000])
  })

  it('recusa abrir um editor incompleto se o plano continua mudando', async () => {
    database(500, ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'])
    await expect(getWorkoutPlan('p')).rejects.toThrow('atualizado durante a leitura')
  })
})
