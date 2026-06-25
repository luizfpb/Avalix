import { describe, it, expect } from 'vitest'
import { buildCarteira } from './carteira'
import type { ActivePlanSummary, LogSummary } from './api'

const now = new Date('2026-06-24T10:00:00')

const subjects = [
  { id: 's1', full_name: 'Ana', is_active: true },
  { id: 's2', full_name: 'Bruno', is_active: true },
  { id: 's3', full_name: 'Carla', is_active: true },
  { id: 's4', full_name: 'Inativo', is_active: false },
]
const activePlans: ActivePlanSummary[] = [
  { planId: 'p1', subjectId: 's1', name: 'ABC', weeks: 4, sessionsPerWeek: 3 }, // 12 previstas
  { planId: 'p2', subjectId: 's2', name: 'AB', weeks: 4, sessionsPerWeek: 2 }, // 8 previstas
]
const logSummary: Record<string, LogSummary> = {
  p1: { count: 10, lastDate: '2026-06-23' }, // aderente, treinou ontem
  p2: { count: 1, lastDate: '2026-06-01' }, // pouca adesao, sumido (23 dias)
}
const lastAssessment: Record<string, string> = {
  s1: '2026-06-10', // recente
  s2: '2026-01-01', // antigo -> reavaliar
  // s3 nunca avaliado -> reavaliar
}

describe('buildCarteira', () => {
  const rows = buildCarteira({ subjects, lastAssessment, activePlans, logSummary, now })

  it('ignora inativos', () => {
    expect(rows.map((r) => r.subjectId)).not.toContain('s4')
    expect(rows).toHaveLength(3)
  })

  it('calcula adesão, reavaliação e sumido', () => {
    const ana = rows.find((r) => r.subjectId === 's1')!
    expect(ana.adherencePct).toBeCloseTo(10 / 12, 5)
    expect(ana.reassessDue).toBe(false)
    expect(ana.quiet).toBe(false)

    const bruno = rows.find((r) => r.subjectId === 's2')!
    expect(bruno.adherencePct).toBeCloseTo(1 / 8, 5)
    expect(bruno.reassessDue).toBe(true) // avaliacao antiga
    expect(bruno.quiet).toBe(true) // 23 dias sem treino

    const carla = rows.find((r) => r.subjectId === 's3')!
    expect(carla.reassessDue).toBe(true) // nunca avaliada
    expect(carla.adherencePct).toBeNull() // sem plano ativo
  })

  it('ordena por urgência (mais sinais primeiro)', () => {
    // Bruno tem reavaliar(2)+sumido(2)+baixa adesao(1)=5; Carla reavaliar(2);
    // Ana 0 -> ordem Bruno, Carla, Ana
    expect(rows.map((r) => r.subjectId)).toEqual(['s2', 's3', 's1'])
  })
})
