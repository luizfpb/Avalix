import { describe, expect, it } from 'vitest'
import { editorPlanToTemplatePayload, templateToEditorPlan, type WorkoutTemplateRow } from './templatesApi'
import type { EditorPlan } from './builder'
import { buildWhatsAppHref } from '../../lib/phone'

describe('modelos de treino (templatesApi)', () => {
  it('converte EditorPlan -> payload -> EditorPlan preservando divisões, grupos, técnicas e overrides', () => {
    const plan: EditorPlan = {
      name: 'Hipertrofia AB',
      goal: 'hypertrophy',
      weeks: 6,
      startsOn: '2026-11-22',
      notes: 'Foco em progressão',
      status: 'active',
      sourceAssessmentId: 'assess-1',
      sourcePostureSessionId: null,
      weeklySchedule: ['A', 'B', 'A', 'B'],
      days: [
        {
          key: 'd1',
          label: 'A',
          name: 'Superior',
          exercises: [
            {
              key: 'e1',
              exerciseId: 'ex-supino',
              sets: 4,
              reps: '8-10',
              rir: 2,
              restSeconds: 90,
              tempo: '3-1-1',
              notes: 'Escápulas retraídas',
              groupKey: 'g-1',
              groupKind: 'superset',
              technique: 'drop_set',
            },
            {
              key: 'e2',
              exerciseId: 'ex-remada',
              sets: 4,
              reps: '10-12',
              rir: 2,
              restSeconds: 90,
              tempo: null,
              notes: null,
              groupKey: 'g-1',
              groupKind: 'superset',
              technique: null,
            },
          ],
        },
      ],
      weeksMeta: [{ week: 0, label: 'Adaptação', isDeload: false, notes: null }],
      overrides: [
        {
          week: 4,
          exerciseKey: 'e1',
          sets: 5,
          reps: '6-8',
          rir: 1,
          restSeconds: 120,
          isSkipped: false,
          notes: 'Topo de carga',
        },
      ],
    }

    const payload = editorPlanToTemplatePayload(plan)
    expect(payload.days).toHaveLength(1)
    expect(payload.days[0].exercises).toHaveLength(2)
    expect(payload.overrides).toHaveLength(1)
    expect(payload.overrides[0]).toMatchObject({ week: 4, day_index: 0, exercise_index: 0, sets: 5 })

    const row: WorkoutTemplateRow = {
      id: 'tpl-1',
      org_id: 'org-1',
      created_by: 'user-1',
      name: plan.name,
      goal: plan.goal,
      weeks: plan.weeks,
      notes: plan.notes,
      payload,
      created_at: '2026-11-22T00:00:00Z',
      updated_at: '2026-11-22T00:00:00Z',
    }

    let k = 0
    let g = 0
    const restored = templateToEditorPlan(row, () => `nk-${++k}`, () => `ng-${++g}`)
    expect(restored.status).toBe('draft')
    expect(restored.startsOn).toBeNull()
    expect(restored.sourceAssessmentId).toBeNull()
    expect(restored.weeklySchedule).toEqual(['A', 'B', 'A', 'B'])
    expect(restored.days[0].exercises[0].groupKey).toBe('ng-1')
    expect(restored.days[0].exercises[1].groupKey).toBe('ng-1')
    expect(restored.overrides[0].exerciseKey).toBe(restored.days[0].exercises[0].key)
    expect(restored.overrides[0].sets).toBe(5)
  })
})

describe('buildWhatsAppHref', () => {
  it('monta link wa.me com DDI 55 para números brasileiros e ignora inválidos', () => {
    expect(buildWhatsAppHref('(11) 99999-0000', 'Oi!')).toBe('https://wa.me/5511999990000?text=Oi!')
    expect(buildWhatsAppHref('+55 11 99999-0000', 'Oi!')).toBe('https://wa.me/5511999990000?text=Oi!')
    expect(buildWhatsAppHref('12345', 'Oi!')).toBeNull()
    expect(buildWhatsAppHref(null, 'Oi!')).toBeNull()
  })
})
