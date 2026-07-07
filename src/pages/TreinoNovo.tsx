import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  AlertTriangle,
  Calculator,
  X,
  GripVertical,
} from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import { useSubject } from '../features/subjects/hooks'
import {
  useCreateWorkoutPlan,
  useExercises,
  useUpdateWorkoutPlan,
  useWorkoutPlan,
} from '../features/workout/hooks'
import type { ExerciseRow } from '../features/workout/api'
import {
  emptyEditorPlan,
  planDetailToEditor,
  snapshotFromEditor,
  editorToSaveInput,
  type EditorOverride,
  type EditorPlan,
  type ExerciseMeta,
} from '../features/workout/builder'
import { GOAL_OPTIONS } from '../features/workout/schema'
import {
  snapshotVolumeItems,
  type MovementPattern,
  type MuscleGroup,
} from '../features/workout/volume'
import { VolumeLandmarkPanel } from '../features/workout/VolumeLandmarkPanel'
import { OneRmCalculator } from '../features/workout/OneRmCalculator'
import { AnamneseFlag } from '../features/workout/AnamneseFlag'
import { SourceCard } from '../features/workout/SourceCard'
import { ExercisePicker } from '../features/workout/ExercisePicker'
import { WeeksCard } from '../features/workout/WeeksCard'
import { exerciseCautions, posturalEmphasis } from '../features/workout/contraindications'
import { useAnamneses } from '../features/anamnesis/hooks'
import { parseAnswers } from '../features/anamnesis/parse'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { controlClass } from '@/lib/ui'
import { normalizeDbError } from '../lib/errors'

function newKey(): string {
  const c = globalThis.crypto as Crypto | undefined
  return c?.randomUUID ? c.randomUUID() : `k-${Math.random().toString(36).slice(2)}`
}

// move um item de uma posicao para outra (reordenar dias/exercicios)
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice()
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item)
  return next
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

export default function TreinoNovo() {
  const { id, planId } = useParams()
  const isEdit = !!planId
  const subjectQuery = useSubject(id)
  const { organization } = useOrganization()
  const exercisesQuery = useExercises(organization?.id)
  const planQuery = useWorkoutPlan(planId)

  if (
    subjectQuery.isPending ||
    exercisesQuery.isPending ||
    (isEdit && planQuery.isPending)
  ) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }
  if (subjectQuery.isError || !subjectQuery.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Não foi possível carregar o avaliado.</p>
        <Button asChild variant="outline">
          <Link to="/avaliados">Voltar</Link>
        </Button>
      </div>
    )
  }
  if (isEdit && (!planQuery.data || !planQuery.data.plan)) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Não foi possível carregar o plano.</p>
        <Button asChild variant="outline">
          <Link to={`/avaliados/${id}`}>Voltar</Link>
        </Button>
      </div>
    )
  }

  const initial =
    isEdit && planQuery.data?.plan ? planDetailToEditor(planQuery.data) : emptyEditorPlan()

  return (
    <Builder
      // key força remontar o editor ao trocar de plano/rota: sem ela, navegar
      // entre duas edições manteria o estado do plano anterior (useState(initial))
      key={planId ?? 'novo'}
      subjectId={subjectQuery.data.id}
      subjectName={subjectQuery.data.full_name}
      orgId={organization?.id ?? ''}
      exercises={exercisesQuery.data ?? []}
      initial={initial}
      planId={isEdit ? planId : undefined}
    />
  )
}

function Builder({
  subjectId,
  subjectName,
  orgId,
  exercises,
  initial,
  planId,
}: {
  subjectId: string
  subjectName: string
  orgId: string
  exercises: ExerciseRow[]
  initial: EditorPlan
  planId?: string
}) {
  const navigate = useNavigate()
  const isEdit = !!planId
  const createMut = useCreateWorkoutPlan(subjectId)
  const updateMut = useUpdateWorkoutPlan(subjectId, planId)
  const mut = isEdit ? updateMut : createMut
  const anamneseQ = useAnamneses(subjectId)

  const [plan, setPlan] = useState<EditorPlan>(initial)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showCalc, setShowCalc] = useState(false)
  const [dragDay, setDragDay] = useState<number | null>(null)
  const [dragEx, setDragEx] = useState<{ dayKey: string; idx: number } | null>(null)

  const exercisesById = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])),
    [exercises]
  )
  const metaById = useMemo(
    () =>
      new Map<string, ExerciseMeta>(
        exercises.map((e) => [
          e.id,
          {
            primaryMuscle: e.primary_muscle as MuscleGroup,
            secondaryMuscles: e.secondary_muscles as MuscleGroup[],
            movementPattern: e.movement_pattern as MovementPattern,
          },
        ])
      ),
    [exercises]
  )

  const snapshot = useMemo(() => snapshotFromEditor(plan, metaById), [plan, metaById])
  const refinedSnapshot = useMemo(
    () => snapshotFromEditor(plan, metaById, 'refined'),
    [plan, metaById]
  )

  function nameOf(exerciseId: string): string {
    return exercisesById.get(exerciseId)?.name ?? 'Exercício'
  }

  // inteligência avaliação→prescrição: sinais da anamnese mais recente do aluno
  const anamnesePayload = anamneseQ.data?.[0]?.payload
  const anamneseAnswers = anamnesePayload != null ? parseAnswers(anamnesePayload) : null
  const posturalNotes = anamneseAnswers ? posturalEmphasis(anamneseAnswers) : []
  function cautionsFor(exerciseId: string): string[] {
    if (!anamneseAnswers) return []
    const e = exercisesById.get(exerciseId)
    if (!e) return []
    return exerciseCautions(anamneseAnswers, {
      primaryMuscle: e.primary_muscle as MuscleGroup,
      secondaryMuscles: e.secondary_muscles as MuscleGroup[],
      movementPattern: e.movement_pattern as MovementPattern,
    })
  }
  const totalCautions = plan.days.reduce(
    (acc, d) => acc + d.exercises.filter((ex) => cautionsFor(ex.exerciseId).length > 0).length,
    0
  )

  // ---- mutadores do editor -------------------------------------------
  function addDay() {
    const nextLabel = String.fromCharCode(65 + plan.days.length) // A, B, C...
    setPlan((p) => ({
      ...p,
      days: [...p.days, { key: newKey(), label: nextLabel, name: null, exercises: [] }],
    }))
  }
  function removeDay(dayKey: string) {
    setPlan((p) => ({ ...p, days: p.days.filter((d) => d.key !== dayKey) }))
  }
  function moveDay(from: number, to: number) {
    if (to < 0 || to >= plan.days.length) return
    setPlan((p) => ({ ...p, days: arrayMove(p.days, from, to) }))
  }
  function moveExercise(dayKey: string, from: number, to: number) {
    setPlan((p) => ({
      ...p,
      days: p.days.map((d) =>
        d.key === dayKey ? { ...d, exercises: arrayMove(d.exercises, from, to) } : d
      ),
    }))
  }
  function patchDay(dayKey: string, patch: Partial<{ label: string; name: string | null }>) {
    setPlan((p) => ({
      ...p,
      days: p.days.map((d) => (d.key === dayKey ? { ...d, ...patch } : d)),
    }))
  }
  function addExercise(dayKey: string, exerciseId: string) {
    setPlan((p) => ({
      ...p,
      days: p.days.map((d) =>
        d.key === dayKey
          ? {
              ...d,
              exercises: [
                ...d.exercises,
                {
                  key: newKey(),
                  exerciseId,
                  sets: 3,
                  reps: '8-12',
                  rir: 2,
                  restSeconds: 90,
                  tempo: null,
                  notes: null,
                },
              ],
            }
          : d
      ),
    }))
  }
  function removeExercise(dayKey: string, exKey: string) {
    setPlan((p) => ({
      ...p,
      days: p.days.map((d) =>
        d.key === dayKey ? { ...d, exercises: d.exercises.filter((e) => e.key !== exKey) } : d
      ),
      // limpa overrides orfaos do exercicio removido
      overrides: p.overrides.filter((o) => o.exerciseKey !== exKey),
    }))
  }
  function patchExercise(
    dayKey: string,
    exKey: string,
    patch: Partial<{ sets: number; reps: string; rir: number | null; restSeconds: number | null }>
  ) {
    setPlan((p) => ({
      ...p,
      days: p.days.map((d) =>
        d.key === dayKey
          ? {
              ...d,
              exercises: d.exercises.map((e) => (e.key === exKey ? { ...e, ...patch } : e)),
            }
          : d
      ),
    }))
  }
  function upsertOverride(week: number, exKey: string, patch: Partial<EditorOverride>) {
    setPlan((p) => {
      const idx = p.overrides.findIndex((o) => o.week === week && o.exerciseKey === exKey)
      const base: EditorOverride =
        idx >= 0
          ? p.overrides[idx]
          : {
              week,
              exerciseKey: exKey,
              sets: null,
              reps: null,
              rir: null,
              restSeconds: null,
              isSkipped: false,
              notes: null,
            }
      const next = { ...base, ...patch }
      const empty =
        next.sets == null &&
        next.reps == null &&
        next.rir == null &&
        next.restSeconds == null &&
        !next.isSkipped &&
        !next.notes
      let overrides: EditorOverride[]
      if (empty) overrides = p.overrides.filter((_, i) => i !== idx)
      else if (idx >= 0) overrides = p.overrides.map((o, i) => (i === idx ? next : o))
      else overrides = [...p.overrides, next]
      return { ...p, overrides }
    })
  }
  function patchWeekMeta(week: number, patch: Partial<{ label: string | null; isDeload: boolean }>) {
    setPlan((p) => {
      const idx = p.weeksMeta.findIndex((w) => w.week === week)
      const base = idx >= 0 ? p.weeksMeta[idx] : { week, label: null, isDeload: false, notes: null }
      const next = { ...base, ...patch }
      const empty = !next.label && !next.isDeload && !next.notes
      let weeksMeta
      if (empty) weeksMeta = p.weeksMeta.filter((_, i) => i !== idx)
      else if (idx >= 0) weeksMeta = p.weeksMeta.map((w, i) => (i === idx ? next : w))
      else weeksMeta = [...p.weeksMeta, next]
      return { ...p, weeksMeta }
    })
  }

  // ---- sequencia semanal (repetir divisao na semana) ------------------
  function baseSchedule(p: EditorPlan): string[] {
    const labels = p.days.map((d) => d.label)
    const cur = p.weeklySchedule.length > 0 ? p.weeklySchedule : labels
    return cur.filter((l) => labels.includes(l))
  }
  function setScheduleSlot(i: number, label: string) {
    setPlan((p) => {
      const s = baseSchedule(p).slice()
      s[i] = label
      return { ...p, weeklySchedule: s }
    })
  }
  function removeScheduleSlot(i: number) {
    setPlan((p) => ({ ...p, weeklySchedule: baseSchedule(p).filter((_, idx) => idx !== i) }))
  }
  function addScheduleSlot() {
    setPlan((p) => {
      const labels = p.days.map((d) => d.label)
      return { ...p, weeklySchedule: [...baseSchedule(p), labels[0] ?? ''] }
    })
  }

  // ---- salvar ---------------------------------------------------------
  async function handleSave() {
    setSubmitError(null)
    if (!orgId) return setSubmitError('Organização não carregada.')
    if (!plan.name.trim()) return setSubmitError('Informe o nome do plano.')
    if (!(plan.weeks >= 1 && plan.weeks <= 52)) return setSubmitError('Semanas entre 1 e 52.')
    if (plan.days.length === 0) return setSubmitError('Adicione ao menos uma divisão.')
    if (plan.days.some((d) => d.exercises.length === 0)) {
      return setSubmitError('Toda divisão precisa de ao menos um exercício.')
    }
    if (plan.days.some((d) => !d.label.trim())) {
      return setSubmitError('Toda divisão precisa de um rótulo (A, B, C...).')
    }
    try {
      const save = editorToSaveInput(plan, { orgId, subjectId }, snapshot)
      const saved = await mut.mutateAsync(save)
      navigate(`/avaliados/${subjectId}/treinos/${saved.id}`)
    } catch (e) {
      setSubmitError(normalizeDbError(e))
    }
  }

  const flatExercises = plan.days.flatMap((d) =>
    d.exercises.map((ex, i) => ({
      key: ex.key,
      tag: `${d.label}${i + 1}`,
      name: nameOf(ex.exerciseId),
      templateSets: ex.sets,
      templateReps: ex.reps,
      templateRir: ex.rir,
      templateRest: ex.restSeconds,
    }))
  )
  const dayLabels = plan.days.map((d) => d.label)
  const weekSchedule = baseSchedule(plan)

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          to={`/avaliados/${subjectId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {subjectName}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{isEdit ? 'Editar plano' : 'Novo plano de treino'}</h1>
      </div>

      <AnamneseFlag subjectId={subjectId} />

      {totalCautions > 0 || posturalNotes.length > 0 ? (
        <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-400/30 dark:bg-amber-400/10">
          <p className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="size-4" /> Atenção pela anamnese
          </p>
          {totalCautions > 0 ? (
            <p className="text-amber-900 dark:text-amber-100">
              {totalCautions} exercício{totalCautions > 1 ? 's' : ''} deste plano merece
              {totalCautions > 1 ? 'm' : ''} revisão pela queixa do aluno (marcados com ⚠ abaixo).
            </p>
          ) : null}
          {posturalNotes.map((n, i) => (
            <p key={i} className="text-amber-900 dark:text-amber-100">
              {n}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome do plano">
          <Input value={plan.name} onChange={(e) => setPlan((p) => ({ ...p, name: e.target.value }))} />
        </Field>
        <Field label="Objetivo">
          <select
            className={controlClass}
            value={plan.goal ?? ''}
            onChange={(e) => setPlan((p) => ({ ...p, goal: e.target.value || null }))}
          >
            <option value="">Sem objetivo</option>
            {GOAL_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Semanas (mesociclo)">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={52}
            value={plan.weeks}
            onChange={(e) => setPlan((p) => ({ ...p, weeks: Math.max(1, Number(e.target.value) || 1) }))}
          />
        </Field>
        <Field label="Início (opcional)">
          <Input
            type="date"
            value={plan.startsOn ?? ''}
            onChange={(e) => setPlan((p) => ({ ...p, startsOn: e.target.value || null }))}
          />
        </Field>
        <Field label="Situação">
          <select
            className={controlClass}
            value={plan.status}
            onChange={(e) => setPlan((p) => ({ ...p, status: e.target.value }))}
          >
            <option value="draft">Rascunho</option>
            <option value="active">Ativo</option>
            <option value="archived">Arquivado</option>
          </select>
        </Field>
      </div>

      <SourceCard
        subjectId={subjectId}
        assessmentId={plan.sourceAssessmentId}
        sessionId={plan.sourcePostureSessionId}
        onChange={(patch) => setPlan((p) => ({ ...p, ...patch }))}
      />

      {/* Volume ao vivo, contra os landmarks (MEV/MAV/MRV) */}
      <VolumeLandmarkPanel
        items={snapshotVolumeItems(snapshot)}
        refinedItems={snapshotVolumeItems(refinedSnapshot)}
        typicalWeek={snapshot.typicalWeek}
        emptyHint="Adicione exercícios para ver o volume por grupo muscular."
      />

      {/* Divisões */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Divisões</h2>
          <Button type="button" size="sm" variant="outline" onClick={addDay}>
            <Plus /> Adicionar divisão
          </Button>
        </div>
        {plan.days.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma divisão ainda. Crie A, B, C... e adicione exercícios.
          </p>
        ) : null}
        {plan.days.map((day, dayIndex) => (
          <Card
            key={day.key}
            onDragOver={(e) => {
              if (dragDay !== null) e.preventDefault()
            }}
            onDrop={(e) => {
              if (dragDay !== null) {
                e.preventDefault()
                moveDay(dragDay, dayIndex)
                setDragDay(null)
              }
            }}
            className={dragDay !== null && dragDay !== dayIndex ? 'border-dashed border-primary/60' : ''}
          >
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <span
                draggable
                onDragStart={() => setDragDay(dayIndex)}
                onDragEnd={() => setDragDay(null)}
                className="cursor-grab text-muted-foreground"
                title="Arraste para reordenar a divisão"
              >
                <GripVertical className="size-4" />
              </span>
              <Input
                className="w-16"
                value={day.label}
                onChange={(e) => patchDay(day.key, { label: e.target.value })}
                placeholder="A"
              />
              <Input
                value={day.name ?? ''}
                onChange={(e) => patchDay(day.key, { name: e.target.value || null })}
                placeholder="Nome (ex.: Peito e tríceps)"
              />
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => moveDay(dayIndex, dayIndex - 1)}
                  disabled={dayIndex === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  title="Subir"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveDay(dayIndex, dayIndex + 1)}
                  disabled={dayIndex === plan.days.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  title="Descer"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeDay(day.key)}
                className="shrink-0 text-destructive"
                title="Remover divisão"
              >
                <Trash2 className="size-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              {day.exercises.map((ex, i) => (
                <div
                  key={ex.key}
                  onDragOver={(e) => {
                    if (dragEx?.dayKey === day.key) e.preventDefault()
                  }}
                  onDrop={(e) => {
                    if (dragEx?.dayKey === day.key) {
                      e.preventDefault()
                      moveExercise(day.key, dragEx.idx, i)
                      setDragEx(null)
                    }
                  }}
                  className={`rounded-md border bg-muted/20 p-2 ${
                    dragEx?.dayKey === day.key && dragEx.idx !== i ? 'border-dashed border-primary/60' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      draggable
                      onDragStart={() => setDragEx({ dayKey: day.key, idx: i })}
                      onDragEnd={() => setDragEx(null)}
                      className="cursor-grab text-muted-foreground"
                      title="Arraste para reordenar"
                    >
                      <GripVertical className="size-4" />
                    </span>
                    <span className="flex flex-1 items-center gap-1.5 text-sm font-medium">
                      {i + 1}. {nameOf(ex.exerciseId)}
                      {cautionsFor(ex.exerciseId).length > 0 ? (
                        <span
                          className="text-amber-500"
                          title={`Revisar: ${cautionsFor(ex.exerciseId).join(' · ')}`}
                        >
                          <AlertTriangle className="size-3.5" />
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => moveExercise(day.key, i, i - 1)}
                      disabled={i === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      title="Subir"
                    >
                      <ChevronUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveExercise(day.key, i, i + 1)}
                      disabled={i === day.exercises.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      title="Descer"
                    >
                      <ChevronDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeExercise(day.key, ex.key)}
                      className="text-destructive"
                      title="Remover exercício"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    <Field label="Séries">
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={ex.sets}
                        onChange={(e) =>
                          patchExercise(day.key, ex.key, { sets: Math.max(1, Number(e.target.value) || 1) })
                        }
                      />
                    </Field>
                    <Field label="Reps">
                      <Input
                        value={ex.reps}
                        onChange={(e) => patchExercise(day.key, ex.key, { reps: e.target.value })}
                      />
                    </Field>
                    <Field label="RIR">
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        value={ex.rir ?? ''}
                        onChange={(e) =>
                          patchExercise(day.key, ex.key, {
                            rir: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                    <Field label="Descanso (s)">
                      <Input
                        type="number"
                        min={0}
                        max={600}
                        value={ex.restSeconds ?? ''}
                        onChange={(e) =>
                          patchExercise(day.key, ex.key, {
                            restSeconds: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                  </div>
                </div>
              ))}
              <ExercisePicker
                exercises={exercises}
                orgId={orgId}
                onPick={(exerciseId) => addExercise(day.key, exerciseId)}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sequência semanal (repetir divisão na semana, ex.: ABA) */}
      {plan.days.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sequência semanal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Ordem das sessões na semana. Repita uma divisão para treiná-la mais de uma vez (ex.:
              A, B, A) — o volume conta as repetições.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {weekSchedule.map((label, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 rounded-md border bg-card py-1 pl-2 pr-1"
                >
                  <span className="text-xs text-muted-foreground">{i + 1}</span>
                  <select
                    className="bg-transparent text-sm outline-none"
                    value={label}
                    onChange={(e) => setScheduleSlot(i, e.target.value)}
                  >
                    {dayLabels.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeScheduleSlot(i)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remover sessão"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              <Button type="button" size="xs" variant="outline" onClick={addScheduleSlot}>
                <Plus /> Sessão
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {weekSchedule.length} {weekSchedule.length === 1 ? 'sessão' : 'sessões'} por semana
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Semanas / overrides */}
      {plan.days.length > 0 ? (
        <WeeksCard
          plan={plan}
          flatExercises={flatExercises}
          onWeekMeta={patchWeekMeta}
          onOverride={upsertOverride}
        />
      ) : null}

      <Card>
        <CardHeader className="py-0">
          <button
            type="button"
            onClick={() => setShowCalc((s) => !s)}
            className="flex w-full items-center justify-between py-4"
          >
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="size-4 text-muted-foreground" /> Calculadora de carga (1RM)
            </CardTitle>
            {showCalc ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        </CardHeader>
        {showCalc ? (
          <CardContent>
            <OneRmCalculator />
          </CardContent>
        ) : null}
      </Card>

      <Field label="Observações (opcional)">
        <textarea
          rows={3}
          className={controlClass}
          value={plan.notes ?? ''}
          onChange={(e) => setPlan((p) => ({ ...p, notes: e.target.value || null }))}
        />
      </Field>

      {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={mut.isPending}>
          {mut.isPending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Salvar plano'}
        </Button>
        <Button variant="outline" asChild>
          <Link to={`/avaliados/${subjectId}`}>Cancelar</Link>
        </Button>
      </div>
    </div>
  )
}

