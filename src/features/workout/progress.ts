import type { SetHistoryPoint } from './api'
import { estimateOneRm } from './oneRm'

// Análise de execução: adesão (sessões feitas x previstas) e progressão de
// carga por exercício (melhor e1RM por dia ao longo do tempo). Puro e testável;
// reusa o motor de e1RM da calculadora (Etapa F).

export function plannedSessions(weeks: number, dayCount: number): number {
  return Math.max(0, Math.floor(weeks)) * Math.max(0, Math.floor(dayCount))
}

export function adherencePct(done: number, planned: number): number {
  if (planned <= 0) return 0
  return Math.min(1, done / planned)
}

export type ExerciseProgress = {
  exerciseId: string
  points: { date: string; e1rm: number }[] // melhor e1RM por dia, ordem cronológica
  latestE1rm: number
  bestE1rm: number
  sessions: number
}

// Agrupa o histórico por exercício e, dentro de cada um, por dia, guardando o
// MELHOR e1RM do dia (a série mais forte). Séries sem carga+reps são ignoradas
// (bodyweight/tempo não geram e1RM).
export function exerciseProgression(history: SetHistoryPoint[]): ExerciseProgress[] {
  const byExercise = new Map<string, Map<string, number>>()
  for (const h of history) {
    if (!(h.weightKg && h.weightKg > 0) || !(h.reps && h.reps > 0)) continue
    const e1 = estimateOneRm(h.weightKg, h.reps)
    if (!(e1 > 0)) continue
    const dates = byExercise.get(h.exerciseId) ?? new Map<string, number>()
    dates.set(h.performedAt, Math.max(dates.get(h.performedAt) ?? 0, e1))
    byExercise.set(h.exerciseId, dates)
  }

  const out: ExerciseProgress[] = []
  for (const [exerciseId, dates] of byExercise) {
    const points = [...dates.entries()]
      .map(([date, e1rm]) => ({ date, e1rm }))
      .sort((a, b) => a.date.localeCompare(b.date))
    if (points.length === 0) continue
    out.push({
      exerciseId,
      points,
      latestE1rm: points[points.length - 1].e1rm,
      bestE1rm: Math.max(...points.map((p) => p.e1rm)),
      sessions: points.length,
    })
  }
  // mais sessões primeiro (exercícios mais acompanhados no topo)
  return out.sort((a, b) => b.sessions - a.sessions)
}
