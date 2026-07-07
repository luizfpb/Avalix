import { computeBmi } from './bmi'
import { CIRCUMFERENCE_CATALOG, circumferenceLabel } from './sites'
import type { AssessmentResultSnapshot } from './result'

// Comparação "antes → depois" entre duas avaliações do mesmo avaliado (P1 da
// auditoria v2.0). Puro e testável: a página só formata o que sai daqui.
// betterWhen orienta a cor do Δ (igual aos flags betterUp/betterDown da tela
// de evolução); métricas sem direção universal (peso, IMC, perímetros — o
// objetivo varia) ficam neutras.

export type ComparePoint = {
  assessedAt: string
  weightKg: number
  heightCm: number
  results: AssessmentResultSnapshot | null
  circumferences: { site: string; valueCm: number }[]
}

export type CompareRow = {
  key: string
  label: string
  unit: string
  from: number | null
  to: number | null
  // delta = to - from; null quando falta um dos lados
  delta: number | null
  betterWhen: 'up' | 'down' | null
  decimals: number
}

export type Comparison = {
  metrics: CompareRow[]
  circumferences: CompareRow[]
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d

function row(
  key: string,
  label: string,
  unit: string,
  from: number | null,
  to: number | null,
  betterWhen: 'up' | 'down' | null,
  decimals = 1
): CompareRow {
  const delta = from != null && to != null ? round(to - from, decimals) : null
  return { key, label, unit, from, to, delta, betterWhen, decimals }
}

// ordem canônica dos perímetros = ordem do catálogo; customizados no fim, por nome
const CATALOG_ORDER = new Map<string, number>(
  CIRCUMFERENCE_CATALOG.flatMap((g) => g.items).map((item, i) => [item.key, i])
)

export function buildComparison(from: ComparePoint, to: ComparePoint): Comparison {
  const rf = from.results
  const rt = to.results

  const metrics: CompareRow[] = [
    row('weight', 'Peso', 'kg', from.weightKg, to.weightKg, null),
    row(
      'bmi',
      'IMC',
      '',
      round(computeBmi(from.weightKg, from.heightCm), 1),
      round(computeBmi(to.weightKg, to.heightCm), 1),
      null
    ),
    row('bodyFatPct', '% de gordura', '%', rf?.bodyFatPct ?? null, rt?.bodyFatPct ?? null, 'down'),
    row('leanMassKg', 'Massa magra', 'kg', rf?.leanMassKg ?? null, rt?.leanMassKg ?? null, 'up'),
    row('fatMassKg', 'Massa gorda', 'kg', rf?.fatMassKg ?? null, rt?.fatMassKg ?? null, 'down'),
  ].filter((m) => m.from != null || m.to != null)

  const fromBySite = new Map(from.circumferences.map((c) => [c.site, c.valueCm]))
  const toBySite = new Map(to.circumferences.map((c) => [c.site, c.valueCm]))
  const sites = [...new Set([...fromBySite.keys(), ...toBySite.keys()])].sort((a, b) => {
    const ia = CATALOG_ORDER.get(a)
    const ib = CATALOG_ORDER.get(b)
    if (ia != null && ib != null) return ia - ib
    if (ia != null) return -1
    if (ib != null) return 1
    return a.localeCompare(b)
  })

  const circumferences = sites.map((site) =>
    row(site, circumferenceLabel(site), 'cm', fromBySite.get(site) ?? null, toBySite.get(site) ?? null, null)
  )

  return { metrics, circumferences }
}
