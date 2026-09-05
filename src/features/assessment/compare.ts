import { computeBmi } from './bmi'
import {
  comparabilidadeDeProtocolos,
  METRICAS_DEPENDENTES_DO_PROTOCOLO,
  type Comparabilidade,
} from './comparability'
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
  protocolId?: string | null
  results: AssessmentResultSnapshot | null
  circumferences: { site: string; valueCm: number }[]
}

export type CompareRow = {
  key: string
  label: string
  unit: string
  /**
   * Unidade da DIFERENÇA, quando não é a do valor. De 22% para 18% a variação é
   * de quatro PONTOS PERCENTUAIS; escrito "4%" o número lê como redução
   * relativa de 4%, que seria outra conta.
   */
  deltaUnit: string
  from: number | null
  to: number | null
  // delta = to - from; null quando falta um dos lados
  delta: number | null
  betterWhen: 'up' | 'down' | null
  decimals: number
  /** o valor depende do protocolo (sai da densidade corporal) */
  dependeDoProtocolo: boolean
}

export type Comparison = {
  metrics: CompareRow[]
  circumferences: CompareRow[]
  /** protocolos das duas pontas e o aviso quando eles diferem */
  comparabilidade: Comparabilidade
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d

function row(
  key: string,
  label: string,
  unit: string,
  from: number | null,
  to: number | null,
  betterWhen: 'up' | 'down' | null,
  decimals = 1,
  deltaUnit = unit
): CompareRow {
  const delta = from != null && to != null ? round(to - from, decimals) : null
  return {
    key,
    label,
    unit,
    deltaUnit,
    from,
    to,
    delta,
    betterWhen,
    decimals,
    dependeDoProtocolo: METRICAS_DEPENDENTES_DO_PROTOCOLO.has(key),
  }
}

// ordem canônica dos perímetros = ordem do catálogo; customizados no fim, por nome
const CATALOG_ORDER = new Map<string, number>(
  CIRCUMFERENCE_CATALOG.flatMap((g) => g.items).map((item, i) => [item.key, i])
)

export function buildComparison(from: ComparePoint, to: ComparePoint): Comparison {
  const rf = from.results
  const rt = to.results

  const comparabilidade = comparabilidadeDeProtocolos([from.protocolId, to.protocolId])

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
    row('bodyFatPct', '% de gordura', '%', rf?.bodyFatPct ?? null, rt?.bodyFatPct ?? null, 'down', 1, 'p.p.'),
    row('leanMassKg', 'Massa magra', 'kg', rf?.leanMassKg ?? null, rt?.leanMassKg ?? null, 'up'),
    row('fatMassKg', 'Massa gorda', 'kg', rf?.fatMassKg ?? null, rt?.fatMassKg ?? null, 'down'),
  ]
    .filter((m) => m.from != null || m.to != null)
    // Protocolo diferente entre as pontas: a diferença das métricas derivadas
    // deixa de ser pintada de melhora/piora. Continuar colorindo afirmaria
    // progresso onde parte do número é troca de método.
    .map((m) =>
      comparabilidade.protocoloMudou && m.dependeDoProtocolo ? { ...m, betterWhen: null } : m
    )

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

  return { metrics, circumferences, comparabilidade }
}
