// Estimativa de 1RM (e1RM) a partir de carga x repetições, e tabela de %1RM.
// Fórmulas clássicas e amplamente citadas:
//   Epley:   1RM = w * (1 + reps/30)
//   Brzycki: 1RM = w * 36 / (37 - reps)
// São ESTIMATIVAS, não verdade: válidas para reps baixas/moderadas; acima de
// ~10-12 reps a precisão cai (comum a todas as fórmulas de e1RM). Exibir como tal.

export type OneRmFormula = 'epley' | 'brzycki'

export const ONE_RM_FORMULA_LABELS: Record<OneRmFormula, string> = {
  epley: 'Epley',
  brzycki: 'Brzycki',
}

export function estimateOneRm(weight: number, reps: number, formula: OneRmFormula = 'epley'): number {
  if (!(weight > 0) || !(reps >= 1)) return 0
  if (reps === 1) return weight
  if (formula === 'brzycki') {
    if (reps >= 37) return 0 // a fórmula degenera (denominador <= 0)
    return (weight * 36) / (37 - reps)
  }
  return weight * (1 + reps / 30)
}

// Carga para um dado %1RM.
export function loadForPercent(oneRm: number, pct: number): number {
  return oneRm * (pct / 100)
}

// Repetições estimadas para uma carga (inverso do Epley) — guia de reps por %.
export function repsForLoad(oneRm: number, weight: number): number {
  if (!(oneRm > 0) || !(weight > 0)) return 0
  if (weight >= oneRm) return 1
  return Math.max(1, Math.round((oneRm / weight - 1) * 30))
}

export type PercentRow = { pct: number; load: number; reps: number }

// Tabela de %1RM (default 100..40 de 5 em 5), com reps estimadas por linha.
export function percentTable(
  oneRm: number,
  pcts: number[] = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40]
): PercentRow[] {
  return pcts.map((pct) => {
    const load = loadForPercent(oneRm, pct)
    return { pct, load, reps: repsForLoad(oneRm, load) }
  })
}

// Arredonda para um incremento de carga (default 2,5 kg), deixando a tabela
// prática para a barra/halteres da academia.
export function roundToIncrement(value: number, increment = 2.5): number {
  if (!(increment > 0)) return value
  return Math.round(value / increment) * increment
}
