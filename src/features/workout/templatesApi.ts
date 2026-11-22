import { supabase } from '../../lib/supabase'
import type { EditorDay, EditorExercise, EditorOverride, EditorPlan, EditorWeek } from './builder'
import type { GroupKind, Technique } from './groups'

export type TemplateExercise = {
  exercise_id: string
  sets: number
  reps: string | null
  rir: number | null
  rest_seconds: number | null
  tempo: string | null
  notes: string | null
  group_key: string | null
  group_kind: GroupKind | null
  technique: Technique | null
}

export type TemplateDay = {
  label: string
  name: string | null
  exercises: TemplateExercise[]
}

export type TemplateOverride = {
  week: number
  day_index: number
  exercise_index: number
  sets: number | null
  reps: string | null
  rir: number | null
  rest_seconds: number | null
  is_skipped: boolean
  notes: string | null
}

export type WorkoutTemplatePayload = {
  days: TemplateDay[]
  weekly_schedule: string[]
  weeks: EditorWeek[]
  overrides: TemplateOverride[]
}

export type WorkoutTemplateRow = {
  id: string
  org_id: string
  created_by: string
  name: string
  goal: string | null
  weeks: number
  notes: string | null
  payload: WorkoutTemplatePayload
  created_at: string
  updated_at: string
}

// Contrato da tabela da 0060, até regenerar database.types.
type WorkoutTemplatesTable = {
  from(table: 'workout_templates'): {
    select(columns: '*'): {
      eq(column: 'org_id', value: string): {
        order(column: 'updated_at', opts: { ascending: false }): {
          order(column: 'id', opts: { ascending: false }): PromiseLike<{
            data: WorkoutTemplateRow[] | null
            error: unknown
          }>
        }
      }
    }
    insert(values: {
      org_id: string
      name: string
      goal: string | null
      weeks: number
      notes: string | null
      payload: WorkoutTemplatePayload
    }): {
      select(columns: '*'): {
        single(): PromiseLike<{ data: WorkoutTemplateRow | null; error: unknown }>
      }
    }
    delete(): {
      eq(column: 'id', value: string): PromiseLike<{ error: unknown }>
    }
  }
}

const templatesTable = supabase as unknown as WorkoutTemplatesTable

export function editorPlanToTemplatePayload(plan: EditorPlan): WorkoutTemplatePayload {
  const indexByKey = new Map<string, { dayIndex: number; exerciseIndex: number }>()
  const days: TemplateDay[] = plan.days.map((day, dayIndex) => ({
    label: day.label,
    name: day.name,
    exercises: day.exercises.map((ex, exerciseIndex) => {
      indexByKey.set(ex.key, { dayIndex, exerciseIndex })
      return {
        exercise_id: ex.exerciseId,
        sets: ex.sets,
        reps: ex.reps,
        rir: ex.rir,
        rest_seconds: ex.restSeconds,
        tempo: ex.tempo,
        notes: ex.notes,
        group_key: ex.groupKey,
        group_kind: ex.groupKind,
        technique: ex.technique,
      }
    }),
  }))

  const overrides: TemplateOverride[] = []
  for (const ov of plan.overrides) {
    const ref = indexByKey.get(ov.exerciseKey)
    if (!ref) continue
    overrides.push({
      week: ov.week,
      day_index: ref.dayIndex,
      exercise_index: ref.exerciseIndex,
      sets: ov.sets,
      reps: ov.reps,
      rir: ov.rir,
      rest_seconds: ov.restSeconds,
      is_skipped: ov.isSkipped,
      notes: ov.notes,
    })
  }

  return {
    days,
    weekly_schedule: plan.weeklySchedule.slice(),
    weeks: plan.weeksMeta.map((w) => ({ ...w })),
    overrides,
  }
}

export function templateToEditorPlan(
  template: WorkoutTemplateRow,
  newKey: () => string,
  newGroupKey: () => string
): EditorPlan {
  const payload = template.payload ?? { days: [], weekly_schedule: [], weeks: [], overrides: [] }
  const keyByIndex = new Map<string, string>()

  const days: EditorDay[] = (payload.days ?? []).map((day, dayIndex) => {
    const groupMap = new Map<string, string>()
    const exercises: EditorExercise[] = (day.exercises ?? []).map((ex, exerciseIndex) => {
      const key = newKey()
      keyByIndex.set(`${dayIndex}:${exerciseIndex}`, key)
      let groupKey: string | null = null
      if (ex.group_key) {
        groupKey = groupMap.get(ex.group_key) ?? newGroupKey()
        groupMap.set(ex.group_key, groupKey)
      }
      return {
        key,
        exerciseId: ex.exercise_id,
        sets: ex.sets,
        reps: ex.reps,
        rir: ex.rir,
        restSeconds: ex.rest_seconds,
        tempo: ex.tempo,
        notes: ex.notes,
        groupKey,
        groupKind: ex.group_kind ?? null,
        technique: ex.technique ?? null,
      }
    })
    return {
      key: newKey(),
      label: day.label,
      name: day.name ?? null,
      exercises,
    }
  })

  const overrides: EditorOverride[] = []
  for (const ov of payload.overrides ?? []) {
    const exerciseKey = keyByIndex.get(`${ov.day_index}:${ov.exercise_index}`)
    if (!exerciseKey) continue
    overrides.push({
      week: ov.week,
      exerciseKey,
      sets: ov.sets,
      reps: ov.reps,
      rir: ov.rir,
      restSeconds: ov.rest_seconds,
      isSkipped: ov.is_skipped,
      notes: ov.notes,
    })
  }

  return {
    name: template.name,
    goal: (template.goal as EditorPlan['goal']) ?? null,
    weeks: template.weeks,
    startsOn: null,
    notes: template.notes ?? null,
    status: 'draft',
    sourceAssessmentId: null,
    sourcePostureSessionId: null,
    weeklySchedule: (payload.weekly_schedule ?? []).slice(),
    days,
    weeksMeta: (payload.weeks ?? []).map((w) => ({ ...w })),
    overrides,
  }
}

export async function listWorkoutTemplates(orgId: string): Promise<WorkoutTemplateRow[]> {
  const { data, error } = await templatesTable
    .from('workout_templates')
    .select('*')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createWorkoutTemplate(input: {
  orgId: string
  name: string
  goal: string | null
  weeks: number
  notes: string | null
  payload: WorkoutTemplatePayload
}): Promise<WorkoutTemplateRow> {
  const { data, error } = await templatesTable
    .from('workout_templates')
    .insert({
      org_id: input.orgId,
      name: input.name.trim(),
      goal: input.goal,
      weeks: input.weeks,
      notes: input.notes,
      payload: input.payload,
    })
    .select('*')
    .single()
  if (error) throw error
  if (!data) throw new Error('Não foi possível confirmar o modelo salvo.')
  return data
}

export async function deleteWorkoutTemplate(id: string): Promise<void> {
  const { error } = await templatesTable.from('workout_templates').delete().eq('id', id)
  if (error) throw error
}
