import { z } from 'zod'
import type { CreateExerciseInput } from './api'
import type { Equipment, MovementPattern, MuscleGroup } from './volume'
import {
  EQUIPMENT_LABELS,
  GOAL_LABELS,
  MOVEMENT_LABELS,
  MUSCLE_LABELS,
  MUSCLE_ORDER,
} from './volume'

// Opcoes pros selects da UI, na ordem canonica. value = chave em ingles (banco),
// label = pt-BR.
export const MUSCLE_OPTIONS = MUSCLE_ORDER.map((m) => ({ value: m, label: MUSCLE_LABELS[m] }))
export const EQUIPMENT_OPTIONS = (Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((e) => ({
  value: e,
  label: EQUIPMENT_LABELS[e],
}))
export const MOVEMENT_OPTIONS = (Object.keys(MOVEMENT_LABELS) as MovementPattern[]).map((p) => ({
  value: p,
  label: MOVEMENT_LABELS[p],
}))
export const GOAL_OPTIONS = (Object.keys(GOAL_LABELS) as string[]).map((g) => ({
  value: g,
  label: GOAL_LABELS[g],
}))

const muscleEnum = z.enum(MUSCLE_ORDER as [MuscleGroup, ...MuscleGroup[]])
const equipmentEnum = z.enum(Object.keys(EQUIPMENT_LABELS) as [Equipment, ...Equipment[]])
const movementEnum = z.enum(Object.keys(MOVEMENT_LABELS) as [MovementPattern, ...MovementPattern[]])

// =====================================================================
// FORM DE EXERCICIO CUSTOM
// O catalogo global cobre o repertorio comum; este e o fluxo "esta faltando".
// Metadados de musculo/equipamento/padrao sao OBRIGATORIOS — sem eles o volume
// nao significa nada (mesma exigencia do schema no banco).
// =====================================================================

export const exerciseFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Informe o nome').max(120, 'Máximo de 120 caracteres'),
    primary_muscle: z.string().min(1, 'Selecione o músculo principal'),
    secondary_muscles: z.array(muscleEnum).default([]),
    equipment: z.string().min(1, 'Selecione o equipamento'),
    movement_pattern: z.string().min(1, 'Selecione o padrão de movimento'),
    is_unilateral: z.boolean().optional(),
    cues: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (!muscleEnum.safeParse(v.primary_muscle).success) {
      ctx.addIssue({ code: 'custom', path: ['primary_muscle'], message: 'Músculo inválido' })
    }
    if (!equipmentEnum.safeParse(v.equipment).success) {
      ctx.addIssue({ code: 'custom', path: ['equipment'], message: 'Equipamento inválido' })
    }
    if (!movementEnum.safeParse(v.movement_pattern).success) {
      ctx.addIssue({ code: 'custom', path: ['movement_pattern'], message: 'Padrão inválido' })
    }
    // o secundario nao pode repetir o primario (igual ao CHECK conceitual)
    if (v.secondary_muscles.includes(v.primary_muscle as MuscleGroup)) {
      ctx.addIssue({
        code: 'custom',
        path: ['secondary_muscles'],
        message: 'O músculo principal não deve aparecer nos secundários',
      })
    }
  })

export type ExerciseFormValues = z.infer<typeof exerciseFormSchema>

export function emptyExerciseForm(): ExerciseFormValues {
  return {
    name: '',
    primary_muscle: '',
    secondary_muscles: [],
    equipment: '',
    movement_pattern: '',
    is_unilateral: false,
    cues: '',
  }
}

export function exerciseFormToInput(
  v: ExerciseFormValues,
  orgId: string,
  createdBy: string | null
): CreateExerciseInput {
  return {
    orgId,
    name: v.name.trim(),
    primaryMuscle: v.primary_muscle,
    secondaryMuscles: v.secondary_muscles,
    equipment: v.equipment,
    movementPattern: v.movement_pattern,
    isUnilateral: v.is_unilateral ?? false,
    cues: v.cues?.trim() ? v.cues.trim() : null,
    createdBy,
  }
}

// =====================================================================
// META DO PLANO (campos do topo; a estrutura nested e validada no editor)
// =====================================================================

export const planMetaSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do plano').max(120, 'Máximo de 120 caracteres'),
  goal: z.string().optional(),
  weeks: z
    .number({ message: 'Informe o número de semanas' })
    .int('Número inteiro')
    .min(1, 'Mínimo de 1 semana')
    .max(52, 'Máximo de 52 semanas'),
  starts_on: z.string().optional(),
  notes: z.string().optional(),
})

export type PlanMetaValues = z.infer<typeof planMetaSchema>
