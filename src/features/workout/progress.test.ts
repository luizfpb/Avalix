import { describe, it, expect } from 'vitest'
import {
  adherencePct,
  completedWeeks,
  exerciseProgression,
  plannedSessions,
  plannedSessionsToDate,
  sessionsPerWeek,
  weekSessionLabels,
} from './progress'
import type { SetHistoryPoint } from './api'

describe('plannedSessions / adherencePct', () => {
  it('sessões previstas = semanas × dias (plano inteiro, só para legenda)', () => {
    expect(plannedSessions(4, 3)).toBe(12)
    expect(plannedSessions(0, 3)).toBe(0)
  })
  it('adesão limitada a 1 e 0 quando nada previsto', () => {
    expect(adherencePct(6, 12)).toBe(0.5)
    expect(adherencePct(15, 12)).toBe(1)
    expect(adherencePct(3, 0)).toBe(0)
  })
})

describe('sessões da semana (regra que estava duplicada em 3 arquivos)', () => {
  it('weekly_schedule vazio = cada divisão uma vez, na ordem', () => {
    expect(weekSessionLabels([], ['A', 'B', 'C'])).toEqual(['A', 'B', 'C'])
    expect(weekSessionLabels(null, ['A', 'B'])).toEqual(['A', 'B'])
    expect(sessionsPerWeek([], 3)).toBe(3)
    expect(sessionsPerWeek(undefined, 2)).toBe(2)
  })

  it('divisão repetida na semana conta em dobro (ABA = 3 sessões)', () => {
    expect(weekSessionLabels(['A', 'B', 'A'], ['A', 'B'])).toEqual(['A', 'B', 'A'])
    expect(sessionsPerWeek(['A', 'B', 'A'], 2)).toBe(3)
  })
})

describe('semanas decorridas', () => {
  const agora = new Date('2026-06-24T10:00:00')

  it('só conta semana fechada', () => {
    expect(completedWeeks('2026-06-24', agora)).toBe(0) // dia 1
    expect(completedWeeks('2026-06-18', agora)).toBe(0) // 6 dias
    expect(completedWeeks('2026-06-17', agora)).toBe(1) // 7 dias
    expect(completedWeeks('2026-06-10', agora)).toBe(2)
  })

  it('plano agendado para o futuro não conta semana negativa', () => {
    expect(completedWeeks('2026-07-01', agora)).toBe(0)
  })

  it('sem data de início não há como saber', () => {
    expect(completedWeeks(null, agora)).toBeNull()
    expect(plannedSessionsToDate(8, 3, null, agora)).toBeNull()
  })

  it('cobra só as semanas fechadas e nunca mais que o plano inteiro', () => {
    // Semana 1 correndo: nada a cobrar ainda (era 0/24 = 0% antes).
    expect(plannedSessionsToDate(8, 3, '2026-06-22', agora)).toBeNull()
    // 1 semana fechada de 8 -> 3 sessões.
    expect(plannedSessionsToDate(8, 3, '2026-06-15', agora)).toBe(3)
    // 2 semanas fechadas -> 6.
    expect(plannedSessionsToDate(8, 3, '2026-06-10', agora)).toBe(6)
    // Plano de 4 semanas iniciado há 20 semanas: limita ao total do plano.
    expect(plannedSessionsToDate(4, 3, '2026-02-01', agora)).toBe(12)
  })

  it('aceita timestamp completo além de data pura', () => {
    expect(completedWeeks('2026-06-10T08:30:00Z', agora)).toBe(2)
  })
})

describe('exerciseProgression', () => {
  const history: SetHistoryPoint[] = [
    // supino, sessão 1: melhor série 100x5 -> e1RM 116.67
    { exerciseId: 'sup', performedAt: '2026-01-01', weightKg: 90, reps: 8, rir: 3 },
    { exerciseId: 'sup', performedAt: '2026-01-01', weightKg: 100, reps: 5, rir: 1 },
    // supino, sessão 2: 105x5 -> 122.5
    { exerciseId: 'sup', performedAt: '2026-01-08', weightKg: 105, reps: 5, rir: 1 },
    // agacho, uma sessão
    { exerciseId: 'agacho', performedAt: '2026-01-02', weightKg: 140, reps: 5, rir: 2 },
    // série sem carga/reps é ignorada
    { exerciseId: 'abdominal', performedAt: '2026-01-02', weightKg: null, reps: 20, rir: null },
  ]

  it('agrupa por exercício e guarda o melhor e1RM por dia', () => {
    const prog = exerciseProgression(history)
    const sup = prog.find((p) => p.exerciseId === 'sup')!
    expect(sup.points).toHaveLength(2)
    expect(sup.points[0].e1rm).toBeCloseTo(116.67, 1) // 100x5 > 90x8 no dia 1
    expect(sup.points[1].e1rm).toBeCloseTo(122.5, 1)
    expect(sup.latestE1rm).toBeCloseTo(122.5, 1)
    expect(sup.bestE1rm).toBeCloseTo(122.5, 1)
    expect(sup.sessions).toBe(2)
  })

  it('ignora séries sem carga ou reps e ordena por nº de sessões', () => {
    const prog = exerciseProgression(history)
    expect(prog.map((p) => p.exerciseId)).not.toContain('abdominal')
    expect(prog[0].exerciseId).toBe('sup') // 2 sessões antes do agacho (1)
  })
})
