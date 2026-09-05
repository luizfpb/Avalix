import { supabase } from '../../lib/supabase'
import type { Database, Json } from '../../lib/database.types'
import type { GroupKind, Technique } from './groups'
import type { VolumeSnapshot } from './volume'

export type ExerciseRow = Database['public']['Tables']['exercises']['Row']
export type WorkoutPlanRow = Database['public']['Tables']['workout_plans']['Row']
export type WorkoutDayRow = Database['public']['Tables']['workout_days']['Row']
export type WorkoutExerciseRow = Database['public']['Tables']['workout_exercises']['Row']
export type WorkoutWeekOverrideRow = Database['public']['Tables']['workout_week_overrides']['Row']
export type WorkoutWeekRow = Database['public']['Tables']['workout_weeks']['Row']
export type WorkoutLogRow = Database['public']['Tables']['workout_logs']['Row']
export type WorkoutLogSetRow = Database['public']['Tables']['workout_log_sets']['Row']

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
  // nulo = prescricao sem faixa de repeticao (aquecimento, mobilidade,
  // trabalho ate a falha). A coluna deixou de ser NOT NULL na migration 0030.
  reps: string | null
  rir: number | null
  restSeconds: number | null
  tempo: string | null
  notes: string | null
  // agrupamento contiguo dentro da divisao (super-serie/circuito) e tecnica de
  // intensidade do proprio exercicio. Ver features/workout/groups.ts.
  groupKey: string | null
  groupKind: GroupKind | null
  technique: Technique | null
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
  weeklySchedule: string[] // sequencia de sessoes da semana por rotulo (ex.: ABA)
  volume: VolumeSnapshot // snapshot calculado pelo motor no editor
  days: PlanDayInput[] // ordem do array = position
  overrides: PlanWeekOverrideInput[]
  weeksMeta: PlanWeekMetaInput[]
}

// Regrava toda a estrutura filha (dias/exercicios/overrides/semanas) pela RPC
// replace_workout_plan_children (migration 0016): delete + reinsert numa
// transação só — falha no meio reverte inteiro, sem estado parcial. O mapa
// clientKey->workout_exercise_id (os overrides referenciam ids que só existem
// após o insert) é reconstruído dentro da função, no banco.
// Payload das filhas, compartilhado pelo caminho de criação (RPC
// replace_workout_plan_children) e pelo de edição (RPC save_workout_plan, que
// chama a mesma função dentro da própria transação).
function planChildrenPayload(input: SaveWorkoutPlanInput) {
  // descarta overrides/semanas fora do mesociclo (defesa; o b2 também barraria)
  const overrides = input.overrides
    .filter((o) => o.week >= 1 && o.week <= input.weeks)
    .map((o) => ({
      week: o.week,
      exercise_key: o.exerciseKey,
      sets: o.sets,
      reps: o.reps,
      rir: o.rir,
      rest_seconds: o.restSeconds,
      is_skipped: o.isSkipped,
      notes: o.notes,
    }))
  const weeks = input.weeksMeta
    .filter((w) => w.week >= 1 && w.week <= input.weeks)
    .map((w) => ({
      week: w.week,
      label: w.label,
      is_deload: w.isDeload,
      notes: w.notes,
    }))

  const days = input.days.map((day, i) => ({
    label: day.label,
    name: day.name,
    position: i,
    exercises: day.exercises.map((ex, pos) => ({
      client_key: ex.clientKey,
      exercise_id: ex.exerciseId,
      position: pos,
      sets: ex.sets,
      reps: ex.reps,
      rir: ex.rir,
      rest_seconds: ex.restSeconds,
      tempo: ex.tempo,
      notes: ex.notes,
      group_key: ex.groupKey,
      group_kind: ex.groupKind,
      technique: ex.technique,
    })),
  }))
  return {
    days: days as unknown as Json,
    overrides: overrides as unknown as Json,
    weeks: weeks as unknown as Json,
  }
}

// replace_workout_plan_children continua no banco (as duas RPCs de gravação a
// chamam por dentro), mas o cliente não a chama mais direto: a criação e a
// edição passam por create_workout_plan e save_workout_plan, que fecham
// cabeçalho e filhas na mesma transação.

// Cria cabeçalho E estrutura filha numa transação só (RPC create_workout_plan,
// migration 0031).
//
// Antes eram duas gravações independentes, e a primeira delas já trocava o
// treino vigente: o trigger da 0027 arquiva o plano ativo anterior no próprio
// insert do cabeçalho. Falhar na segunda deixava o aluno SEM treino — o
// anterior arquivado e o novo vazio (ou apagado pela limpeza do cliente, que
// também podia falhar). É o mesmo defeito que a 0023 corrigiu na edição e que
// não tinha sido replicado na criação, que é o caminho mais usado.
//
// evaluator_id continua omitido de propósito: a RPC é security invoker, então o
// default do banco (auth.uid()) assume e o trigger check_evaluator valida.
export async function createWorkoutPlan(input: SaveWorkoutPlanInput): Promise<WorkoutPlanRow> {
  const { days, overrides, weeks } = planChildrenPayload(input)
  const { data, error } = await supabase.rpc('create_workout_plan', {
    p_org: input.orgId,
    p_subject: input.subjectId,
    p_name: input.name,
    p_weeks: input.weeks,
    p_status: input.status,
    p_weekly_schedule: input.weeklySchedule as unknown as Json,
    p_volume: input.volume as unknown as Json,
    p_volume_engine_version: input.volume.engineVersion,
    p_days: days,
    p_overrides: overrides,
    p_weeks_meta: weeks,
    // args com default null na RPC: omitir = deixar o campo nulo. Mesmo padrão
    // do updateWorkoutPlan (o gerador de tipos só marca o parâmetro como
    // opcional quando ele tem DEFAULT no SQL).
    ...(input.goal != null ? { p_goal: input.goal } : {}),
    ...(input.startsOn != null ? { p_starts_on: input.startsOn } : {}),
    ...(input.notes != null ? { p_notes: input.notes } : {}),
    ...(input.sourceAssessmentId != null
      ? { p_source_assessment_id: input.sourceAssessmentId }
      : {}),
    ...(input.sourcePostureSessionId != null
      ? { p_source_posture_session_id: input.sourcePostureSessionId }
      : {}),
  })
  if (error) throw error
  return data as unknown as WorkoutPlanRow
}

// Atualiza cabeçalho E estrutura filha numa transação só (RPC save_workout_plan,
// migration 0023).
//
// Antes eram duas requisições independentes: um UPDATE em workout_plans que
// commitava sozinho e só depois a RPC das filhas. O comentário dizia "atômico
// via RPC", mas só a substituição das filhas era transacional — o par
// (cabeçalho, filhas) não era. Rede caindo entre as duas deixava o plano com
// semanas/sequência/volume NOVOS e dias/exercícios VELHOS. É o mesmo defeito
// que a 0019 corrigiu na avaliação física e que não tinha sido replicado aqui.
//
// expectedUpdatedAt implementa concorrência otimista: se a linha mudou depois
// que esta tela carregou (o educador editou pelo celular e voltou à aba antiga
// do PC), o banco recusa em vez de sobrescrever em silêncio. Omitir mantém o
// comportamento antigo de "último a salvar vence".
export async function updateWorkoutPlan(
  id: string,
  input: SaveWorkoutPlanInput,
  expectedUpdatedAt?: string | null
): Promise<WorkoutPlanRow> {
  const { days, overrides, weeks } = planChildrenPayload(input)
  const { data, error } = await supabase.rpc('save_workout_plan', {
    p_plan: id,
    p_name: input.name,
    p_weeks: input.weeks,
    p_status: input.status,
    p_weekly_schedule: input.weeklySchedule as unknown as Json,
    p_volume: input.volume as unknown as Json,
    p_volume_engine_version: input.volume.engineVersion,
    p_days: days,
    p_overrides: overrides,
    p_weeks_meta: weeks,
    // args com default null na RPC: omitir = limpar o campo. Mesmo padrão do
    // updateAssessment; o gerador de tipos do Supabase só marca o parâmetro
    // como opcional quando ele tem DEFAULT no SQL (migration 0025).
    ...(input.goal != null ? { p_goal: input.goal } : {}),
    ...(input.startsOn != null ? { p_starts_on: input.startsOn } : {}),
    ...(input.notes != null ? { p_notes: input.notes } : {}),
    ...(input.sourceAssessmentId != null
      ? { p_source_assessment_id: input.sourceAssessmentId }
      : {}),
    ...(input.sourcePostureSessionId != null
      ? { p_source_posture_session_id: input.sourcePostureSessionId }
      : {}),
    ...(expectedUpdatedAt != null ? { p_expected_updated_at: expectedUpdatedAt } : {}),
  })
  if (error) throw error
  return data as unknown as WorkoutPlanRow
}

export async function deleteWorkoutPlan(id: string): Promise<void> {
  // FK on delete cascade leva dias, exercicios, overrides e semanas; a auditoria
  // registra o DELETE do plano.
  const { error } = await supabase.from('workout_plans').delete().eq('id', id)
  if (error) throw error
}

// =====================================================================
// LOG DE EXECUCAO (fecha o ciclo prescrever -> executar -> medir)
// =====================================================================

export type NewLogSet = {
  exerciseId: string
  setNumber: number
  weightKg: number | null
  reps: number | null
  rir: number | null
}

export type CreateWorkoutLogInput = {
  orgId: string
  subjectId: string
  planId: string
  dayLabel: string | null
  weekNumber: number | null
  performedAt: string
  notes: string | null
  sets: NewLogSet[]
}

// Cria a sessao executada + as series numa transacao so (RPC create_workout_log,
// 0019). Antes eram duas chamadas: series falhando deixavam sessao vazia que
// contava na adesao. org_id/subject_id vem do plano pelo trigger b1.
export async function createWorkoutLog(input: CreateWorkoutLogInput): Promise<WorkoutLogRow> {
  const { data, error } = await supabase.rpc('create_workout_log', {
    p_plan: input.planId,
    // args com default null na RPC: omitidos quando não há valor
    ...(input.dayLabel != null ? { p_day_label: input.dayLabel } : {}),
    ...(input.weekNumber != null ? { p_week_number: input.weekNumber } : {}),
    p_performed_at: input.performedAt,
    ...(input.notes != null ? { p_notes: input.notes } : {}),
    p_sets: input.sets.map((s) => ({
      exercise_id: s.exerciseId,
      set_number: s.setNumber,
      weight_kg: s.weightKg,
      reps: s.reps,
      rir: s.rir,
    })) as unknown as Json,
  })
  if (error) throw error
  return data as WorkoutLogRow
}

export async function listWorkoutLogs(planId: string): Promise<WorkoutLogRow[]> {
  const rows: WorkoutLogRow[] = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('plan_id', planId)
      .order('performed_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) return rows
  }
}

export async function listWorkoutLogSets(logId: string): Promise<WorkoutLogSetRow[]> {
  const { data, error } = await supabase
    .from('workout_log_sets')
    .select('*')
    .eq('log_id', logId)
    .order('set_number')
  if (error) throw error
  return data ?? []
}

export async function deleteWorkoutLog(id: string): Promise<void> {
  // cascade leva as series; a auditoria registra o DELETE do log
  const { error } = await supabase.from('workout_logs').delete().eq('id', id)
  if (error) throw error
}

export type SetHistoryPoint = {
  exerciseId: string
  performedAt: string
  weightKg: number | null
  reps: number | null
  rir: number | null
}

// Todas as series executadas do plano com a data da sessao (via join), pra
// montar a progressao de carga / e1RM e as sugestoes por exercicio. RLS vale.
export async function listPlanSetHistory(planId: string): Promise<SetHistoryPoint[]> {
  const pages: unknown[] = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('workout_log_sets')
      .select('exercise_id, weight_kg, reps, rir, workout_logs!inner(plan_id, performed_at)')
      .eq('workout_logs.plan_id', planId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    pages.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) break
  }
  const rows = pages as Array<{
    exercise_id: string
    weight_kg: number | null
    reps: number | null
    rir: number | null
    workout_logs: { performed_at: string } | { performed_at: string }[]
  }>
  return rows.map(({ exercise_id, weight_kg, reps, rir, workout_logs }) => {
    const l = Array.isArray(workout_logs) ? workout_logs[0] : workout_logs
    return {
      exerciseId: exercise_id,
      performedAt: l?.performed_at ?? '',
      weightKg: weight_kg,
      reps,
      rir,
    }
  })
}

// =====================================================================
// CARTEIRA (visao org-wide pro dashboard do treinador)
// =====================================================================

export type ActivePlanSummary = {
  planId: string
  subjectId: string
  name: string
  weeks: number
  sessionsPerWeek: number // weekly_schedule.length, ou nº de divisoes se vazio
  // Inicio efetivo do plano: starts_on quando o profissional informou, senao a
  // criacao. Necessario para medir adesao pelas semanas ja decorridas em vez
  // de pelo plano inteiro (ver plannedSessionsToDate).
  startedOn: string | null
}

// Planos ativos da org com sessoes/semana (embed do count de divisoes). RLS vale.
export async function listOrgActivePlans(orgId: string): Promise<ActivePlanSummary[]> {
  const { data, error } = await supabase
    .from('workout_plans')
    .select('id, subject_id, name, weeks, weekly_schedule, starts_on, created_at, workout_days(count)')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<{
    id: string
    subject_id: string
    name: string
    weeks: number
    weekly_schedule: string[] | null
    starts_on: string | null
    created_at: string
    workout_days: { count: number }[]
  }>
  return rows.map((p) => {
    const dayCount = p.workout_days?.[0]?.count ?? 0
    const ws = p.weekly_schedule ?? []
    return {
      planId: p.id,
      subjectId: p.subject_id,
      name: p.name,
      weeks: p.weeks,
      sessionsPerWeek: ws.length > 0 ? ws.length : dayCount,
      startedOn: p.starts_on ?? p.created_at ?? null,
    }
  })
}

export type LogSummary = { count: number; lastDate: string | null }

// Resumo de execucao por plano da org (qtde de sessoes + ultima data). A view
// workout_log_summary (0016) agrega no banco em vez de baixar todos os logs;
// security_invoker mantem a RLS valendo.
export async function listOrgWorkoutLogSummary(orgId: string): Promise<Record<string, LogSummary>> {
  const { data, error } = await supabase
    .from('workout_log_summary')
    .select('plan_id, log_count, last_date')
    .eq('org_id', orgId)
  if (error) throw error
  const map: Record<string, LogSummary> = {}
  for (const r of data ?? []) {
    if (!r.plan_id) continue
    map[r.plan_id] = { count: r.log_count ?? 0, lastDate: r.last_date }
  }
  return map
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
