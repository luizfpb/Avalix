import { describe, it, expect } from 'vitest'
import { computeProtocol, listProtocols, PROTOCOLS, ENGINE_VERSION } from './registry'
import type { ProtocolInput } from './types'

function input(over: Partial<ProtocolInput>): ProtocolInput {
  return {
    sex: 'M',
    ageYears: 30,
    heightCm: 180,
    skinfoldsMm: {},
    circumferencesCm: {},
    ...over,
  }
}

describe('computeProtocol', () => {
  it('jp7 devolve densidade, % Siri como principal e as duas conversões', () => {
    // soma 100 mm, 30 anos -> D=1.0653532 -> Siri ~14.6 %
    const r = computeProtocol(
      'jp7',
      input({
        skinfoldsMm: {
          chest: 12,
          midaxillary: 12,
          triceps: 14,
          subscapular: 14,
          abdomen: 18,
          suprailiac: 14,
          thigh: 16,
        },
      })
    )
    expect(r.bodyDensity).toBeCloseTo(1.0653532, 6)
    expect(r.bodyFatPct).toBeCloseTo(14.6, 1)
    expect(r.conversions?.siri).toBeCloseTo(r.bodyFatPct, 6)
    expect(r.conversions?.brozek).toBeGreaterThan(0)
  })

  it('US Navy não tem densidade nem conversões', () => {
    const r = computeProtocol(
      'usNavy',
      input({ circumferencesCm: { neck: 38, waist: 85 } })
    )
    expect(r.bodyDensity).toBeNull()
    expect(r.conversions).toBeNull()
    expect(r.bodyFatPct).toBeCloseTo(16.1, 1)
  })

  it('bloqueia protocolo que não se aplica ao sexo', () => {
    expect(() => computeProtocol('jp3', input({ sex: 'F' }))).toThrow(/não se aplica/i)
  })

  it('exige todas as dobras do protocolo', () => {
    expect(() =>
      computeProtocol('jp7', input({ skinfoldsMm: { chest: 12 } }))
    ).toThrow(/dobra obrigatória/i)
  })

  it('rejeita id desconhecido', () => {
    expect(() => computeProtocol('xpto', input({}))).toThrow(/desconhecido/i)
  })
})

describe('listProtocols', () => {
  it('filtra por sexo aplicável', () => {
    const female = listProtocols('F').map((p) => p.id)
    expect(female).toContain('jpWard')
    expect(female).not.toContain('jp3')
    const male = listProtocols('M').map((p) => p.id)
    expect(male).toContain('jp3')
    expect(male).not.toContain('jpWard')
  })

  it('a versão do motor está fixada', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(Object.keys(PROTOCOLS)).toContain('durninWomersley')
  })
})
