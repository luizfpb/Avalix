import type { WorkoutExerciseRow, WorkoutWeekOverrideRow } from './api'

// A prescrição que vale numa semana: a base do exercício com a alteração da
// semana aplicada por cima.
//
// Existe porque o app tinha o CONTRÁRIO em dois lugares e nada com isto. O PDF
// (`overrideDiff`) e o texto de WhatsApp (`planShareText`) montam a *lista do
// que muda* — cada um com seu código —, o que serve para o documento do
// mesociclo inteiro. Quem vai executar o treino de hoje precisa do valor final,
// e derivá-lo na tela seria a terceira interpretação da mesma regra no app.
// O projeto já pagou por isso duas vezes: a regra de sessões por semana estava
// reescrita em três arquivos, e o texto de WhatsApp contradizia o PDF do mesmo
// plano porque não lia os overrides.
//
// Então a direção é esta: o valor efetivo é calculado aqui, e o "o que muda"
// deve ser derivado dele contra a base (ver `effectiveDiff`), nunca recalculado.

export type EffectivePrescription = {
  sets: number
  // nulo = prescrição sem faixa de repetição (aquecimento, mobilidade,
  // trabalho até a falha). Ver migration 0030.
  reps: string | null
  rir: number | null
  restSeconds: number | null
  notes: string | null
  skipped: boolean
}

// Campo nulo no override significa "não altera", e não "apagar o valor" — é
// assim que a coluna é gravada pelo builder (só o campo tocado vai preenchido).
function pick<T>(override: T | null | undefined, base: T): T {
  return override == null ? base : override
}

export function effectivePrescription(
  base: WorkoutExerciseRow,
  override?: WorkoutWeekOverrideRow | null
): EffectivePrescription {
  return {
    sets: pick(override?.sets, base.sets),
    reps: pick(override?.reps, base.reps),
    rir: pick(override?.rir, base.rir),
    restSeconds: pick(override?.rest_seconds, base.rest_seconds),
    notes: pick(override?.notes, base.notes),
    // is_skipped é NOT NULL default false: ausência de override é "executa"
    skipped: override?.is_skipped === true,
  }
}

// O override da semana para um exercício. Índice montado uma vez por quem
// renderiza a lista, em vez de varrer o array por exercício.
export function overrideIndex(
  overrides: WorkoutWeekOverrideRow[]
): Map<string, WorkoutWeekOverrideRow> {
  const index = new Map<string, WorkoutWeekOverrideRow>()
  for (const o of overrides) index.set(`${o.week_number}:${o.workout_exercise_id}`, o)
  return index
}

export function overrideFor(
  index: Map<string, WorkoutWeekOverrideRow>,
  weekNumber: number | null,
  workoutExerciseId: string
): WorkoutWeekOverrideRow | null {
  if (weekNumber == null) return null
  return index.get(`${weekNumber}:${workoutExerciseId}`) ?? null
}

// O que a semana muda em relação à base, derivado do efetivo — a forma que o
// PDF e o texto de WhatsApp precisam. Vazio = a semana segue a prescrição base.
export function effectiveDiff(
  base: WorkoutExerciseRow,
  override?: WorkoutWeekOverrideRow | null
): string[] {
  const e = effectivePrescription(base, override)
  if (e.skipped) return ['não executar']

  const parts: string[] = []
  if (e.sets !== base.sets) parts.push(`${fmtNumero(e.sets)} séries`)
  if (e.reps !== base.reps) parts.push(e.reps == null ? 'sem faixa de reps' : `${e.reps} reps`)
  if (e.rir !== base.rir) parts.push(e.rir == null ? 'sem RIR' : `RIR ${fmtNumero(e.rir)}`)
  if (e.restSeconds !== base.rest_seconds) {
    parts.push(e.restSeconds == null ? 'sem descanso definido' : `${e.restSeconds}s de descanso`)
  }
  if (e.notes !== base.notes && e.notes) parts.push(e.notes)
  return parts
}

// inteiro sem casas; fracionado com 1 casa (séries fracionadas: 2.5, 13)
function fmtNumero(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// `4×8-12`, ou `4 séries` quando não há faixa de repetição prescrita. Fica aqui
// e não em cada tela porque `3×` sem nada depois — o que sairia de um template
// literal com reps nulo — é justamente o defeito que a 0030 veio corrigir.
export function formatSetsReps(sets: number, reps: string | null): string {
  const s = fmtNumero(sets)
  if (!reps) return `${s} ${sets === 1 ? 'série' : 'séries'}`
  return `${s}×${reps}`
}
