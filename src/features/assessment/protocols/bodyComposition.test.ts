import { describe, it, expect } from 'vitest'
import { siriBodyFatPct, brozekBodyFatPct, fatMassKg, leanMassKg } from './bodyComposition'

describe('conversões de densidade', () => {
  it('Siri e Brozek nos pontos âncora (D = 1.0)', () => {
    // 495/1 - 450 = 45 ; 457/1 - 414.1 = 42.9
    expect(siriBodyFatPct(1.0)).toBeCloseTo(45, 6)
    expect(brozekBodyFatPct(1.0)).toBeCloseTo(42.9, 6)
  })

  it('Siri e Brozek em D = 1.05', () => {
    // 495/1.05 - 450 = 21.4286 ; 457/1.05 - 414.1 = 21.1381
    expect(siriBodyFatPct(1.05)).toBeCloseTo(21.4286, 3)
    expect(brozekBodyFatPct(1.05)).toBeCloseTo(21.1381, 3)
  })

  it('massas gorda e magra', () => {
    expect(fatMassKg(80, 20)).toBeCloseTo(16, 6)
    expect(leanMassKg(80, 20)).toBeCloseTo(64, 6)
  })
})
