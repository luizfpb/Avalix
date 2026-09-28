import { describe, it, expect } from 'vitest'
import {
  PROGRESSION_ENGINE_VERSION,
  defaultLoadStep,
  latestBestByExercise,
  parseRepRange,
  suggestDeload,
  suggestProgression,
} from './progression'
import type { SetHistoryPoint } from './api'

describe('parseRepRange', () => {
  it('faixa, fixo e inválido', () => {
    expect(parseRepRange('8-12')).toEqual({ min: 8, max: 12 })
    expect(parseRepRange('10')).toEqual({ min: 10, max: 10 })
    expect(parseRepRange('30s')).toBeNull()
    expect(parseRepRange('')).toBeNull()
  })
})

describe('suggestProgression (dupla progressão + RIR)', () => {
  it('bateu o topo com RIR ≥ alvo -> sobe carga e volta ao fundo', () => {
    const s = suggestProgression({
      last: { weightKg: 100, reps: 12, rir: 2 },
      repRange: { min: 8, max: 12 },
      targetRir: 2,
    })
    expect(s.kind).toBe('increase_load')
    expect(s.suggestedWeightKg).toBe(102.5)
    expect(s.suggestedReps).toBe(8)
  })

  it('dentro da faixa -> mesma carga, +1 rep', () => {
    const s = suggestProgression({
      last: { weightKg: 100, reps: 9, rir: 2 },
      repRange: { min: 8, max: 12 },
      targetRir: 2,
    })
    expect(s.kind).toBe('add_reps')
    expect(s.suggestedWeightKg).toBe(100)
    expect(s.suggestedReps).toBe(10)
  })

  it('abaixo da faixa ou RIR muito baixo -> reduzir', () => {
    expect(
      suggestProgression({ last: { weightKg: 100, reps: 6, rir: 0 }, repRange: { min: 8, max: 12 }, targetRir: 2 }).kind
    ).toBe('reduce')
    expect(
      suggestProgression({ last: { weightKg: 100, reps: 10, rir: 0 }, repRange: { min: 8, max: 12 }, targetRir: 2 }).kind
    ).toBe('reduce') // rir 0 << alvo 2
  })

  it('sem dados suficientes -> insufficient', () => {
    expect(
      suggestProgression({ last: { weightKg: null, reps: null, rir: null }, repRange: { min: 8, max: 12 }, targetRir: 2 }).kind
    ).toBe('insufficient')
    expect(
      suggestProgression({ last: { weightKg: 100, reps: 10, rir: 2 }, repRange: null, targetRir: 2 }).kind
    ).toBe('insufficient')
  })

  it('topo da faixa mas RIR não definido ainda sugere subir carga', () => {
    const s = suggestProgression({ last: { weightKg: 80, reps: 12, rir: null }, repRange: { min: 8, max: 12 }, targetRir: null })
    expect(s.kind).toBe('increase_load')
    expect(s.suggestedWeightKg).toBe(82.5)
  })

  // v1: com o topo da faixa atingido e RIR abaixo do alvo, a sugestão era
  // "+1 rep" com o mesmo número de repetições.
  it('topo da faixa com RIR abaixo do alvo -> manter carga e repetições', () => {
    const s = suggestProgression({ last: { weightKg: 20, reps: 12, rir: 1 }, repRange: { min: 8, max: 12 }, targetRir: 2 })
    expect(s.kind).toBe('hold')
    expect(s.suggestedWeightKg).toBe(20)
    expect(s.suggestedReps).toBe(12)
  })
})

// O passo fixo de 2,5 kg da v1 era desproporcional em carga leve.
describe('incremento pela faixa de carga', () => {
  it('halter leve sobe de 1 em 1 kg, e não 87%', () => {
    const s = suggestProgression({ last: { weightKg: 4, reps: 15, rir: 2 }, repRange: { min: 12, max: 15 }, targetRir: 2 })
    expect(s.kind).toBe('increase_load')
    expect(s.suggestedWeightKg).toBe(5) // v1: 7,5 kg
    expect(s.reason).toContain('+1 kg')
  })

  it('carga média sobe de 2 em 2 kg, sem arredondar para a grade de 2,5', () => {
    const s = suggestProgression({ last: { weightKg: 17, reps: 12, rir: 2 }, repRange: { min: 8, max: 12 }, targetRir: 2 })
    expect(s.suggestedWeightKg).toBe(19) // v1: 20 (17 + 2,5 arredondado)
  })

  it('nunca sugere 0 kg: na menor carga, mantém e reconstrói as repetições', () => {
    const s = suggestProgression({ last: { weightKg: 1, reps: 6, rir: 0 }, repRange: { min: 8, max: 12 }, targetRir: 2 })
    expect(s.kind).toBe('hold')
    expect(s.suggestedWeightKg).toBe(1) // v1: 0 kg
    expect(s.suggestedReps).toBe(8)
  })

  it('reduz pelo mesmo incremento', () => {
    const s = suggestProgression({ last: { weightKg: 6, reps: 6, rir: 0 }, repRange: { min: 8, max: 12 }, targetRir: 2 })
    expect(s.kind).toBe('reduce')
    expect(s.suggestedWeightKg).toBe(5)
  })

  it('o incremento pode ser informado', () => {
    const s = suggestProgression({ last: { weightKg: 100, reps: 12, rir: 2 }, repRange: { min: 8, max: 12 }, targetRir: 2, loadStep: 5 })
    expect(s.suggestedWeightKg).toBe(105)
  })

  it('defaultLoadStep por faixa', () => {
    expect(defaultLoadStep(4)).toBe(1)
    expect(defaultLoadStep(12)).toBe(2)
    expect(defaultLoadStep(20)).toBe(2.5)
  })
})

describe('suggestDeload', () => {
  it('reduz carga (~60%) e séries', () => {
    expect(suggestDeload(100, 4)).toEqual({ weightKg: 60, sets: 2 })
  })

  it('em carga leve arredonda pelo incremento do halter', () => {
    expect(suggestDeload(8, 3)).toEqual({ weightKg: 5, sets: 2 }) // 4,8 kg -> 5
  })
})

describe('latestBestByExercise', () => {
  const history: SetHistoryPoint[] = [
    { exerciseId: 'sup', performedAt: '2026-01-01', weightKg: 90, reps: 10, rir: 3 },
    { exerciseId: 'sup', performedAt: '2026-01-08', weightKg: 100, reps: 8, rir: 2 },
    { exerciseId: 'sup', performedAt: '2026-01-08', weightKg: 95, reps: 12, rir: 1 }, // mesma sessão, e1RM menor
  ]
  it('pega a melhor série (e1RM) da sessão mais recente', () => {
    const best = latestBestByExercise(history).get('sup')!
    expect(best.date).toBe('2026-01-08')
    // 100x8 -> e1RM 126.7 vs 95x12 -> 133 ... conferir qual ganha
    // 95x12 Epley = 95*(1+12/30)=133; 100x8 = 100*(1+8/30)=126.7 -> 95x12 vence
    expect(best.weightKg).toBe(95)
    expect(best.reps).toBe(12)
  })
})

describe('PROGRESSION_ENGINE_VERSION', () => {
  it('segue nome@versao', () => {
    expect(PROGRESSION_ENGINE_VERSION).toMatch(/^[a-z-]+@\d+$/)
  })
})
