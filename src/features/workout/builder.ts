// Conversores puros entre o estado do editor (UI), o snapshot de volume e o
// payload de persistencia. Mantidos fora da pagina pra serem testaveis e deixar
// o componente do builder "burro". Espelha o papel de assessment/result.ts.

import type {
  PlanDayInput,
  PlanWeekMetaInput,
  PlanWeekOverrideInput,
  SaveWorkoutPlanInput,
  WorkoutPlanDetail,
} from './api'
import {
  isGroupKind,
  isTechnique,
  normalizeGroups,
  type GroupKind,
  type Technique,
} from './groups'
import {
  buildVolumeSnapshot,
  type MovementPattern,
  type MuscleGroup,
  type VolumeMethod,
  type VolumePlanInput,
  type VolumeSnapshot,
} from './volume'

// ---- modelo do editor -------------------------------------------------

export type EditorExercise = {
  key: string // chave estavel (uuid no create, id do banco no edit)
  exerciseId: string
  sets: number
  // reps e rir sao os dois campos que o dominio permite deixar em branco:
  // aquecimento, mobilidade e trabalho ate a falha nao tem faixa definida.
  reps: string | null
  rir: number | null
  restSeconds: number | null
  tempo: string | null
  notes: string | null
  // agrupamento contiguo (super-serie/circuito) e tecnica de intensidade.
  // As regras de contiguidade vivem em groups.ts, nunca aqui.
  groupKey: string | null
  groupKind: GroupKind | null
  technique: Technique | null
}

export type EditorDay = {
  key: string
  label: string
  name: string | null
  exercises: EditorExercise[]
}

export type EditorOverride = {
  week: number
  exerciseKey: string
  sets: number | null
  reps: string | null
  rir: number | null
  restSeconds: number | null
  isSkipped: boolean
  notes: string | null
}

export type EditorWeek = {
  week: number
  label: string | null
  isDeload: boolean
  notes: string | null
}

export type EditorPlan = {
  name: string
  goal: string | null
  weeks: number
  startsOn: string | null
  notes: string | null
  status: string
  sourceAssessmentId: string | null
  sourcePostureSessionId: string | null
  // sequencia de sessoes da semana por rotulo (ex.: ['A','B','A']); vazio = cada
  // divisao uma vez
  weeklySchedule: string[]
  days: EditorDay[]
  overrides: EditorOverride[]
  weeksMeta: EditorWeek[]
}

// metadados de musculo necessarios pro volume, indexados por exercise_id
export type ExerciseMeta = {
  primaryMuscle: MuscleGroup
  // outros músculos principais (0040); opcional pelo mesmo motivo do padrão
  additionalPrimaryMuscles?: MuscleGroup[]
  secondaryMuscles: MuscleGroup[]
  // usado só pelo método refinado (composto vs isolado); opcional pra não
  // quebrar chamadas/testes que só ligam no volume padrão
  movementPattern?: MovementPattern
}

export function emptyEditorPlan(): EditorPlan {
  return {
    name: '',
    goal: null,
    weeks: 4,
    startsOn: null,
    notes: null,
    status: 'draft',
    sourceAssessmentId: null,
    sourcePostureSessionId: null,
    weeklySchedule: [],
    days: [],
    overrides: [],
    weeksMeta: [],
  }
}

// ---- montagem no editor -----------------------------------------------

// Primeira letra livre (A, B, C...). Contar as divisões dava letra repetida
// depois de apagar uma do meio: com A e C restantes, a próxima saía "C".
export function nextDayLabel(days: readonly Pick<EditorDay, 'label'>[]): string {
  const used = new Set(days.map((d) => d.label.trim().toUpperCase()))
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i)
    if (!used.has(letter)) return letter
  }
  for (let n = days.length + 1; ; n++) if (!used.has(String(n))) return String(n)
}

export const DEFAULT_PRESCRIPTION = { sets: 3, reps: '8-12', rir: 2, restSeconds: 90 } as const

// Exercício novo copia séries, reps, RIR e descanso do último da divisão: quem
// monta costuma repetir o padrão, e o 3 x 8-12 fixo obrigava a corrigir um por
// um. Técnica, cadência, observação e bloco são do exercício e não passam.
export function newEditorExercise(day: Pick<EditorDay, 'exercises'> | undefined, exerciseId: string, key: string): EditorExercise {
  const last = day?.exercises[day.exercises.length - 1]
  const base = last
    ? { sets: last.sets, reps: last.reps, rir: last.rir, restSeconds: last.restSeconds }
    : DEFAULT_PRESCRIPTION
  return {
    key,
    exerciseId,
    sets: base.sets,
    reps: base.reps,
    rir: base.rir,
    restSeconds: base.restSeconds,
    tempo: null,
    notes: null,
    groupKey: null,
    groupKind: null,
    technique: null,
  }
}

// Cópia da divisão logo depois dela, com a próxima letra livre: monta-se o A2
// a partir do A trocando um ou outro exercício. Tudo ganha chave nova (blocos
// inclusive, para a cópia não se fundir ao bloco do original) e os ajustes por
// semana dos exercícios vêm junto. A sequência semanal não muda: se ela foi
// escrita à mão, o profissional decide onde a cópia entra.
export function duplicateEditorDay(
  plan: EditorPlan,
  dayKey: string,
  newKey: () => string,
  newGroupKey: () => string
): EditorPlan {
  const index = plan.days.findIndex((d) => d.key === dayKey)
  if (index < 0) return plan
  const source = plan.days[index]
  const exerciseKeys = new Map<string, string>()
  const groupKeys = new Map<string, string>()
  const exercises = source.exercises.map((ex) => {
    const key = newKey()
    exerciseKeys.set(ex.key, key)
    let groupKey: string | null = null
    if (ex.groupKey != null) {
      if (!groupKeys.has(ex.groupKey)) groupKeys.set(ex.groupKey, newGroupKey())
      groupKey = groupKeys.get(ex.groupKey)!
    }
    return { ...ex, key, groupKey }
  })
  const copy: EditorDay = {
    key: newKey(),
    label: nextDayLabel(plan.days),
    // o nome da divisão vai até 80 caracteres no banco; o sufixo não pode estourar
    name: source.name ? `${source.name.slice(0, 80 - ' (cópia)'.length)} (cópia)` : null,
    exercises,
  }
  const overrides = plan.overrides.flatMap((o) => {
    const key = exerciseKeys.get(o.exerciseKey)
    return key ? [{ ...o, exerciseKey: key }] : []
  })
  const days = plan.days.slice()
  days.splice(index + 1, 0, copy)
  return { ...plan, days, overrides: [...plan.overrides, ...overrides] }
}

export function duplicateExerciseInDay(plan: EditorPlan): { dayLabel: string; exerciseId: string } | null {
  for (const day of plan.days) {
    const seen = new Set<string>()
    for (const exercise of day.exercises) {
      if (seen.has(exercise.exerciseId)) {
        return { dayLabel: day.label, exerciseId: exercise.exerciseId }
      }
      seen.add(exercise.exerciseId)
    }
  }
  return null
}

// ---- editor -> entrada do motor de volume -----------------------------

// Exercicios sem metadados conhecidos (ex.: exercicio removido do catalogo) sao
// ignorados na contagem; o resto do plano segue valido.
export function editorToVolumePlan(
  plan: EditorPlan,
  metaById: Map<string, ExerciseMeta>
): VolumePlanInput {
  const overrides: Record<number, Record<string, { sets?: number; skipped?: boolean }>> = {}
  for (const o of plan.overrides) {
    if (o.sets == null && !o.isSkipped) continue // override sem efeito no volume
    overrides[o.week] ??= {}
    overrides[o.week][o.exerciseKey] = {
      ...(o.sets != null ? { sets: o.sets } : {}),
      ...(o.isSkipped ? { skipped: true } : {}),
    }
  }
  return {
    weeks: plan.weeks,
    weeklySchedule: plan.weeklySchedule,
    days: plan.days.map((d) => ({
      label: d.label,
      exercises: d.exercises.flatMap((ex) => {
        const meta = metaById.get(ex.exerciseId)
        if (!meta) return []
        return [
          {
            key: ex.key,
            primaryMuscle: meta.primaryMuscle,
            additionalPrimaryMuscles: meta.additionalPrimaryMuscles,
            secondaryMuscles: meta.secondaryMuscles,
            movementPattern: meta.movementPattern,
            sets: ex.sets,
          },
        ]
      }),
    })),
    overrides,
    deloadWeeks: plan.weeksMeta.filter((w) => w.isDeload).map((w) => w.week),
  }
}

export function snapshotFromEditor(
  plan: EditorPlan,
  metaById: Map<string, ExerciseMeta>,
  method: VolumeMethod = 'fractional'
): VolumeSnapshot {
  return buildVolumeSnapshot(editorToVolumePlan(plan, metaById), method)
}

// ---- editor -> payload de persistencia --------------------------------

export function editorToSaveInput(
  plan: EditorPlan,
  ctx: { orgId: string; subjectId: string },
  volume: VolumeSnapshot
): SaveWorkoutPlanInput {
  const days: PlanDayInput[] = plan.days.map((d) => ({
    label: d.label,
    name: d.name,
    // ultima normalizacao antes de gravar: a RPC recusa grupo furado ou de um
    // membro so (0030), e a mensagem de la e de integridade, nao de formulario.
    // Aqui nao ha o que perguntar ao usuario - um grupo de um membro so e
    // sempre um exercicio solto.
    exercises: normalizeGroups(d.exercises).map((ex) => ({
      clientKey: ex.key,
      exerciseId: ex.exerciseId,
      sets: ex.sets,
      // string vazia nao e "sem faixa": e o campo que o CHECK do banco recusa
      reps: ex.reps?.trim() ? ex.reps.trim() : null,
      rir: ex.rir,
      restSeconds: ex.restSeconds,
      tempo: ex.tempo,
      notes: ex.notes,
      groupKey: ex.groupKey,
      groupKind: ex.groupKind,
      technique: ex.technique,
    })),
  }))
  const overrides: PlanWeekOverrideInput[] = plan.overrides.map((o) => ({
    week: o.week,
    exerciseKey: o.exerciseKey,
    sets: o.sets,
    reps: o.reps,
    rir: o.rir,
    restSeconds: o.restSeconds,
    isSkipped: o.isSkipped,
    notes: o.notes,
  }))
  const weeksMeta: PlanWeekMetaInput[] = plan.weeksMeta.map((w) => ({
    week: w.week,
    label: w.label,
    isDeload: w.isDeload,
    notes: w.notes,
  }))
  return {
    orgId: ctx.orgId,
    subjectId: ctx.subjectId,
    name: plan.name.trim(),
    goal: plan.goal,
    weeks: plan.weeks,
    startsOn: plan.startsOn,
    notes: plan.notes,
    status: plan.status,
    sourceAssessmentId: plan.sourceAssessmentId,
    sourcePostureSessionId: plan.sourcePostureSessionId,
    weeklySchedule: plan.weeklySchedule,
    volume,
    days,
    overrides,
    weeksMeta,
  }
}

// ---- plano persistido -> editor (carregar pra edicao) -----------------

// Clona um plano persistido para um novo plano editavel: mesmo conteudo, novo
// nome, sempre como rascunho. keepSources=false (duplicar para OUTRO avaliado)
// limpa as FKs de avaliacao/postura de origem, validadas por mesmo subject.
export function duplicatePlanEditor(
  detail: WorkoutPlanDetail,
  opts: { name: string; keepSources: boolean }
): EditorPlan {
  const base = planDetailToEditor(detail)
  return {
    ...base,
    name: opts.name,
    status: 'draft',
    sourceAssessmentId: opts.keepSources ? base.sourceAssessmentId : null,
    sourcePostureSessionId: opts.keepSources ? base.sourcePostureSessionId : null,
  }
}

// As chaves do editor passam a ser os ids do banco; os overrides referenciam
// workout_exercise_id, que casa exatamente com a chave do exercicio no editor.
export function planDetailToEditor(detail: WorkoutPlanDetail): EditorPlan {
  const { plan, days, exercises, overrides, weeks } = detail
  if (!plan) return emptyEditorPlan()

  const exByDay = new Map<string, typeof exercises>()
  for (const ex of exercises) {
    const list = exByDay.get(ex.day_id) ?? []
    list.push(ex)
    exByDay.set(ex.day_id, list)
  }

  return {
    name: plan.name,
    goal: plan.goal,
    weeks: plan.weeks,
    startsOn: plan.starts_on,
    notes: plan.notes,
    status: plan.status,
    sourceAssessmentId: plan.source_assessment_id,
    sourcePostureSessionId: plan.source_posture_session_id,
    weeklySchedule: plan.weekly_schedule,
    days: days.map((d) => ({
      key: d.id,
      label: d.label,
      name: d.name,
      // normaliza na leitura tambem: plano gravado antes da 0030 nao tem
      // agrupamento nenhum, e um plano de outra origem nao pode entrar no
      // editor num estado que o editor considera impossivel.
      exercises: normalizeGroups(
        (exByDay.get(d.id) ?? [])
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((ex) => ({
            key: ex.id,
            exerciseId: ex.exercise_id,
            sets: ex.sets,
            reps: ex.reps,
            rir: ex.rir,
            restSeconds: ex.rest_seconds,
            tempo: ex.tempo,
            notes: ex.notes,
            groupKey: ex.group_key,
            groupKind: isGroupKind(ex.group_kind) ? ex.group_kind : null,
            technique: isTechnique(ex.technique) ? ex.technique : null,
          }))
      ),
    })),
    overrides: overrides.map((o) => ({
      week: o.week_number,
      exerciseKey: o.workout_exercise_id,
      sets: o.sets,
      reps: o.reps,
      rir: o.rir,
      restSeconds: o.rest_seconds,
      isSkipped: o.is_skipped,
      notes: o.notes,
    })),
    weeksMeta: weeks.map((w) => ({
      week: w.week_number,
      label: w.label,
      isDeload: w.is_deload,
      notes: w.notes,
    })),
  }
}
