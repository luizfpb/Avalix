import { describe, it, expect } from 'vitest'
import { adherencePct, exerciseProgression, plannedSessions } from './progress'
import type { SetHistoryPoint } from './api'

describe('plannedSessions / adherencePct', () => {
  it('sessões previstas = semanas × dias', () => {
    expect(plannedSessions(4, 3)).toBe(12)
    expect(plannedSessions(0, 3)).toBe(0)
  })
  it('adesão limitada a 1 e 0 quando nada previsto', () => {
    expect(adherencePct(6, 12)).toBe(0.5)
    expect(adherencePct(15, 12)).toBe(1)
    expect(adherencePct(3, 0)).toBe(0)
  })
})

describe('exerciseProgression', () => {
  const history: SetHistoryPoint[] = [
    // supino, sessão 1: melhor série 100x5 -> e1RM 116.67
    { exerciseId: 'sup', performedAt: '2026-01-01', weightKg: 90, reps: 8 },
    { exerciseId: 'sup', performedAt: '2026-01-01', weightKg: 100, reps: 5 },
    // supino, sessão 2: 105x5 -> 122.5
    { exerciseId: 'sup', performedAt: '2026-01-08', weightKg: 105, reps: 5 },
    // agacho, uma sessão
    { exerciseId: 'agacho', performedAt: '2026-01-02', weightKg: 140, reps: 5 },
    // série sem carga/reps é ignorada
    { exerciseId: 'abdominal', performedAt: '2026-01-02', weightKg: null, reps: 20 },
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
