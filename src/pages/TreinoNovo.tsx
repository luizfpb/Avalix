import { useMemo, useRef, useState, type ReactNode } from 'react'
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
  Layers,
  Link2,
  Repeat,
  Unlink,
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
  duplicateExerciseInDay,
  planDetailToEditor,
  snapshotFromEditor,
  editorToSaveInput,
  type EditorDay,
  type EditorExercise,
  type EditorOverride,
  type EditorPlan,
  type ExerciseMeta,
} from '../features/workout/builder'
import {
  TECHNIQUE_OPTIONS,
  circuitSetsMismatch,
  groupHint,
  groupLabel,
  groupWithPrevious,
  normalizeGroups,
  setGroupKind,
  toBlocks,
  ungroupAt,
  type Block,
  type GroupKind,
  type Technique,
} from '../features/workout/groups'
import { GOAL_OPTIONS } from '../features/workout/schema'
import { clearDraft, useFormDraft } from '../lib/draft'
import { useUnsavedChanges } from '../lib/unsavedChanges'
import { UnsavedBadge, UnsavedChangesPrompt } from '../components/UnsavedChanges'
import {
  snapshotVolumeItems,
  type MovementPattern,
  type MuscleGroup,
} from '../features/workout/volume'
import { VolumeLandmarkPanel } from '../features/workout/VolumeLandmarkPanel'
import { useWorkoutPlans } from '../features/workout/hooks'
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
import { QueryError } from '../components/QueryError'

function newKey(): string {
  const c = globalThis.crypto as Crypto | undefined
  return c?.randomUUID ? c.randomUUID() : `k-${Math.random().toString(36).slice(2)}`
}

// Etiqueta do bloco (super-série/circuito). Curta de propósito: a coluna aceita
// 40 caracteres e a normalização deriva chaves a partir dela quando um bloco
// parte em dois — com um uuid inteiro não sobraria espaço para o sufixo.
function newGroupKey(): string {
  return `g-${newKey().replace(/-/g, '').slice(0, 10)}`
}

// move um item de uma posicao para outra (reordenar dias/exercicios)
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice()
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item)
  return next
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
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
  if (exercisesQuery.isError) {
    return (
      <QueryError
        message="Não foi possível carregar o catálogo de exercícios. O editor foi bloqueado para proteger o plano."
        onRetry={() => void exercisesQuery.refetch()}
      />
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
      planUpdatedAt={isEdit ? planQuery.data?.plan?.updated_at ?? null : null}
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
  planUpdatedAt,
}: {
  subjectId: string
  subjectName: string
  orgId: string
  exercises: ExerciseRow[]
  initial: EditorPlan
  planId?: string
  // Versão do plano que ESTA tela carregou, para a concorrência otimista da
  // migration 0023: salvar por cima de uma edição feita em outro dispositivo
  // passa a ser recusado em vez de sobrescrever em silêncio.
  planUpdatedAt?: string | null
}) {
  const navigate = useNavigate()
  const isEdit = !!planId
  const createMut = useCreateWorkoutPlan(subjectId)
  const updateMut = useUpdateWorkoutPlan(subjectId, planId, planUpdatedAt)
  const mut = isEdit ? updateMut : createMut
  const anamneseQ = useAnamneses(subjectId)

  const [plan, setPlan] = useState<EditorPlan>(initial)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Qual plano perde a vigência ao salvar este como ativo. Nulo quando não há
  // outro ativo, ou quando o outro é este mesmo (edição).
  const planosQ = useWorkoutPlans(subjectId)
  const planoAtivoQueSeraArquivado =
    plan.status === 'active'
      ? ((planosQ.data ?? []).find((p) => p.status === 'active' && p.id !== planId) ?? null)
      : null
  const [showCalc, setShowCalc] = useState(false)

  // Montar um mesociclo (divisões, exercícios, séries/reps/RIR/descanso,
  // sequência semanal e overrides por semana) é o trabalho mais longo do app e
  // vivia só em memória: um toque em Voltar, um F5 ou o Android descartando a
  // aba jogava tudo fora. Mesmo escopo/TTL dos outros formulários longos.
  //
  // O rascunho passa a valer TAMBÉM na edição. Ele ficava de fora porque um
  // rascunho velho poderia ressuscitar dados por cima do plano salvo — risco
  // real, e resolvido pela chave, não abrindo mão do rascunho: ela carrega a
  // versão do plano que esta tela carregou. Se o plano mudou no servidor desde
  // então (outro dispositivo, outra aba), a chave não bate e o rascunho antigo
  // simplesmente não é encontrado. Editar um plano é o caso em que perder o
  // trabalho dói mais, porque o ponto de partida já era um plano inteiro.
  const draftKey = isEdit
    ? `treino:${subjectId}:${planId}:${planUpdatedAt ?? '-'}`
    : `treino:${subjectId}`
  const draft = useFormDraft<EditorPlan>(draftKey, plan, (d) => setPlan(d))

  // "Tem alteração pendente?" comparado contra o estado com que a tela abriu.
  // Um sinalizador ligado em cada setPlan esqueceria de um caminho novo mais
  // cedo ou mais tarde, e desfazer tudo na mão voltaria a acusar sujeira.
  const baseline = useRef(JSON.stringify(initial))
  const dirty = useMemo(() => JSON.stringify(plan) !== baseline.current, [plan])
  const guard = useUnsavedChanges(dirty)
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

  if (anamneseQ.isPending) {
    return <p className="text-sm text-muted-foreground">Carregando dados de segurança...</p>
  }
  if (anamneseQ.isError) {
    return (
      <QueryError
        message="Não foi possível carregar a anamnese. O editor foi bloqueado para não ocultar contraindicações."
        onRetry={() => void anamneseQ.refetch()}
      />
    )
  }

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
  // Toda escrita na lista de exercícios de uma divisão passa por aqui, e sai
  // normalizada: contiguidade e tamanho mínimo dos blocos são invariantes, não
  // algo para cada ação lembrar de manter. Mover um exercício para dentro de um
  // bloco o inclui no bloco; tirá-lo de lá fecha o que sobrou.
  function patchDayExercises(
    dayKey: string,
    fn: (list: EditorExercise[]) => EditorExercise[]
  ) {
    setPlan((p) => ({
      ...p,
      days: p.days.map((d) =>
        d.key === dayKey ? { ...d, exercises: normalizeGroups(fn(d.exercises)) } : d
      ),
    }))
  }
  function moveExercise(dayKey: string, from: number, to: number) {
    patchDayExercises(dayKey, (list) => arrayMove(list, from, to))
  }
  function groupExercise(dayKey: string, index: number) {
    patchDayExercises(dayKey, (list) => groupWithPrevious(list, index, newGroupKey))
  }
  function ungroupExercise(dayKey: string, index: number) {
    patchDayExercises(dayKey, (list) => ungroupAt(list, index))
  }
  function changeGroupKind(dayKey: string, groupKey: string, kind: GroupKind) {
    patchDayExercises(dayKey, (list) => setGroupKind(list, groupKey, kind))
  }
  function patchDay(dayKey: string, patch: Partial<{ label: string; name: string | null }>) {
    setPlan((p) => ({
      ...p,
      days: p.days.map((d) => (d.key === dayKey ? { ...d, ...patch } : d)),
    }))
  }
  function addExercise(dayKey: string, exerciseId: string) {
    const day = plan.days.find((candidate) => candidate.key === dayKey)
    if (day?.exercises.some((exercise) => exercise.exerciseId === exerciseId)) {
      setSubmitError('Este exercício já está nesta divisão.')
      return
    }
    setSubmitError(null)
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
                  groupKey: null,
                  groupKind: null,
                  technique: null,
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
        d.key === dayKey
          ? { ...d, exercises: normalizeGroups(d.exercises.filter((e) => e.key !== exKey)) }
          : d
      ),
      // limpa overrides orfaos do exercicio removido
      overrides: p.overrides.filter((o) => o.exerciseKey !== exKey),
    }))
  }
  function patchExercise(
    dayKey: string,
    exKey: string,
    patch: Partial<{
      sets: number
      reps: string | null
      rir: number | null
      restSeconds: number | null
      technique: Technique | null
    }>
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

  // ---- desenho de uma linha e de um bloco -----------------------------
  // A linha saiu do JSX da divisão porque agora ela aparece em dois contextos —
  // solta e dentro de um bloco — e ter duas cópias do formulário de
  // séries/reps/RIR/descanso/técnica era garantir que um dia elas divergissem.
  function renderExercise(day: EditorDay, ex: EditorExercise, i: number) {
    const exName = nameOf(ex.exerciseId)
    const cautions = cautionsFor(ex.exerciseId)
    const previous = i > 0 ? day.exercises[i - 1] : null
    // só oferece agrupar quando o de cima ainda não é do mesmo bloco
    const canGroup = previous != null && (ex.groupKey == null || ex.groupKey !== previous.groupKey)
    return (
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
            {i + 1}. {exName}
            {cautions.length > 0 ? (
              <span className="text-amber-500" title={`Revisar: ${cautions.join(' · ')}`}>
                <AlertTriangle className="size-3.5" />
              </span>
            ) : null}
          </span>
          {canGroup ? (
            <button
              type="button"
              onClick={() => groupExercise(day.key, i)}
              className="text-muted-foreground hover:text-primary"
              title="Agrupar com o exercício acima (super-série)"
              aria-label={`Agrupar ${exName} com o exercício acima`}
            >
              <Link2 className="size-4" />
            </button>
          ) : null}
          {ex.groupKey != null ? (
            <button
              type="button"
              onClick={() => ungroupExercise(day.key, i)}
              className="text-muted-foreground hover:text-foreground"
              title="Tirar do bloco"
              aria-label={`Tirar ${exName} do bloco`}
            >
              <Unlink className="size-4" />
            </button>
          ) : null}
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
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Field id={`exercise-${ex.key}-sets`} label="Séries">
            <Input
              id={`exercise-${ex.key}-sets`}
              aria-label={`Séries de ${exName} na divisão ${day.label}`}
              type="number"
              min={1}
              max={20}
              value={ex.sets}
              onChange={(e) =>
                patchExercise(day.key, ex.key, { sets: Math.max(1, Number(e.target.value) || 1) })
              }
            />
          </Field>
          {/* Reps e RIR aceitam vazio: aquecimento, mobilidade e trabalho até a
              falha são prescrição sem número. O placeholder diz isso em vez de
              deixar o campo parecer um obrigatório esquecido. */}
          <Field id={`exercise-${ex.key}-reps`} label="Reps">
            <Input
              id={`exercise-${ex.key}-reps`}
              aria-label={`Repetições de ${exName} na divisão ${day.label}`}
              placeholder="livre"
              value={ex.reps ?? ''}
              onChange={(e) =>
                patchExercise(day.key, ex.key, { reps: e.target.value === '' ? null : e.target.value })
              }
            />
          </Field>
          <Field id={`exercise-${ex.key}-rir`} label="RIR">
            <Input
              id={`exercise-${ex.key}-rir`}
              aria-label={`RIR de ${exName} na divisão ${day.label}`}
              type="number"
              min={0}
              max={10}
              placeholder="livre"
              value={ex.rir ?? ''}
              onChange={(e) =>
                patchExercise(day.key, ex.key, {
                  rir: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
          </Field>
          <Field id={`exercise-${ex.key}-rest`} label="Descanso (s)">
            <Input
              id={`exercise-${ex.key}-rest`}
              aria-label={`Descanso de ${exName} na divisão ${day.label}`}
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
          {/* Drop-set, rest-pause, cluster e myo-reps acontecem DENTRO do
              exercício — por isso são um campo dele, e não um tipo de bloco. O
              detalhe ("3 quedas de 20%") vai nas observações do plano. */}
          <Field id={`exercise-${ex.key}-tech`} label="Técnica">
            <select
              id={`exercise-${ex.key}-tech`}
              className={controlClass}
              aria-label={`Técnica de intensidade de ${exName} na divisão ${day.label}`}
              value={ex.technique ?? ''}
              onChange={(e) =>
                patchExercise(day.key, ex.key, {
                  technique: e.target.value ? (e.target.value as Technique) : null,
                })
              }
            >
              <option value="">Nenhuma</option>
              {TECHNIQUE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
    )
  }

  function renderBlock(day: EditorDay, block: Block<EditorExercise>) {
    const kind = block.kind
    const groupKey = block.key
    if (kind == null || groupKey == null) return renderExercise(day, block.items[0], block.start)
    // Num circuito o `sets` de cada exercício É o número de voltas (não existe
    // coluna de voltas justamente para não haver duas contagens). Séries
    // diferentes entre os membros é o único caso ambíguo de verdade, e a tela
    // avisa em vez de escolher no lugar do profissional.
    const voltasDivergentes = kind === 'circuit' && circuitSetsMismatch(block.items)
    return (
      <div key={groupKey} className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            {kind === 'circuit' ? <Repeat className="size-3.5" /> : <Layers className="size-3.5" />}
            {groupLabel(kind, block.items.length)}
          </span>
          {/* Fundo e cor explícitos pelo mesmo motivo do select da sequência
              semanal: sem eles o Chrome no Windows abre a lista clara com o
              texto do tema escuro. */}
          <select
            className="h-7 rounded border bg-card px-1 text-xs text-foreground outline-none"
            aria-label={`Tipo do bloco que começa em ${nameOf(block.items[0].exerciseId)}`}
            value={kind}
            onChange={(e) => changeGroupKind(day.key, groupKey, e.target.value as GroupKind)}
          >
            <option value="superset" className="bg-card text-foreground">
              Super-série
            </option>
            <option value="circuit" className="bg-card text-foreground">
              Circuito
            </option>
          </select>
          <span className="text-[11px] text-muted-foreground">
            {groupHint(kind, block.items.length)}
          </span>
        </div>
        {voltasDivergentes ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Num circuito as séries de cada exercício são as voltas — aqui elas estão diferentes
            entre si.
          </p>
        ) : null}
        {block.items.map((ex, j) => renderExercise(day, ex, block.start + j))}
      </div>
    )
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
    const duplicate = duplicateExerciseInDay(plan)
    if (duplicate) {
      return setSubmitError(`O mesmo exercício aparece mais de uma vez na divisão ${duplicate.dayLabel}.`)
    }
    try {
      const save = editorToSaveInput(plan, { orgId, subjectId }, snapshot)
      const saved = await mut.mutateAsync(save)
      if (draftKey) clearDraft(draftKey)
      // salvou: a navegação seguinte não pode perguntar "descartar alterações?"
      guard.allowNext()
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

      {draft.restored ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <span>Rascunho não salvo recuperado — continue de onde parou.</span>
          <button
            type="button"
            onClick={draft.dismiss}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fechar aviso de rascunho"
          >
            ✕
          </button>
        </div>
      ) : null}

      <AnamneseFlag subjectId={subjectId} />

      {totalCautions > 0 || posturalNotes.length > 0 ? (
        <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-4 text-warning" /> Atenção pela anamnese
          </p>
          {totalCautions > 0 ? (
            <p>
              {totalCautions} exercício{totalCautions > 1 ? 's' : ''} deste plano merece
              {totalCautions > 1 ? 'm' : ''} revisão pela queixa do aluno (marcados com ⚠ abaixo).
            </p>
          ) : null}
          {posturalNotes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="workout-plan-name" label="Nome do plano">
          <Input id="workout-plan-name" value={plan.name} onChange={(e) => setPlan((p) => ({ ...p, name: e.target.value }))} />
        </Field>
        <Field id="workout-plan-goal" label="Objetivo">
          <select
            id="workout-plan-goal"
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
        <Field id="workout-plan-weeks" label="Semanas (mesociclo)">
          <Input
            id="workout-plan-weeks"
            type="number"
            inputMode="numeric"
            min={1}
            max={52}
            value={plan.weeks}
            onChange={(e) => setPlan((p) => ({ ...p, weeks: Math.max(1, Number(e.target.value) || 1) }))}
          />
        </Field>
        <Field id="workout-plan-start" label="Início (opcional)">
          <Input
            id="workout-plan-start"
            type="date"
            value={plan.startsOn ?? ''}
            onChange={(e) => setPlan((p) => ({ ...p, startsOn: e.target.value || null }))}
          />
        </Field>
        <Field id="workout-plan-status" label="Situação">
          <select
            id="workout-plan-status"
            className={controlClass}
            value={plan.status}
            onChange={(e) => setPlan((p) => ({ ...p, status: e.target.value }))}
          >
            <option value="draft">Rascunho</option>
            <option value="active">Ativo</option>
            <option value="archived">Arquivado</option>
          </select>
          {/* Um aluno tem um treino vigente só (0027). O banco arquiva o
              anterior sozinho; a surpresa seria do usuário, não do banco. */}
          {planoAtivoQueSeraArquivado ? (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              Este passa a ser o treino vigente. O plano “{planoAtivoQueSeraArquivado.name}” será
              arquivado — o histórico dele continua disponível.
            </p>
          ) : null}
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
        ) : (
          <p className="text-xs text-muted-foreground">
            Reps e RIR podem ficar em branco quando não há número definido
            (aquecimento, mobilidade, trabalho até a falha). Use{' '}
            <Link2 className="inline size-3.5 align-text-bottom" aria-hidden /> para juntar um
            exercício ao de cima numa super-série ou circuito.
          </p>
        )}
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
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
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
                aria-label={`Rótulo da divisão ${dayIndex + 1}`}
                value={day.label}
                onChange={(e) => patchDay(day.key, { label: e.target.value })}
                placeholder="A"
              />
              <Input
                aria-label={`Nome da divisão ${day.label || dayIndex + 1}`}
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
              {toBlocks(day.exercises).map((block) => renderBlock(day, block))}
              <ExercisePicker
                exercises={exercises}
                orgId={orgId}
                excludedExerciseIds={new Set(day.exercises.map((exercise) => exercise.exerciseId))}
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
                  {/* Fundo e cor EXPLÍCITOS, não bg-transparent. Num select
                      nativo sem cor de fundo própria, o Chrome no Windows
                      desenha a lista aberta sobre uma superfície clara e ainda
                      assim herda a cor do texto do tema — no modo escuro isso
                      dava letra clara sobre fundo claro, e a divisão só
                      aparecia ao passar o mouse. As <option> também levam cor
                      própria: onde o navegador respeita o estilo, é o que
                      garante contraste nos dois temas; onde ignora, o
                      color-scheme do index.css já resolve. Era o único select
                      do app fora do controlClass. */}
                  <select
                    className="rounded bg-card text-sm text-foreground outline-none"
                    value={label}
                    aria-label={`Divisão da sessão ${i + 1} da semana`}
                    onChange={(e) => setScheduleSlot(i, e.target.value)}
                  >
                    {dayLabels.map((l) => (
                      <option key={l} value={l} className="bg-card text-foreground">
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

      <Field id="workout-plan-notes" label="Observações (opcional)">
        <textarea
          id="workout-plan-notes"
          rows={3}
          className={controlClass}
          value={plan.notes ?? ''}
          onChange={(e) => setPlan((p) => ({ ...p, notes: e.target.value || null }))}
        />
      </Field>

      {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleSave} disabled={mut.isPending}>
          {mut.isPending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Salvar plano'}
        </Button>
        <Button variant="outline" asChild>
          <Link to={`/avaliados/${subjectId}`}>Cancelar</Link>
        </Button>
        {dirty ? <UnsavedBadge /> : null}
      </div>

      <UnsavedChangesPrompt guard={guard} what="neste plano de treino" />
    </div>
  )
}
