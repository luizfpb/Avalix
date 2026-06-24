import { describe, it, expect } from 'vitest'
import {
  duplicatePlanEditor,
  editorToSaveInput,
  editorToVolumePlan,
  emptyEditorPlan,
  planDetailToEditor,
  snapshotFromEditor,
  type EditorPlan,
  type ExerciseMeta,
} from './builder'
import type { WorkoutPlanDetail } from './api'

const meta = new Map<string, ExerciseMeta>([
  ['ex-sup', { primaryMuscle: 'chest', secondaryMuscles: ['triceps', 'front_delts'] }],
  ['ex-agacho', { primaryMuscle: 'quads', secondaryMuscles: ['glutes'] }],
])

function plan(): EditorPlan {
  return {
    ...emptyEditorPlan(),
    name: 'Plano teste',
    weeks: 4,
    days: [
      {
        key: 'd1',
        label: 'A',
        name: 'Peito',
        exercises: [
          { key: 'k-sup', exerciseId: 'ex-sup', sets: 4, reps: '8-12', rir: 2, restSeconds: 90, tempo: null, notes: null },
        ],
      },
      {
        key: 'd2',
        label: 'B',
        name: 'Pernas',
        exercises: [
          { key: 'k-agacho', exerciseId: 'ex-agacho', sets: 5, reps: '6-10', rir: 1, restSeconds: 120, tempo: null, notes: null },
        ],
      },
    ],
    overrides: [],
    weeksMeta: [],
  }
}

describe('editorToVolumePlan', () => {
  it('mapeia dias e exercicios usando os metadados de musculo', () => {
    const vp = editorToVolumePlan(plan(), meta)
    expect(vp.weeks).toBe(4)
    expect(vp.days).toHaveLength(2)
    expect(vp.days[0].exercises[0]).toMatchObject({
      key: 'k-sup',
      primaryMuscle: 'chest',
      secondaryMuscles: ['triceps', 'front_delts'],
      sets: 4,
    })
  })

  it('ignora exercicio sem metadados (removido do catalogo)', () => {
    const p = plan()
    p.days[0].exercises[0].exerciseId = 'ex-desconhecido'
    const vp = editorToVolumePlan(p, meta)
    expect(vp.days[0].exercises).toHaveLength(0)
  })

  it('converte overrides relevantes (sets/skip) e marca deloads', () => {
    const p = plan()
    p.overrides = [
      { week: 4, exerciseKey: 'k-sup', sets: 2, reps: null, rir: null, restSeconds: null, isSkipped: false, notes: null },
      { week: 4, exerciseKey: 'k-agacho', sets: null, reps: '10', rir: null, restSeconds: null, isSkipped: false, notes: null }, // so reps: sem efeito no volume
      { week: 2, exerciseKey: 'k-agacho', sets: null, reps: null, rir: null, restSeconds: null, isSkipped: true, notes: null },
    ]
    p.weeksMeta = [{ week: 4, label: 'Deload', isDeload: true, notes: null }]
    const vp = editorToVolumePlan(p, meta)
    expect(vp.overrides?.[4]).toEqual({ 'k-sup': { sets: 2 } }) // o de reps puro foi descartado
    expect(vp.overrides?.[2]).toEqual({ 'k-agacho': { skipped: true } })
    expect(vp.deloadWeeks).toEqual([4])
  })
})

describe('snapshotFromEditor', () => {
  it('produz o volume fracionado da semana tipica', () => {
    const snap = snapshotFromEditor(plan(), meta)
    expect(snap.typicalByMuscle.chest).toBe(4) // 4 * 1.0
    expect(snap.typicalByMuscle.triceps).toBe(2) // 4 * 0.5
    expect(snap.typicalByMuscle.quads).toBe(5)
    expect(snap.typicalByMuscle.glutes).toBe(2.5)
    expect(snap.perWeek).toHaveLength(4)
  })
})

describe('editorToSaveInput', () => {
  it('preserva clientKey e a estrutura do payload', () => {
    const snap = snapshotFromEditor(plan(), meta)
    const save = editorToSaveInput(plan(), { orgId: 'o1', subjectId: 's1' }, snap)
    expect(save.orgId).toBe('o1')
    expect(save.subjectId).toBe('s1')
    expect(save.days[0].exercises[0].clientKey).toBe('k-sup')
    expect(save.days[0].exercises[0].exerciseId).toBe('ex-sup')
    expect(save.volume.engineVersion).toBe(snap.engineVersion)
  })
})

describe('planDetailToEditor', () => {
  it('carrega o plano persistido com ids do banco como chaves e casa overrides', () => {
    const detail: WorkoutPlanDetail = {
      plan: {
        id: 'p1', org_id: 'o1', subject_id: 's1', evaluator_id: 'e1',
        name: 'Plano', goal: 'hypertrophy', weeks: 6, starts_on: null, notes: null,
        status: 'active', source_assessment_id: null, source_posture_session_id: null,
        weekly_schedule: [], volume: null, volume_engine_version: null,
        created_at: '2026-01-01', updated_at: '2026-01-01',
      },
      days: [
        { id: 'day-a', org_id: 'o1', plan_id: 'p1', label: 'A', name: 'Peito', position: 0, created_at: 'x' },
      ],
      exercises: [
        { id: 'we-2', org_id: 'o1', day_id: 'day-a', exercise_id: 'ex-sup', position: 1, sets: 3, reps: '10', rir: null, rest_seconds: 60, tempo: null, notes: null, created_at: 'x' },
        { id: 'we-1', org_id: 'o1', day_id: 'day-a', exercise_id: 'ex-agacho', position: 0, sets: 4, reps: '8', rir: 2, rest_seconds: 90, tempo: null, notes: null, created_at: 'x' },
      ],
      overrides: [
        { id: 'ov1', org_id: 'o1', plan_id: 'p1', workout_exercise_id: 'we-1', week_number: 6, sets: 2, reps: null, rir: null, rest_seconds: null, is_skipped: false, notes: null, created_at: 'x' },
      ],
      weeks: [
        { id: 'wk1', org_id: 'o1', plan_id: 'p1', week_number: 6, label: 'Deload', is_deload: true, notes: null, created_at: 'x' },
      ],
    }
    const ed = planDetailToEditor(detail)
    expect(ed.name).toBe('Plano')
    expect(ed.weeks).toBe(6)
    // exercicios ordenados por position
    expect(ed.days[0].exercises.map((e) => e.key)).toEqual(['we-1', 'we-2'])
    // override referencia a chave do exercicio (= workout_exercise_id)
    expect(ed.overrides[0].exerciseKey).toBe('we-1')
    expect(ed.weeksMeta[0]).toMatchObject({ week: 6, isDeload: true, label: 'Deload' })
  })
})

describe('duplicatePlanEditor', () => {
  const detail: WorkoutPlanDetail = {
    plan: {
      id: 'p1', org_id: 'o1', subject_id: 's1', evaluator_id: 'e1',
      name: 'Hipertrofia ABC', goal: 'hypertrophy', weeks: 4, starts_on: null, notes: 'obs',
      status: 'active', source_assessment_id: 'a1', source_posture_session_id: null,
      weekly_schedule: [], volume: null, volume_engine_version: null,
      created_at: '2026-01-01', updated_at: '2026-01-01',
    },
    days: [{ id: 'd1', org_id: 'o1', plan_id: 'p1', label: 'A', name: 'Peito', position: 0, created_at: 'x' }],
    exercises: [
      { id: 'we-1', org_id: 'o1', day_id: 'd1', exercise_id: 'ex-sup', position: 0, sets: 4, reps: '8-12', rir: 2, rest_seconds: 90, tempo: null, notes: null, created_at: 'x' },
    ],
    overrides: [],
    weeks: [],
  }

  it('novo nome, sempre rascunho, conteúdo preservado', () => {
    const ed = duplicatePlanEditor(detail, { name: 'Cópia ABC', keepSources: true })
    expect(ed.name).toBe('Cópia ABC')
    expect(ed.status).toBe('draft')
    expect(ed.weeks).toBe(4)
    expect(ed.days[0].exercises[0].exerciseId).toBe('ex-sup')
  })

  it('mantém a origem no mesmo aluno e limpa ao duplicar para outro', () => {
    expect(duplicatePlanEditor(detail, { name: 'x', keepSources: true }).sourceAssessmentId).toBe('a1')
    expect(duplicatePlanEditor(detail, { name: 'x', keepSources: false }).sourceAssessmentId).toBeNull()
  })
})
