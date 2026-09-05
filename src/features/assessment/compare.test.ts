import { describe, it, expect } from 'vitest'
import { buildComparison, type ComparePoint } from './compare'
import type { AssessmentResultSnapshot } from './result'

function snapshot(over: Partial<AssessmentResultSnapshot>): AssessmentResultSnapshot {
  return {
    engineVersion: '1.0.0',
    protocolId: 'jp7',
    bodyDensity: null,
    bodyFatPct: 20,
    conversions: null,
    fatMassKg: 16,
    leanMassKg: 64,
    inputs: {
      sex: 'M',
      ageYears: 30,
      heightCm: 180,
      weightKg: 80,
      skinfoldsMm: {},
      circumferencesCm: {},
    },
    ...over,
  }
}

function point(over: Partial<ComparePoint>): ComparePoint {
  return {
    assessedAt: '2026-01-01',
    weightKg: 80,
    heightCm: 180,
    results: null,
    circumferences: [],
    ...over,
  }
}

describe('buildComparison', () => {
  it('calcula deltas de peso/IMC e composição', () => {
    const from = point({
      weightKg: 80,
      results: snapshot({ bodyFatPct: 20, leanMassKg: 64, fatMassKg: 16 }),
    })
    const to = point({
      assessedAt: '2026-04-01',
      weightKg: 78,
      results: snapshot({ bodyFatPct: 17.5, leanMassKg: 64.3, fatMassKg: 13.7 }),
    })
    const cmp = buildComparison(from, to)
    const byKey = Object.fromEntries(cmp.metrics.map((m) => [m.key, m]))
    expect(byKey.weight.delta).toBe(-2)
    expect(byKey.bodyFatPct.delta).toBe(-2.5)
    expect(byKey.bodyFatPct.betterWhen).toBe('down')
    expect(byKey.leanMassKg.delta).toBe(0.3)
    expect(byKey.leanMassKg.betterWhen).toBe('up')
    // IMC: 80/1.8² = 24.7 → 78/1.8² = 24.1
    expect(byKey.bmi.from).toBe(24.7)
    expect(byKey.bmi.to).toBe(24.1)
  })

  it('avaliação sem protocolo: composição fica com lado nulo e delta nulo', () => {
    const from = point({ results: null })
    const to = point({ results: snapshot({}) })
    const cmp = buildComparison(from, to)
    const fat = cmp.metrics.find((m) => m.key === 'bodyFatPct')
    expect(fat?.from).toBeNull()
    expect(fat?.delta).toBeNull()
  })

  it('circunferências: união dos pontos, ordem do catálogo, custom no fim', () => {
    const from = point({
      circumferences: [
        { site: 'waist', valueCm: 90 },
        { site: 'Tornozelo D', valueCm: 24 },
      ],
    })
    const to = point({
      circumferences: [
        { site: 'waist', valueCm: 87 },
        { site: 'neck', valueCm: 38 },
      ],
    })
    const cmp = buildComparison(from, to)
    expect(cmp.circumferences.map((c) => c.key)).toEqual(['neck', 'waist', 'Tornozelo D'])
    const waist = cmp.circumferences.find((c) => c.key === 'waist')
    expect(waist?.delta).toBe(-3)
    const neck = cmp.circumferences.find((c) => c.key === 'neck')
    expect(neck?.from).toBeNull()
    expect(neck?.delta).toBeNull()
  })
})

// Protocolos diferentes: a regra já existia no prompt de parecer e não tinha
// chegado às telas, que calculavam e coloriam a diferença sem dizer nada.
describe('buildComparison — protocolos diferentes', () => {
  it('avisa e tira a cor das métricas que dependem do protocolo', () => {
    const cmp = buildComparison(
      point({ protocolId: 'jp7', results: snapshot({ bodyFatPct: 22 }) }),
      point({ protocolId: 'jp3', results: snapshot({ bodyFatPct: 18 }) })
    )
    const byKey = Object.fromEntries(cmp.metrics.map((m) => [m.key, m]))

    expect(cmp.comparabilidade.protocoloMudou).toBe(true)
    expect(cmp.comparabilidade.aviso).toMatch(/troca\s+de\s+método/)
    // derivadas do protocolo: sem direção de melhora/piora
    expect(byKey.bodyFatPct.betterWhen).toBeNull()
    expect(byKey.leanMassKg.betterWhen).toBeNull()
    expect(byKey.fatMassKg.betterWhen).toBeNull()
    // medida direta continua comparável
    expect(byKey.weight.dependeDoProtocolo).toBe(false)
    // e o valor da diferença não some: só deixa de ser pintado
    expect(byKey.bodyFatPct.delta).toBe(-4)
  })

  it('mesmo protocolo não gera aviso nem tira a cor', () => {
    const cmp = buildComparison(
      point({ protocolId: 'jp7', results: snapshot({ bodyFatPct: 22 }) }),
      point({ protocolId: 'jp7', results: snapshot({ bodyFatPct: 18 }) })
    )
    const byKey = Object.fromEntries(cmp.metrics.map((m) => [m.key, m]))

    expect(cmp.comparabilidade.protocoloMudou).toBe(false)
    expect(cmp.comparabilidade.aviso).toBeNull()
    expect(byKey.bodyFatPct.betterWhen).toBe('down')
  })

  it('diferença de percentual sai em pontos percentuais, não em %', () => {
    const cmp = buildComparison(
      point({ results: snapshot({ bodyFatPct: 22 }) }),
      point({ results: snapshot({ bodyFatPct: 18 }) })
    )
    const byKey = Object.fromEntries(cmp.metrics.map((m) => [m.key, m]))

    // 22% -> 18% é queda de QUATRO PONTOS; "-4%" seria redução relativa de 4%
    expect(byKey.bodyFatPct.unit).toBe('%')
    expect(byKey.bodyFatPct.deltaUnit).toBe('p.p.')
    expect(byKey.weight.deltaUnit).toBe('kg')
  })
})
