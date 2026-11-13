import { describe, expect, it } from 'vitest'
import { previousResults } from './history'
import type { FitnessTestRow } from './api'

const row = (id: string, testedAt: string, measures: unknown, createdAt = `${testedAt}T10:00:00Z`): FitnessTestRow => ({
  id,
  org_id: 'o',
  subject_id: 's',
  evaluator_id: 'e',
  tested_at: testedAt,
  measures,
  notes: null,
  created_at: createdAt,
  updated_at: createdAt,
})

describe('previousResults', () => {
  const a = row('a', '2026-01-10', { cooper: { distance_m: 2000 }, sit_ups: { reps: 20 } })
  const b = row('b', '2026-03-10', { cooper: { distance_m: 2200 } })
  const c = row('c', '2026-06-10', { cooper: { distance_m: 2400 }, sit_ups: { reps: 30 } })
  const later = row('d', '2026-09-10', { sit_ups: { reps: 40 } })

  it('pega o mais recente antes, teste a teste', () => {
    const p = previousResults(c, [later, c, b, a], 'M', '1990-01-01')
    expect(p.cooper?.testedAt).toBe('2026-03-10')
    // o abdominal não foi feito em março: vem de janeiro
    expect(p.sit_ups).toEqual({ testedAt: '2026-01-10', value: 20, ratingLabel: null })
  })

  it('o primeiro registro não tem anterior, e o posterior não conta', () => {
    expect(previousResults(a, [later, c, b, a], 'M', '1990-01-01')).toEqual({})
  })

  it('mesmo dia: só o criado antes', () => {
    const cedo = row('x', '2026-06-10', { sit_ups: { reps: 25 } }, '2026-06-10T08:00:00Z')
    const tarde = row('y', '2026-06-10', { sit_ups: { reps: 27 } }, '2026-06-10T18:00:00Z')
    expect(previousResults(tarde, [cedo, tarde], 'F', '1990-01-01').sit_ups?.value).toBe(25)
    expect(previousResults(cedo, [cedo, tarde], 'F', '1990-01-01').sit_ups).toBeUndefined()
  })
})
