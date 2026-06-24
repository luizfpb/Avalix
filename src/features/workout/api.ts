import { supabase } from '../../lib/supabase'
import type { Database, Json } from '../../lib/database.types'
import type { VolumeSnapshot } from './volume'

export type ExerciseRow = Database['public']['Tables']['exercises']['Row']
export type WorkoutPlanRow = Database['public']['Tables']['workout_plans']['Row']
export type WorkoutDayRow = Database['public']['Tables']['workout_days']['Row']
export type WorkoutExerciseRow = Database['public']['Tables']['workout_exercises']['Row']
export type WorkoutWeekOverrideRow = Database['public']['Tables']['workout_week_overrides']['Row']
export type WorkoutWeekRow = Database['public']['Tables']['workout_weeks']['Row']

// =====================================================================
// BIBLIOTECA DE EXERCICIOS
// =====================================================================

// Catalogo visivel: global (org_id null) + custom da org. A RLS ja garante isso;
// o filtro explicito usa o indice e deixa claro. Ordena por grupo e nome.
export async function listExercises(orgId: string): Promise<ExerciseRow[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .or(`org_id.is.null,org_id.eq.${orgId}`)
    .order('primary_muscle', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export type CreateExerciseInput = {
  orgId: string
  name: string
  primaryMuscle: string
  secondaryMuscles: string[]
  equipment: string
  movementPattern: string
  isUnilateral?: boolean
  cues?: string | null
  createdBy?: string | null
}

// Cria exercicio custom da org ("esta faltando, adiciona"). org_id obrigatorio
// (a RLS so deixa escrever linha custom); metadados de musculo/equipamento sao
// exigidos pelo schema — sem eles o volume nao significa nada.
export async function createCustomExercise(input: CreateExerciseInput): Promise<ExerciseRow> {
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      org_id: input.orgId,
      name: input.name,
      primary_muscle: input.primaryMuscle,
      secondary_muscles: input.secondaryMuscles,
      equipment: input.equipment,
      movement_pattern: input.movementPattern,
      is_unilateral: input.isUnilateral ?? false,
      cues: input.cues ?? null,
      created_by: input.createdBy ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export type UpdateExerciseInput = {
  name: string
  primaryMuscle: string
  secondaryMuscles: string[]
  equipment: string
  movementPattern: string
  isUnilateral?: boolean
  cues?: string | null
}

// Edita um exercicio custom. org_id e congelado por trigger; o resto e livre.
// A RLS so deixa atualizar linha custom da org (global e read-only pro usuario).
export async function updateCustomExercise(
  id: string,
  input: UpdateExerciseInput
): Promise<ExerciseRow> {
  const { data, error } = await supabase
    .from('exercises')
    .update({
      name: input.name,
      primary_muscle: input.primaryMuscle,
      secondary_muscles: input.secondaryMuscles,
      equipment: input.equipment,
      movement_pattern: input.movementPattern,
      is_unilateral: input.isUnilateral ?? false,
      cues: input.cues ?? null,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteCustomExercise(id: string): Promise<void> {
  // on delete restrict: o banco recusa se o exercicio estiver em uso por um plano
  const { error } = await supabase.from('exercises').delete().eq('id', id)
  if (error) throw error
}

// =====================================================================
// PLANOS DE TREINO
// =====================================================================

export async function listWorkoutPlans(subjectId: string): Promise<WorkoutPlanRow[]> {
  const { data, error } = await supabase
    .from('workout_plans')
    .select('*')
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export type WorkoutPlanDetail = {
  plan: WorkoutPlanRow | null
  days: WorkoutDayRow[]
  exercises: WorkoutExerciseRow[]
  overrides: WorkoutWeekOverrideRow[]
  weeks: WorkoutWeekRow[]
}

// Plano completo (linhas cruas, como getAssessment devolve as leituras). A UI
// monta a arvore dias->exercicios e casa os overrides por workout_exercise_id.
export async function getWorkoutPlan(id: string): Promise<WorkoutPlanDetail> {
  const { data: plan, error } = await supabase
    .from('workout_plans')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!plan) return { plan: null, days: [], exercises: [], overrides: [], weeks: [] }

  const daysRes = await supabase
    .from('workout_days')
    .select('*')
    .eq('plan_id', id)
    .order('position', { ascending: true })
  if (daysRes.error) throw daysRes.error
  const days = daysRes.data ?? []

  const dayIds = days.map((d) => d.id)
  let exercises: WorkoutExerciseRow[] = []
  if (dayIds.length > 0) {
    const exRes = await supabase
      .from('workout_exercises')
      .select('*')
      .in('day_id', dayIds)
      .order('position', { ascending: true })
    if (exRes.error) throw exRes.error
    exercises = exRes.data ?? []
  }

  const ovRes = await supabase
    .from('workout_week_overrides')
    .select('*')
    .eq('plan_id', id)
    .order('week_number', { ascending: true })
  if (ovRes.error) throw ovRes.error

  const wkRes = await supabase
    .from('workout_weeks')
    .select('*')
    .eq('plan_id', id)
    .order('week_number', { ascending: true })
  if (wkRes.error) throw wkRes.error

  return {
    plan,
    days,
    exercises,
    overrides: ovRes.data ?? [],
    weeks: wkRes.data ?? [],
  }
}

export type PlanExerciseInput = {
  // chave estavel do editor (temp no create, id do banco no edit). Alvo dos
  // overrides; mapeada para o id real do workout_exercise apos o insert.
  clientKey: string
  exerciseId: string
  sets: number
  reps: string
  rir: number | null
  restSeconds: number | null
  tempo: string | null
  notes: string | null
}

export type PlanDayInput = {
  label: string
  name: string | null
  exercises: PlanExerciseInput[] // ordem do array = position
}

export type PlanWeekOverrideInput = {
  week: number
  exerciseKey: string // clientKey do exercicio sobrescrito
  sets: number | null
  reps: string | null
  rir: number | null
  restSeconds: number | null
  isSkipped: boolean
  notes: string | null
}

export type PlanWeekMetaInput = {
  week: number
  label: string | null
  isDeload: boolean
  notes: string | null
}

export type SaveWorkoutPlanInput = {
  orgId: string
  subjectId: string
  name: string
  goal: string | null
  weeks: number
  startsOn: string | null
  notes: string | null
  status: string
  sourceAssessmentId: string | null
  sourcePostureSessionId: string | null
  volume: VolumeSnapshot // snapshot calculado pelo motor no editor
  days: PlanDayInput[] // ordem do array = position
  overrides: PlanWeekOverrideInput[]
  weeksMeta: PlanWeekMetaInput[]
}

// Reinsere toda a estrutura filha (dias/exercicios/overrides/semanas) a partir do
// estado do editor, espelhando updateAssessment (apaga as leituras e regrava). O
// snapshot de volume vai na linha do plano e e a fonte de verdade do PDF, entao
// uma falha parcial e recuperavel: basta salvar de novo (o update reescreve tudo).
//
// O passo nao-obvio e o mapa clientKey->id: os overrides referenciam
// workout_exercise_id, que so existe depois do insert dos exercicios. Inserimos
// os exercicios dia a dia (position = indice) e correlacionamos pelo par
// (day_id, position) pra reconstruir o mapa antes de gravar os overrides.
async function insertPlanChildren(
  planId: string,
  orgId: string,
  input: SaveWorkoutPlanInput
): Promise<void> {
  const keyToExerciseId = new Map<string, string>()

  for (let i = 0; i < input.days.length; i++) {
    const day = input.days[i]
    const { data: dayRow, error: dayErr } = await supabase
      .from('workout_days')
      .insert({
        org_id: orgId,
        plan_id: planId,
        label: day.label,
        name: day.name,
        position: i,
      })
      .select('id')
      .single()
    if (dayErr) throw dayErr

    if (day.exercises.length === 0) continue

    const { data: exRows, error: exErr } = await supabase
      .from('workout_exercises')
      .insert(
        day.exercises.map((ex, pos) => ({
          org_id: orgId,
          day_id: dayRow.id,
          exercise_id: ex.exerciseId,
          position: pos,
          sets: ex.sets,
          reps: ex.reps,
          rir: ex.rir,
          rest_seconds: ex.restSeconds,
          tempo: ex.tempo,
          notes: ex.notes,
        }))
      )
      .select('id, position')
    if (exErr) throw exErr

    // correlaciona pelo position (unico por dia) pra casar clientKey -> id real
    const byPosition = new Map((exRows ?? []).map((r) => [r.position, r.id]))
    day.exercises.forEach((ex, pos) => {
      const id = byPosition.get(pos)
      if (id) keyToExerciseId.set(ex.clientKey, id)
    })
  }

  // overrides: descarta semanas fora do mesociclo (defesa; o b2 tambem barraria)
  const overrideRows = input.overrides
    .filter((o) => o.week >= 1 && o.week <= input.weeks && keyToExerciseId.has(o.exerciseKey))
    .map((o) => ({
      org_id: orgId,
      plan_id: planId,
      workout_exercise_id: keyToExerciseId.get(o.exerciseKey) as string,
      week_number: o.week,
      sets: o.sets,
      reps: o.reps,
      rir: o.rir,
      rest_seconds: o.restSeconds,
      is_skipped: o.isSkipped,
      notes: o.notes,
    }))
  if (overrideRows.length > 0) {
    const { error: ovErr } = await supabase.from('workout_week_overrides').insert(overrideRows)
    if (ovErr) throw ovErr
  }

  const weekRows = input.weeksMeta
    .filter((w) => w.week >= 1 && w.week <= input.weeks)
    .map((w) => ({
      org_id: orgId,
      plan_id: planId,
      week_number: w.week,
      label: w.label,
      is_deload: w.isDeload,
      notes: w.notes,
    }))
  if (weekRows.length > 0) {
    const { error: wkErr } = await supabase.from('workout_weeks').insert(weekRows)
    if (wkErr) throw wkErr
  }
}

function planColumns(input: SaveWorkoutPlanInput) {
  return {
    name: input.name,
    goal: input.goal,
    weeks: input.weeks,
    starts_on: input.startsOn,
    notes: input.notes,
    status: input.status,
    source_assessment_id: input.sourceAssessmentId,
    source_posture_session_id: input.sourcePostureSessionId,
    volume: input.volume as unknown as Json,
    volume_engine_version: input.volume.engineVersion,
  }
}

// evaluator_id e omitido de proposito: o default do banco (auth.uid()) assume e o
// trigger check_evaluator valida. org_id/subject_id chegam no insert e sao
// congelados depois.
export async function createWorkoutPlan(input: SaveWorkoutPlanInput): Promise<WorkoutPlanRow> {
  const { data: plan, error } = await supabase
    .from('workout_plans')
    .insert({
      org_id: input.orgId,
      subject_id: input.subjectId,
      ...planColumns(input),
    })
    .select('*')
    .single()
  if (error) throw error

  await insertPlanChildren(plan.id, input.orgId, input)
  return plan
}

// Atualiza o plano e regrava toda a estrutura. Apagar os dias leva exercicios e
// overrides em cascata; as semanas (FK direto no plano) sao apagadas a parte.
export async function updateWorkoutPlan(
  id: string,
  input: SaveWorkoutPlanInput
): Promise<WorkoutPlanRow> {
  const { data: plan, error } = await supabase
    .from('workout_plans')
    .update(planColumns(input))
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error

  const delDays = await supabase.from('workout_days').delete().eq('plan_id', id)
  if (delDays.error) throw delDays.error
  const delWeeks = await supabase.from('workout_weeks').delete().eq('plan_id', id)
  if (delWeeks.error) throw delWeeks.error

  await insertPlanChildren(id, input.orgId, input)
  return plan
}

export async function deleteWorkoutPlan(id: string): Promise<void> {
  // FK on delete cascade leva dias, exercicios, overrides e semanas; a auditoria
  // registra o DELETE do plano.
  const { error } = await supabase.from('workout_plans').delete().eq('id', id)
  if (error) throw error
}

// Muda so o status (rascunho/ativo/arquivado) sem reescrever a estrutura. org_id/
// subject_id sao congelados por trigger; status e livre.
export async function setWorkoutPlanStatus(id: string, status: string): Promise<WorkoutPlanRow> {
  const { data, error } = await supabase
    .from('workout_plans')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}
