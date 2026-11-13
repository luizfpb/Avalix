import { describe, expect, it } from 'vitest'
import { buildMeasures, emptyFields, fieldsFromMeasures } from './form'
import type { FitnessMeasures } from './measures'

describe('buildMeasures', () => {
  it('formulário em branco não tem nenhum teste', () => {
    expect(buildMeasures(emptyFields('M', 80))).toEqual({ measures: {}, errors: {} })
  })

  it('o peso preenchido de antemão não cria o Rockport sozinho', () => {
    const { measures } = buildMeasures(emptyFields('F', 60))
    expect(measures.rockport).toBeUndefined()
  })

  it('monta cada teste preenchido', () => {
    const f = {
      ...emptyFields('F', 62.5),
      cooperDistance: '2100',
      rockportMin: '15',
      rockportSec: '5',
      rockportHr: '128',
      queensHr: '160',
      pushUpsReps: '12',
      sitUpsReps: '28',
      reachBest: '31.5',
      reachFeet: 23 as const,
      gripRight: '27',
    }
    expect(buildMeasures(f)).toEqual({
      errors: {},
      measures: {
        cooper: { distance_m: 2100 },
        rockport: { time_s: 905, heart_rate_bpm: 128, weight_kg: 62.5 },
        queens: { heart_rate_bpm: 160 },
        push_ups: { reps: 12, knees: true },
        sit_ups: { reps: 28 },
        sit_and_reach: { best_cm: 31.5, feet_mark_cm: 23 },
        grip: { right_kg: 27 },
      },
    })
  })

  it('teste pela metade vira erro daquele teste e não entra', () => {
    const f = { ...emptyFields('M', null), rockportMin: '14', rockportHr: '120', sitUpsReps: '30' }
    const r = buildMeasures(f)
    expect(r.errors.rockport).toMatch(/peso/)
    expect(r.measures).toEqual({ sit_ups: { reps: 30 } })
  })

  it('recusa fora das faixas do banco e repetição fracionada', () => {
    const f = {
      ...emptyFields('M', 80),
      cooperDistance: '24000',
      pushUpsReps: '10.5',
      rockportMin: '15',
      rockportSec: '60',
      rockportHr: '120',
      gripLeft: '0',
    }
    const r = buildMeasures(f)
    expect(Object.keys(r.errors).sort()).toEqual(['cooper', 'grip', 'push_ups', 'rockport'])
    expect(r.measures).toEqual({})
  })
})

describe('fieldsFromMeasures', () => {
  it('ida e volta mantém as medidas', () => {
    const m: FitnessMeasures = {
      rockport: { time_s: 905, heart_rate_bpm: 128, weight_kg: 62.5 },
      push_ups: { reps: 20, knees: false },
      sit_and_reach: { best_cm: 30, feet_mark_cm: 23 },
      grip: { left_kg: 22 },
    }
    expect(buildMeasures(fieldsFromMeasures(m, 'F', null)).measures).toEqual(m)
  })
})
