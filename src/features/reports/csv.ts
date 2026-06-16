import Papa from 'papaparse'
import type { AssessmentRow } from '../assessment/api'
import type { AssessmentResultSnapshot } from '../assessment/result'
import { protocolLabel } from '../assessment/protocols'

export type CsvDialect = 'intl' | 'br'

const FIELDS = [
  'data',
  'protocolo',
  'peso_kg',
  'altura_cm',
  'gordura_pct',
  'massa_gorda_kg',
  'massa_magra_kg',
  'densidade',
] as const

function round(n: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

export function assessmentCsvRecord(a: AssessmentRow): Record<string, string | number> {
  const r = a.results as AssessmentResultSnapshot | null
  return {
    data: a.assessed_at,
    protocolo: protocolLabel(a.protocol_id),
    peso_kg: a.weight_kg,
    altura_cm: a.height_cm,
    gordura_pct: r ? round(r.bodyFatPct, 1) : '',
    massa_gorda_kg: r ? round(r.fatMassKg, 1) : '',
    massa_magra_kg: r ? round(r.leanMassKg, 1) : '',
    densidade: r?.bodyDensity != null ? round(r.bodyDensity, 4) : '',
  }
}

// intl: separador ',' e decimal '.'. br (Excel BR): separador ';' e decimal ','.
export function buildAssessmentsCsv(
  records: Record<string, string | number>[],
  dialect: CsvDialect = 'intl'
): string {
  if (dialect === 'br') {
    const data = records.map((rec) => {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(rec)) {
        out[k] = typeof v === 'number' ? String(v).replace('.', ',') : String(v)
      }
      return out
    })
    return Papa.unparse({ fields: [...FIELDS], data }, { delimiter: ';' })
  }
  return Papa.unparse({ fields: [...FIELDS], data: records }, { delimiter: ',' })
}
