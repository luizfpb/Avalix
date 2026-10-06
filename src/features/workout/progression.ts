import type { SetHistoryPoint } from './api'
import { estimateOneRm } from './oneRm'

// Motor de SUGESTAO de progressao (v2). Principio (DECISIONS): o treinador e o
// cerebro — isto NUNCA altera o plano sozinho, so sugere. Metodo: dupla
// progressao (progride reps dentro da faixa ate o topo, ai sobe carga) com
// autorregulacao por RIR. Versionado e com motivo explicito (transparencia).
// @2: incremento proporcional à carga (defaultLoadStep), sugestão sem arredondar
// para a grade de 2,5 kg e "manter" quando o topo da faixa veio com RIR abaixo
// do alvo.
export const PROGRESSION_ENGINE_VERSION = 'progression-engine@2'

export type RepRange = { min: number; max: number }

// "8-12" -> {8,12}; "10" -> {10,10}; "30s"/vazio/invalido -> null.
// Aceita nulo porque a faixa de repetição é opcional desde a 0030: prescrição
// sem faixa simplesmente não tem alvo de progressão, e é o mesmo caso de um
// texto que não parseia ("até a falha") — que esta função já tratava.
export function parseRepRange(reps: string | null): RepRange | null {
  if (reps == null) return null
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

// Incremento padrão pela faixa de carga. Os 2,5 kg fixos da v1 vinham da
// barra com anilhas de 1,25 kg, e em carga leve eram desproporcionais: num
// halter de 4 kg a sugestão saltava para 7,5 kg (+87%), e num de 2 kg a
// redução sugeria 0 kg. Abaixo de 10 kg os halteres vão de 1 em 1 kg; até 20 kg,
// de 2 em 2.
export function defaultLoadStep(weightKg: number): number {
  if (weightKg < 10) return 1
  if (weightKg < 20) return 2
  return 2.5
}

// Só tira o ruído de ponto flutuante. A v1 arredondava para a grade de 2,5 kg,
// o que movia a carga usada de verdade (17 kg + 2,5 virava 20 kg) e fazia o
// motivo ("+2,5 kg") contradizer o número sugerido.
function roundKg(v: number): number {
  return Math.round(v * 100) / 100
}

function fmtKg(v: number): string {
  return String(roundKg(v)).replace('.', ',')
}

// Sugere a proxima sessao a partir da melhor serie da ultima + faixa de reps
// prescrita + RIR alvo. loadStep = incremento de carga (default: defaultLoadStep).
export function suggestProgression(input: {
  last: LastSetPerf
  repRange: RepRange | null
  targetRir: number | null
  loadStep?: number
}): ProgressionSuggestion {
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
  const step = input.loadStep ?? defaultLoadStep(w)

  // muito dificil: abaixo do minimo da faixa, ou RIR bem abaixo do alvo
  if (r < repRange.min || (targetRir != null && rir != null && rir < targetRir - 1)) {
    const menor = roundKg(w - step)
    if (menor <= 0) {
      // Não há carga menor para oferecer: sugerir 0 kg seria tirar o exercício.
      return {
        kind: 'hold',
        suggestedWeightKg: w,
        suggestedReps: repRange.min,
        reason: `Ficou abaixo da faixa/RIR, mas a carga já é a menor: manter e reconstruir a partir de ${repRange.min} reps.`,
      }
    }
    return {
      kind: 'reduce',
      suggestedWeightKg: menor,
      suggestedReps: repRange.min,
      reason: `Ficou abaixo da faixa/RIR: reduzir ${fmtKg(step)} kg e reconstruir.`,
    }
  }

  const hitTop = r >= repRange.max
  const easyEnough = targetRir == null || rir == null || rir >= targetRir
  // bateu o topo da faixa com folga (RIR >= alvo): sobe carga, volta ao fundo
  if (hitTop && easyEnough) {
    return {
      kind: 'increase_load',
      suggestedWeightKg: roundKg(w + step),
      suggestedReps: repRange.min,
      reason: `Bateu ${repRange.max} reps com RIR ≥ alvo: +${fmtKg(step)} kg e voltar a ${repRange.min} reps.`,
    }
  }

  // Chegou ao topo, mas mais perto da falha do que o prescrito: não há rep a
  // somar nem folga para subir carga. A v1 caía no "+1 rep" com o mesmo número
  // de repetições.
  if (hitTop) {
    return {
      kind: 'hold',
      suggestedWeightKg: w,
      suggestedReps: r,
      reason: `Chegou a ${r} reps, mas com RIR abaixo do alvo: manter carga e repetições até sobrar folga.`,
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
  const alvo = weightKg * 0.6
  const step = defaultLoadStep(alvo)
  return {
    weightKg: Math.max(0, Math.round(alvo / step) * step),
    sets: Math.max(1, Math.round(sets * 0.6)),
  }
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
