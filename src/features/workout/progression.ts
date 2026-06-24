import type { SetHistoryPoint } from './api'
import { estimateOneRm } from './oneRm'

// Motor de SUGESTAO de progressao (v2). Principio (DECISIONS): o treinador e o
// cerebro — isto NUNCA altera o plano sozinho, so sugere. Metodo: dupla
// progressao (progride reps dentro da faixa ate o topo, ai sobe carga) com
// autorregulacao por RIR. Versionado e com motivo explicito (transparencia).
export const PROGRESSION_ENGINE_VERSION = 'progression-engine@1'

export type RepRange = { min: number; max: number }

// "8-12" -> {8,12}; "10" -> {10,10}; "30s"/vazio/invalido -> null.
export function parseRepRange(reps: string): RepRange | null {
  const t = reps.trim()
  const range = /^(\d+)\s*[-–a]\s*(\d+)$/.exec(t)
  if (range) {
    const min = Number(range[1])
    const max = Number(range[2])
    return min > 0 && max >= min ? { min, max } : null
  }
  const single = /^(\d+)$/.exec(t)
  if (single) {
    const n = Number(single[1])
    return n > 0 ? { min: n, max: n } : null
  }
  return null
}

export type LastSetPerf = { weightKg: number | null; reps: number | null; rir: number | null }

export type ProgressionKind = 'increase_load' | 'add_reps' | 'hold' | 'reduce' | 'insufficient'

export type ProgressionSuggestion = {
  kind: ProgressionKind
  suggestedWeightKg: number | null
  suggestedReps: number | null
  reason: string
}

function roundLoad(v: number, step: number): number {
  return Math.max(0, Math.round(v / step) * step)
}

// Sugere a proxima sessao a partir da melhor serie da ultima + faixa de reps
// prescrita + RIR alvo. loadStep = incremento de carga (default 2,5 kg).
export function suggestProgression(input: {
  last: LastSetPerf
  repRange: RepRange | null
  targetRir: number | null
  loadStep?: number
}): ProgressionSuggestion {
  const step = input.loadStep ?? 2.5
  const { last, repRange, targetRir } = input

  if (last.weightKg == null || last.reps == null || repRange == null) {
    return {
      kind: 'insufficient',
      suggestedWeightKg: last.weightKg ?? null,
      suggestedReps: null,
      reason: 'Sem carga/reps registrados ou faixa de reps definida para sugerir.',
    }
  }

  const w = last.weightKg
  const r = last.reps
  const rir = last.rir

  // muito dificil: abaixo do minimo da faixa, ou RIR bem abaixo do alvo
  if (r < repRange.min || (targetRir != null && rir != null && rir < targetRir - 1)) {
    return {
      kind: 'reduce',
      suggestedWeightKg: roundLoad(w - step, step),
      suggestedReps: repRange.min,
      reason: 'Ficou abaixo da faixa/RIR — reduzir um pouco a carga e reconstruir.',
    }
  }

  // bateu o topo da faixa com folga (RIR >= alvo): sobe carga, volta ao fundo
  const hitTop = r >= repRange.max
  const easyEnough = targetRir == null || rir == null || rir >= targetRir
  if (hitTop && easyEnough) {
    return {
      kind: 'increase_load',
      suggestedWeightKg: roundLoad(w + step, step),
      suggestedReps: repRange.min,
      reason: `Bateu ${repRange.max} reps com RIR ≥ alvo — +${step} kg e voltar a ${repRange.min} reps.`,
    }
  }

  // dentro da faixa: mesma carga, mirar +1 rep (ate o topo)
  const target = Math.min(repRange.max, r + 1)
  return {
    kind: 'add_reps',
    suggestedWeightKg: w,
    suggestedReps: target,
    reason: `Mesma carga, mirar ${target} reps (progressão por repetição).`,
  }
}

// Deload: carga ~60% e series reduzidas, pra uma semana mais leve.
export function suggestDeload(weightKg: number, sets: number): { weightKg: number; sets: number } {
  return { weightKg: roundLoad(weightKg * 0.6, 2.5), sets: Math.max(1, Math.round(sets * 0.6)) }
}

// Melhor serie (por e1RM) da sessao mais recente de cada exercicio — entrada do
// suggestProgression. Series sem carga+reps sao ignoradas.
export function latestBestByExercise(
  history: SetHistoryPoint[]
): Map<string, LastSetPerf & { date: string }> {
  const latestDate = new Map<string, string>()
  for (const h of history) {
    const cur = latestDate.get(h.exerciseId)
    if (!cur || h.performedAt > cur) latestDate.set(h.exerciseId, h.performedAt)
  }
  const best = new Map<string, LastSetPerf & { date: string }>()
  for (const h of history) {
    if (h.performedAt !== latestDate.get(h.exerciseId)) continue
    if (!(h.weightKg && h.weightKg > 0) || !(h.reps && h.reps > 0)) continue
    const e1 = estimateOneRm(h.weightKg, h.reps)
    const prev = best.get(h.exerciseId)
    const prevE1 = prev?.weightKg && prev.reps ? estimateOneRm(prev.weightKg, prev.reps) : -1
    if (!prev || e1 > prevE1) {
      best.set(h.exerciseId, { weightKg: h.weightKg, reps: h.reps, rir: h.rir, date: h.performedAt })
    }
  }
  return best
}
