import { describe, it, expect } from 'vitest'
import {
  PROGRESSION_ENGINE_VERSION,
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
})

describe('suggestDeload', () => {
  it('reduz carga (~60%) e séries', () => {
    expect(suggestDeload(100, 4)).toEqual({ weightKg: 60, sets: 2 })
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
