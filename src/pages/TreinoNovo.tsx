import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
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
import { GOAL_OPTIONS, MUSCLE_OPTIONS } from '../features/workout/schema'
import {
  equipmentLabel,
  muscleLabel,
  snapshotVolumeItems,
  type MuscleGroup,
} from '../features/workout/volume'
import { VolumeLandmarkPanel } from '../features/workout/VolumeLandmarkPanel'
import { ExerciseForm } from '../features/workout/ExerciseForm'
import { useAnamneses } from '../features/anamnesis/hooks'
import { useAssessments } from '../features/assessment/hooks'
import { useSessions } from '../features/posture/hooks'
import { classifyBodyFat } from '../features/assessment/bodyFat'
import type { AssessmentResultSnapshot } from '../features/assessment/result'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const controlClass =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

function newKey(): string {
  const c = globalThis.crypto as Crypto | undefined
  return c?.randomUUID ? c.randomUUID() : `k-${Math.random().toString(36).slice(2)}`
}

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
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

  const [plan, setPlan] = useState<EditorPlan>(initial)
  const [submitError, setSubmitError] = useState<string | null>(null)

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
          },
        ])
      ),
    [exercises]
  )

  const snapshot = useMemo(() => snapshotFromEditor(plan, metaById), [plan, metaById])

  function nameOf(exerciseId: string): string {
    return exercisesById.get(exerciseId)?.name ?? 'Exercício'
  }

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
      setSubmitError((e as Error).message)
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
        {plan.days.map((day) => (
          <Card key={day.key}>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
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
                <div key={ex.key} className="rounded-md border bg-muted/20 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {i + 1}. {nameOf(ex.exerciseId)}
                    </span>
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

      {/* Semanas / overrides */}
      {plan.days.length > 0 ? (
        <WeeksCard
          plan={plan}
          flatExercises={flatExercises}
          onWeekMeta={patchWeekMeta}
          onOverride={upsertOverride}
        />
      ) : null}

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

function AnamneseFlag({ subjectId }: { subjectId: string }) {
  const { data } = useAnamneses(subjectId)
  const latest = data?.[0]
  if (!latest || (latest.liberado && !latest.flag_encaminhamento)) return null
  const nivel =
    latest.nivel_encaminhamento === 'antes_iniciar'
      ? 'Avaliação médica recomendada antes de iniciar exercício.'
      : latest.nivel_encaminhamento === 'antes_vigorosa'
        ? 'Avaliação médica recomendada antes de atividade vigorosa.'
        : null
  return (
    <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-400/30 dark:bg-amber-400/10">
      <p className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
        <AlertTriangle className="size-4" /> Anamnese sinaliza atenção
      </p>
      {nivel ? <p className="text-amber-900 dark:text-amber-100">{nivel}</p> : null}
      {latest.flag_encaminhamento ? (
        <p className="text-amber-900 dark:text-amber-100">
          Há sinais que pedem encaminhamento profissional. Revise antes de prescrever.
        </p>
      ) : null}
      <Link
        to={`/avaliados/${subjectId}/anamnese/${latest.id}`}
        className="inline-block text-xs text-amber-800 underline-offset-4 hover:underline dark:text-amber-300"
      >
        Ver anamnese
      </Link>
    </div>
  )
}

function SourceCard({
  subjectId,
  assessmentId,
  sessionId,
  onChange,
}: {
  subjectId: string
  assessmentId: string | null
  sessionId: string | null
  onChange: (patch: Partial<EditorPlan>) => void
}) {
  const assessmentsQ = useAssessments(subjectId)
  const sessionsQ = useSessions(subjectId)
  const assessments = assessmentsQ.data ?? []
  const sessions = sessionsQ.data ?? []
  const selected = assessments.find((a) => a.id === assessmentId)
  const r = (selected?.results ?? null) as AssessmentResultSnapshot | null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Base da prescrição <span className="font-normal text-muted-foreground">· opcional</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Avaliação física de origem">
            <select
              className={controlClass}
              value={assessmentId ?? ''}
              onChange={(e) => onChange({ sourceAssessmentId: e.target.value || null })}
            >
              <option value="">Nenhuma</option>
              {assessments.map((a) => {
                const rr = a.results as { bodyFatPct?: number } | null
                return (
                  <option key={a.id} value={a.id}>
                    {fmtDate(a.assessed_at)}
                    {rr?.bodyFatPct != null ? ` · ${rr.bodyFatPct.toFixed(1)}% gordura` : ''}
                  </option>
                )
              })}
            </select>
          </Field>
          <Field label="Avaliação postural de origem">
            <select
              className={controlClass}
              value={sessionId ?? ''}
              onChange={(e) => onChange({ sourcePostureSessionId: e.target.value || null })}
            >
              <option value="">Nenhuma</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {fmtDate(s.taken_at)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {r && selected ? (
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">
              Achados da avaliação de {fmtDate(selected.assessed_at)} — orientam a prescrição
            </p>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span>
                <span className="text-muted-foreground">% gordura </span>
                <b>{r.bodyFatPct.toFixed(1)}%</b>{' '}
                <span className="text-muted-foreground">
                  ({classifyBodyFat(r.inputs.sex, r.bodyFatPct).label})
                </span>
              </span>
              <span>
                <span className="text-muted-foreground">Massa magra </span>
                <b>{r.leanMassKg.toFixed(1)} kg</b>
              </span>
              <span>
                <span className="text-muted-foreground">Massa gorda </span>
                <b>{r.fatMassKg.toFixed(1)} kg</b>
              </span>
              <span>
                <span className="text-muted-foreground">Peso </span>
                <b>{selected.weight_kg} kg</b>
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ExercisePicker({
  exercises,
  orgId,
  onPick,
}: {
  exercises: ExerciseRow[]
  orgId: string
  onPick: (exerciseId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState('')
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return exercises
      .filter((e) => {
        if (muscle && e.primary_muscle !== muscle && !e.secondary_muscles.includes(muscle)) return false
        if (q && !e.name.toLowerCase().includes(q)) return false
        return true
      })
      .slice(0, 60)
  }, [exercises, search, muscle])

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus /> Adicionar exercício
      </Button>
    )
  }

  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          placeholder="Buscar exercício..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={`${controlClass} w-40`} value={muscle} onChange={(e) => setMuscle(e.target.value)}>
          <option value="">Todos os grupos</option>
          {MUSCLE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground" title="Fechar">
          <Trash2 className="size-4" />
        </button>
      </div>

      <ul className="max-h-56 divide-y overflow-y-auto rounded-md border bg-card">
        {filtered.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => {
                onPick(e.id)
                setOpen(false)
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span>
                {e.name}
                {e.org_id ? <span className="ml-1 text-xs text-primary">(custom)</span> : null}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {muscleLabel(e.primary_muscle as MuscleGroup)} · {equipmentLabel(e.equipment as never)}
              </span>
            </button>
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">Nenhum exercício encontrado.</li>
        ) : null}
      </ul>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {creating ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Criar exercício (está faltando no catálogo)
        </button>
        <Link to="/exercicios" className="text-xs text-muted-foreground hover:underline">
          Gerenciar biblioteca
        </Link>
      </div>
      {creating ? (
        <ExerciseForm
          orgId={orgId}
          onSaved={(row) => {
            onPick(row.id)
            setCreating(false)
            setOpen(false)
          }}
          onCancel={() => setCreating(false)}
        />
      ) : null}
    </div>
  )
}

function WeeksCard({
  plan,
  flatExercises,
  onWeekMeta,
  onOverride,
}: {
  plan: EditorPlan
  flatExercises: {
    key: string
    tag: string
    name: string
    templateSets: number
    templateReps: string
    templateRir: number | null
    templateRest: number | null
  }[]
  onWeekMeta: (week: number, patch: Partial<{ label: string | null; isDeload: boolean }>) => void
  onOverride: (week: number, exKey: string, patch: Partial<EditorOverride>) => void
}) {
  const [openWeek, setOpenWeek] = useState<number | null>(null)
  const weeks = Array.from({ length: plan.weeks }, (_, i) => i + 1)

  function metaOf(week: number) {
    return plan.weeksMeta.find((w) => w.week === week)
  }
  function overrideOf(week: number, exKey: string) {
    return plan.overrides.find((o) => o.week === week && o.exerciseKey === exKey)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Semanas e ajustes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {weeks.map((week) => {
          const meta = metaOf(week)
          const isOpen = openWeek === week
          return (
            <div key={week} className="rounded-md border">
              <div className="flex flex-wrap items-center gap-2 p-2">
                <button
                  type="button"
                  onClick={() => setOpenWeek(isOpen ? null : week)}
                  className="flex items-center gap-1 text-sm font-medium"
                >
                  {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  Semana {week}
                </button>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={meta?.isDeload ?? false}
                    onChange={(e) => onWeekMeta(week, { isDeload: e.target.checked })}
                  />
                  Deload
                </label>
                <Input
                  className="h-8 w-40"
                  placeholder="Rótulo (opcional)"
                  value={meta?.label ?? ''}
                  onChange={(e) => onWeekMeta(week, { label: e.target.value || null })}
                />
              </div>
              {isOpen ? (
                <div className="space-y-1.5 border-t p-2">
                  <p className="text-xs text-muted-foreground">
                    Ajuste séries/reps/RIR/descanso ou marque pular. Em branco = igual ao template.
                  </p>
                  <div className="hidden items-center gap-2 px-1 text-[11px] text-muted-foreground sm:flex">
                    <span className="w-36">Exercício</span>
                    <span className="w-14 text-center">séries</span>
                    <span className="w-16 text-center">reps</span>
                    <span className="w-12 text-center">RIR</span>
                    <span className="w-16 text-center">desc (s)</span>
                    <span className="w-10 text-center">pular</span>
                  </div>
                  {flatExercises.map((ex) => {
                    const ov = overrideOf(week, ex.key)
                    const skip = ov?.isSkipped ?? false
                    return (
                      <div
                        key={ex.key}
                        className="flex flex-wrap items-center gap-2 text-sm sm:flex-nowrap"
                      >
                        <span className="w-full truncate sm:w-36">
                          <span className="text-muted-foreground">{ex.tag}</span> {ex.name}
                        </span>
                        <Input
                          className="h-8 w-14"
                          type="number"
                          min={1}
                          max={20}
                          placeholder={String(ex.templateSets)}
                          value={ov?.sets ?? ''}
                          disabled={skip}
                          onChange={(e) =>
                            onOverride(week, ex.key, {
                              sets: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                        <Input
                          className="h-8 w-16"
                          placeholder={ex.templateReps}
                          value={ov?.reps ?? ''}
                          disabled={skip}
                          onChange={(e) => onOverride(week, ex.key, { reps: e.target.value || null })}
                        />
                        <Input
                          className="h-8 w-12"
                          type="number"
                          min={0}
                          max={10}
                          placeholder={ex.templateRir != null ? String(ex.templateRir) : '—'}
                          value={ov?.rir ?? ''}
                          disabled={skip}
                          onChange={(e) =>
                            onOverride(week, ex.key, {
                              rir: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                        <Input
                          className="h-8 w-16"
                          type="number"
                          min={0}
                          max={600}
                          placeholder={ex.templateRest != null ? String(ex.templateRest) : '—'}
                          value={ov?.restSeconds ?? ''}
                          disabled={skip}
                          onChange={(e) =>
                            onOverride(week, ex.key, {
                              restSeconds: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                        <label
                          className="flex w-10 items-center justify-center"
                          title="Pular nesta semana"
                        >
                          <input
                            type="checkbox"
                            checked={skip}
                            onChange={(e) => onOverride(week, ex.key, { isSkipped: e.target.checked })}
                          />
                        </label>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
