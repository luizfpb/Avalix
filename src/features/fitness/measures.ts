// Medidas dos testes físicos, no formato de fitness_tests.measures (0059).
// O banco recusa chave desconhecida e valor fora da faixa física
// (app.fitness_measures_valid); FAIXAS abaixo é a mesma regra, para a tela
// avisar antes de mandar. Mudou um limite lá, muda aqui (measures.test.ts).

export type FitnessMeasures = {
  cooper?: { distance_m: number }
  rockport?: { time_s: number; heart_rate_bpm: number; weight_kg: number }
  queens?: { heart_rate_bpm: number }
  push_ups?: { reps: number; knees: boolean }
  sit_ups?: { reps: number }
  sit_and_reach?: { best_cm: number; feet_mark_cm: 23 | 26 }
  grip?: { right_kg?: number; left_kg?: number }
}

export type FitnessTestKey = keyof FitnessMeasures

export const TEST_ORDER: FitnessTestKey[] = [
  'cooper',
  'rockport',
  'queens',
  'push_ups',
  'sit_ups',
  'sit_and_reach',
  'grip',
]

export const TEST_LABELS: Record<FitnessTestKey, string> = {
  cooper: 'Corrida de 12 minutos (Cooper)',
  rockport: 'Caminhada de 1 milha (Rockport)',
  queens: 'Banco de Queens (3 minutos)',
  push_ups: 'Flexão de braço',
  sit_ups: 'Abdominal em 1 minuto',
  sit_and_reach: 'Sentar e alcançar (banco de Wells)',
  grip: 'Preensão manual (dinamômetro)',
}

export type Range = { min: number; max: number }

export const FAIXAS = {
  cooper_distance_m: { min: 600, max: 5000 },
  rockport_time_s: { min: 360, max: 3600 },
  heart_rate_bpm: { min: 40, max: 230 },
  rockport_weight_kg: { min: 20, max: 350 },
  push_ups_reps: { min: 0, max: 300 },
  sit_ups_reps: { min: 0, max: 200 },
  sit_and_reach_cm: { min: 0, max: 80 },
  grip_kg: { min: 1, max: 150 },
} as const satisfies Record<string, Range>

export function inRange(value: number, range: Range): boolean {
  return Number.isFinite(value) && value >= range.min && value <= range.max
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

// Leitura defensiva do jsonb: o que não tiver o formato esperado fica de fora,
// em vez de quebrar a tela de quem abre um registro antigo ou mexido à mão.
export function parseMeasures(raw: unknown): FitnessMeasures {
  const root = obj(raw)
  if (!root) return {}
  const out: FitnessMeasures = {}

  const cooper = obj(root.cooper)
  const distance = num(cooper?.distance_m)
  if (distance != null) out.cooper = { distance_m: distance }

  const rockport = obj(root.rockport)
  const time = num(rockport?.time_s)
  const rHr = num(rockport?.heart_rate_bpm)
  const weight = num(rockport?.weight_kg)
  if (time != null && rHr != null && weight != null) {
    out.rockport = { time_s: time, heart_rate_bpm: rHr, weight_kg: weight }
  }

  const queens = obj(root.queens)
  const qHr = num(queens?.heart_rate_bpm)
  if (qHr != null) out.queens = { heart_rate_bpm: qHr }

  const push = obj(root.push_ups)
  const pReps = num(push?.reps)
  if (pReps != null && typeof push?.knees === 'boolean') out.push_ups = { reps: pReps, knees: push.knees }

  const sit = obj(root.sit_ups)
  const sReps = num(sit?.reps)
  if (sReps != null) out.sit_ups = { reps: sReps }

  const reach = obj(root.sit_and_reach)
  const best = num(reach?.best_cm)
  const feet = num(reach?.feet_mark_cm)
  if (best != null && (feet === 23 || feet === 26)) out.sit_and_reach = { best_cm: best, feet_mark_cm: feet }

  const grip = obj(root.grip)
  const right = num(grip?.right_kg)
  const left = num(grip?.left_kg)
  if (right != null || left != null) {
    out.grip = {
      ...(right != null ? { right_kg: right } : {}),
      ...(left != null ? { left_kg: left } : {}),
    }
  }
  return out
}

export function presentTests(m: FitnessMeasures): FitnessTestKey[] {
  return TEST_ORDER.filter((k) => m[k] !== undefined)
}
