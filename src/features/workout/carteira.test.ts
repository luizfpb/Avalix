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
// Ambos comecaram em 27/05/2026, ou seja, 4 semanas fechadas em 24/06 — o
// plano inteiro ja decorreu, entao o denominador cobravel e o total.
const activePlans: ActivePlanSummary[] = [
  { planId: 'p1', subjectId: 's1', name: 'ABC', weeks: 4, sessionsPerWeek: 3, startedOn: '2026-05-27' }, // 12 cobraveis
  { planId: 'p2', subjectId: 's2', name: 'AB', weeks: 4, sessionsPerWeek: 2, startedOn: '2026-05-27' }, // 8 cobraveis
]
const logSummary: Record<string, LogSummary> = {
  p1: { count: 10, lastDate: '2026-06-23' }, // aderente, treinou ontem
  p2: { count: 1, lastDate: '2026-06-01' }, // pouca adesão, sem treino recente (23 dias)
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

  it('calcula adesão, reavaliação e ausência de treino recente', () => {
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
    // Bruno tem reavaliar(2)+sem treino recente(2)+baixa adesão(1)=5; Carla reavaliar(2);
    // Ana 0 -> ordem Bruno, Carla, Ana
    expect(rows.map((r) => r.subjectId)).toEqual(['s2', 's3', 's1'])
  })

  // Regressao: o denominador era o plano INTEIRO, ignorando o tempo decorrido.
  // Como quase todo plano ativo esta na primeira metade, todo aluno em dia
  // aparecia como relapso — bem na tela desenhada para retencao.
  it('nao penaliza plano recem-criado nem aluno em dia no meio do plano', () => {
    const recemCriado = buildCarteira({
      subjects: [{ id: 's1', full_name: 'Ana', is_active: true }],
      lastAssessment: { s1: '2026-06-20' },
      activePlans: [
        { planId: 'p1', subjectId: 's1', name: 'ABC', weeks: 8, sessionsPerWeek: 3, startedOn: '2026-06-24' },
      ],
      logSummary: { p1: { count: 0, lastDate: null } },
      now,
    })[0]
    // Antes: adherencePct 0, quiet true (Infinity >= 10), attention 3.
    expect(recemCriado.adherencePct).toBeNull()
    expect(recemCriado.quiet).toBe(false)
    expect(recemCriado.attention).toBe(0)

    const emDia = buildCarteira({
      subjects: [{ id: 's1', full_name: 'Ana', is_active: true }],
      lastAssessment: { s1: '2026-06-20' },
      activePlans: [
        // Semana 2 de um plano de 8; 1 semana fechada -> 3 sessoes cobraveis.
        { planId: 'p1', subjectId: 's1', name: 'ABC', weeks: 8, sessionsPerWeek: 3, startedOn: '2026-06-15' },
      ],
      logSummary: { p1: { count: 3, lastDate: '2026-06-22' } },
      now,
    })[0]
    // Antes: 3/24 = 12,5% e barra laranja para quem nao faltou a nada.
    expect(emDia.adherencePct).toBe(1)
    expect(emDia.quiet).toBe(false)
    expect(emDia.attention).toBe(0)
  })

  it('conta o silencio a partir do inicio do plano quando nao ha log nenhum', () => {
    const abandonado = buildCarteira({
      subjects: [{ id: 's1', full_name: 'Ana', is_active: true }],
      lastAssessment: { s1: '2026-06-20' },
      activePlans: [
        { planId: 'p1', subjectId: 's1', name: 'ABC', weeks: 8, sessionsPerWeek: 3, startedOn: '2026-05-01' },
      ],
      logSummary: { p1: { count: 0, lastDate: null } },
      now,
    })[0]
    expect(abandonado.quiet).toBe(true) // 54 dias desde o inicio, nenhum treino
    expect(abandonado.adherencePct).toBe(0)
  })
})
