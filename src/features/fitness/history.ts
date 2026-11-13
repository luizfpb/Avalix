// Comparação com os testes anteriores: para cada teste deste registro, o
// resultado mais recente ANTES dele em que aquele mesmo teste foi aplicado.
// Registro do mesmo dia conta como anterior só se foi criado antes.

import type { Sex } from '../assessment/protocols'
import { ageOnDate } from '../../lib/age'
import type { FitnessTestRow } from './api'
import { computeFitness } from './engine'
import { parseMeasures, type FitnessTestKey } from './measures'

export type Previous = { testedAt: string; value: number; ratingLabel: string | null }

function isBefore(a: FitnessTestRow, b: FitnessTestRow): boolean {
  if (a.tested_at !== b.tested_at) return a.tested_at < b.tested_at
  if (a.created_at !== b.created_at) return a.created_at < b.created_at
  return a.id < b.id
}

export function previousResults(
  current: FitnessTestRow,
  all: FitnessTestRow[],
  sex: Sex,
  birthDate: string
): Partial<Record<FitnessTestKey, Previous>> {
  const older = all
    .filter((t) => t.id !== current.id && isBefore(t, current))
    .sort((a, b) => (isBefore(a, b) ? 1 : -1))
  const out: Partial<Record<FitnessTestKey, Previous>> = {}
  for (const t of older) {
    const age = ageOnDate(birthDate, t.tested_at)
    if (age == null) continue
    for (const r of computeFitness(parseMeasures(t.measures), sex, age)) {
      if (out[r.key]) continue
      out[r.key] = { testedAt: t.tested_at, value: r.value, ratingLabel: r.rating?.label ?? null }
    }
  }
  return out
}
