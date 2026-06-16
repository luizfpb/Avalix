import { describe, it, expect } from 'vitest'
import { buildAssessmentResult } from './result'
import type { ProtocolInput } from './protocols'

const jp7Input: ProtocolInput = {
  sex: 'M',
  ageYears: 30,
  heightCm: 180,
  skinfoldsMm: {
    chest: 12,
    midaxillary: 12,
    triceps: 14,
    subscapular: 14,
    abdomen: 18,
    suprailiac: 14,
    thigh: 16,
  },
  circumferencesCm: {},
}

describe('buildAssessmentResult', () => {
  it('combina protocolo, conversão e massas no snapshot', () => {
    // jp7 soma 100 / 30 anos -> ~14.6% ; 80 kg -> gorda ~11.7, magra ~68.3
    const r = buildAssessmentResult('jp7', jp7Input, 80)
    expect(r.engineVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(r.protocolId).toBe('jp7')
    expect(r.bodyFatPct).toBeCloseTo(14.6, 1)
    expect(r.fatMassKg).toBeCloseTo(11.7, 1)
    expect(r.leanMassKg).toBeCloseTo(68.3, 1)
    expect(r.fatMassKg + r.leanMassKg).toBeCloseTo(80, 6)
    expect(r.inputs.weightKg).toBe(80)
    expect(r.conversions).not.toBeNull()
  })
})
