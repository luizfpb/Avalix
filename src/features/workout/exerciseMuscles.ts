import { MUSCLE_LABELS, type MuscleGroup } from './volume'

// Músculos principais de um exercício (0040): `primary_muscle` é o principal —
// ordena e agrupa a biblioteca — e `additional_primary_muscles` guarda até dois
// outros, com o mesmo peso no volume. A coluna é opcional aqui porque um banco
// anterior à 0040 (ou tipos ainda não regenerados) não a traz.
export type ExerciseMuscleRow = {
  primary_muscle: string
  additional_primary_muscles?: string[] | null
  secondary_muscles: string[]
}

export const MAX_ADDITIONAL_PRIMARY = 2

export function additionalPrimaryMuscles(row: ExerciseMuscleRow): MuscleGroup[] {
  return (row.additional_primary_muscles ?? []) as MuscleGroup[]
}

export function primaryMuscles(row: ExerciseMuscleRow): MuscleGroup[] {
  return [row.primary_muscle as MuscleGroup, ...additionalPrimaryMuscles(row)]
}

// "Quadríceps + Glúteos", para listas e buscas.
export function primaryMusclesLabel(row: ExerciseMuscleRow): string {
  return primaryMuscles(row).map((m) => MUSCLE_LABELS[m] ?? m).join(' + ')
}

// O exercício trabalha este músculo, como principal ou secundário? É o filtro
// "por músculo" da biblioteca e do seletor.
export function worksMuscle(row: ExerciseMuscleRow, muscle: string): boolean {
  return (primaryMuscles(row) as string[]).includes(muscle) || row.secondary_muscles.includes(muscle)
}
