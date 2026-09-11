import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Trash2, Plus, X, ChevronDown, ChevronRight } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import {
  useCreateWorkoutLog,
  useDeleteWorkoutLog,
  useExercises,
  usePlanSetHistory,
  useWorkoutLogs,
  useWorkoutLogSets,
  useWorkoutPlan,
  useUpdateWorkoutLog,
} from '../features/workout/hooks'
import type { ExerciseRow, NewLogSet, SetHistoryPoint, WorkoutPlanDetail } from '../features/workout/api'
import {
  adherencePct,
  completedWeeks,
  effectivePlanStart,
  exerciseProgression,
  plannedSessions,
  plannedSessionsToDate,
  sessionsPerWeek,
  suggestedPlanWeek,
  type PlanWeekSuggestion,
} from '../features/workout/progress'
import {
  latestBestByExercise,
  parseRepRange,
  suggestProgression,
  type ProgressionKind,
} from '../features/workout/progression'
import { roundToIncrement } from '../features/workout/oneRm'
import { effectivePrescription, formatSetsReps, overrideFor, overrideIndex } from '../features/workout/effective'
import { techniqueLabel, toRowBlocks } from '../features/workout/groups'
import { GroupBlock } from '../features/workout/GroupBlock'
import { SessionFeel } from '../features/workout/SessionFeel'
import { ExercisePicker } from '../features/workout/ExercisePicker'
import { linePath } from '../features/reports/charts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { QueryError } from '../components/QueryError'

import { controlClass } from '@/lib/ui'
import { normalizeDbError } from '../lib/errors'
import { updateLogRow, validateLogRows, type LogRow } from '../features/workout/logRows'
import { reconcileSetRows } from '../features/workout/logRows'
import { SessionSets } from '../features/workout/SessionSets'
import { SetRowFields } from '../features/workout/SetRowFields'
import { SessionEditForm, type EditableSessionSet, type SessionEditValues } from '../features/workout/SessionEditForm'
import type { WorkoutLogRow } from '../features/workout/api'

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export default function Execucao() {
  const { id, planId } = useParams()
  const { organization } = useOrganization()
  const planQuery = useWorkoutPlan(planId)
  const exercisesQuery = useExercises(organization?.id)
  const logsQuery = useWorkoutLogs(planId)
  const historyQuery = usePlanSetHistory(planId)
  const deleteMut = useDeleteWorkoutLog(planId)
  const [confirmLogId, setConfirmLogId] = useState<string | null>(null)
  const [openLogId, setOpenLogId] = useState<string | null>(null)

  const names = useMemo(() => {
    const m: Record<string, string> = {}
    for (const e of exercisesQuery.data ?? []) m[e.id] = e.name
    return m
  }, [exercisesQuery.data])

  if (planQuery.isPending) return <p className="text-sm text-muted-foreground">Carregando...</p>
  const detail = planQuery.data
  if (planQuery.isError || !detail?.plan) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Não foi possível carregar o plano.</p>
        <Button type="button" size="sm" onClick={() => void planQuery.refetch()}>
          Tentar novamente
        </Button>
        <Button asChild variant="outline">
          <Link to={`/avaliados/${id}`}>Voltar</Link>
        </Button>
      </div>
    )
  }

  const plan = detail.plan
  const logs = logsQuery.data ?? []
  const sessionsPerWeekCount = sessionsPerWeek(plan.weekly_schedule, detail.days.length)
  const done = logs.length
  // Início efetivo: a data informada, a primeira sessão registrada ou, em
  // último caso, a criação do plano. Plano entregue em janeiro e começado em
  // março não pode ser cobrado desde janeiro.
  const firstSessionOn = logs.length > 0 ? logs[logs.length - 1].performed_at : null
  const startedOn = effectivePlanStart(plan.starts_on, firstSessionOn, plan.created_at)
  // Cobra apenas as semanas já fechadas: quem está em dia na semana 2 de um
  // plano de 8 não pode aparecer com 25%.
  const plannedToDate = plannedSessionsToDate(plan.weeks, sessionsPerWeekCount, startedOn, new Date())
  const planned = plannedToDate ?? 0
  const pct = plannedToDate != null ? adherencePct(done, plannedToDate) : 0
  const adherenceCaption =
    plannedToDate != null
      ? `Cobrado até aqui: ${plannedToDate} ${plannedToDate === 1 ? 'sessão' : 'sessões'} (semanas já concluídas). ` +
        `Plano completo = ${plan.weeks} ${plan.weeks === 1 ? 'semana' : 'semanas'} × ${sessionsPerWeekCount} ` +
        `${sessionsPerWeekCount === 1 ? 'sessão' : 'sessões'} por semana.`
      : `Primeira semana em andamento — a adesão passa a ser calculada quando ela fechar. ` +
        `Plano completo = ${plannedSessions(plan.weeks, sessionsPerWeekCount)} sessões.`
  const progress = exerciseProgression(historyQuery.data ?? [])

  // Semana do mesociclo pelo histórico. Só existe quando as sessões foram
  // lidas: sem elas a sugestão seria "semana 1" para todo mundo, e o educador
  // gravaria a sessão na semana errada sem perceber.
  const weekSuggestion =
    logsQuery.isPending || logsQuery.isError
      ? null
      : suggestedPlanWeek({ weeks: plan.weeks, sessionsPerWeek: sessionsPerWeekCount, logs })
  // Semana pelo relógio, sem limitar ao tamanho do plano: é a defasagem que
  // interessa aqui, e ela só aparece se o número puder passar do mesociclo.
  const calendarWeek = startedOn ? (completedWeeks(startedOn, new Date()) ?? 0) + 1 : null
  const weekLag = weekSuggestion && calendarWeek ? calendarWeek - weekSuggestion.week : 0

  // Só a lista de exercícios é realmente bloqueante: sem ela não há como
  // montar o formulário de registro. Logs e histórico alimentam a adesão e as
  // sugestões de carga — informação acessória.
  //
  // Antes, um erro em QUALQUER uma das três escondia a tela inteira, inclusive
  // o LogForm, apesar da mensagem prometer que só "a adesão e as sugestões"
  // tinham sido ocultadas. Como useWorkoutLogs/usePlanSetHistory não definem
  // staleTime, elas refazem a busca a cada foco/reconexão — o cenário normal
  // do 4G de academia. Ou seja: exatamente quando o educador estava com o
  // aluno na frente para registrar a série, a tela sumia.
  if (exercisesQuery.isError) {
    return (
      <div className="max-w-2xl space-y-4">
        <Link to={`/avaliados/${id}/treinos/${plan.id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← {plan.name}
        </Link>
        <QueryError
          message="Não foi possível carregar a lista de exercícios, então o registro da sessão não pode ser montado."
          onRetry={() => void exercisesQuery.refetch()}
        />
      </div>
    )
  }

  if (exercisesQuery.isPending) {
    return <p role="status" className="text-sm text-muted-foreground">Carregando execução...</p>
  }

  const historyDegraded = logsQuery.isError || historyQuery.isError
  const historyLoading = logsQuery.isPending || historyQuery.isPending

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          to={`/avaliados/${id}/treinos/${plan.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {plan.name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Execução do treino</h1>
      </div>

      {deleteMut.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {normalizeDbError(deleteMut.error)}
        </p>
      ) : null}

      {historyDegraded ? (
        <QueryError
          message="Não foi possível carregar o histórico do treino, então a adesão e as sugestões de carga estão ocultas. O registro da sessão abaixo continua funcionando normalmente."
          onRetry={() => {
            void Promise.all([logsQuery.refetch(), historyQuery.refetch()])
          }}
        />
      ) : historyLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando adesão e histórico...
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adesão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-semibold">
                {done}
                <span className="text-base font-normal text-muted-foreground">
                  {plannedToDate != null
                    ? ` de ${planned} ${planned === 1 ? 'sessão' : 'sessões'}`
                    : ` ${done === 1 ? 'sessão registrada' : 'sessões registradas'}`}
                </span>
              </span>
              {plannedToDate != null ? (
                <span className="text-sm text-muted-foreground">{Math.round(pct * 100)}%</span>
              ) : null}
            </div>
            {plannedToDate != null ? (
              <div className="h-2 rounded bg-muted">
                <div className="h-2 rounded bg-primary" style={{ width: `${(pct * 100).toFixed(0)}%` }} />
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">{adherenceCaption}</p>
            {weekSuggestion ? (
              <p className="text-xs text-muted-foreground">
                Semana do mesociclo: <strong className="font-medium text-foreground">
                  {weekSuggestion.week} de {plan.weeks}
                </strong>{' '}
                (pelas sessões registradas)
                {calendarWeek != null && startedOn
                  ? ` · ${calendarWeek}ª semana desde ${formatDate(startedOn)}`
                  : ''}
                {weekLag > 0
                  ? ` — o mesociclo está ${weekLag} ${weekLag === 1 ? 'semana' : 'semanas'} atrás do calendário.`
                  : ''}
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      <LogForm
        detail={detail}
        orgId={organization?.id ?? ''}
        subjectId={plan.subject_id}
        names={names}
        exercises={exercisesQuery.data ?? []}
        history={historyQuery.data ?? []}
        weekSuggestion={weekSuggestion}
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Sessões registradas</h2>
        {logsQuery.isError ? (
          // Nunca afirmar "nenhuma sessão" quando na verdade não foi possível
          // ler a lista: o educador acharia que o registro dele se perdeu.
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar as sessões já registradas.
          </p>
        ) : logsQuery.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">Carregando sessões...</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma sessão registrada ainda.</p>
        ) : (
          <ul className="divide-y rounded-md border bg-card">
            {logs.map((log) => (
              <LogRowItem
                key={log.id}
                log={log}
                names={names}
                aberto={openLogId === log.id}
                onAlternar={() => setOpenLogId(openLogId === log.id ? null : log.id)}
                onExcluir={() => setConfirmLogId(log.id)}
                excluindo={deleteMut.isPending}
              />
            ))}
          </ul>
        )}
      </section>

      {progress.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Progressão de carga (e1RM)</h2>
          <ul className="divide-y rounded-md border bg-card">
            {progress.map((p) => {
              const l = linePath(
                p.points.map((pt) => pt.e1rm),
                90,
                26,
                2,
                3
              )
              const delta = p.points.length >= 2 ? p.latestE1rm - p.points[0].e1rm : 0
              return (
                <li key={p.exerciseId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{names[p.exerciseId] ?? 'Exercício'}</p>
                    <p className="text-xs text-muted-foreground">
                      e1RM {roundToIncrement(p.latestE1rm).toFixed(1)} kg · melhor{' '}
                      {roundToIncrement(p.bestE1rm).toFixed(1)} kg
                      {delta !== 0 ? (
                        <span className={delta > 0 ? 'text-primary' : 'text-warning'}>
                          {' '}
                          ({delta > 0 ? '+' : ''}
                          {roundToIncrement(delta).toFixed(1)} kg)
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {p.points.length >= 2 ? (
                    <svg width={90} height={26} className="shrink-0" aria-hidden="true">
                      <polyline points={l.points} fill="none" stroke="var(--primary)" strokeWidth={1.5} />
                    </svg>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            e1RM estimado da melhor série de cada sessão (Epley). Estimativa — ver a calculadora em
            Ferramentas.
          </p>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmLogId != null}
        title="Excluir sessão registrada?"
        description="As séries registradas nesta sessão serão removidas do histórico."
        onConfirm={() => {
          if (confirmLogId) deleteMut.mutate(confirmLogId)
          setConfirmLogId(null)
        }}
        onCancel={() => setConfirmLogId(null)}
      />
    </div>
  )
}

// Uma sessão registrada. Fechada mostra quando e quem digitou; aberta mostra o
// que foi feito — carga, repetições e RIR de cada série.
//
// O educador não enxergava isso: a lista só dizia a data, então o registro do
// aluno chegava como um número na adesão, sem o conteúdo. Sem ver a série, não
// há como decidir a progressão da semana seguinte, que é o motivo de existir o
// registro.
function LogRowItem({
  log,
  names,
  aberto,
  onAlternar,
  onExcluir,
  excluindo,
}: {
  log: WorkoutLogRow
  names: Record<string, string>
  aberto: boolean
  onAlternar: () => void
  onExcluir: () => void
  excluindo: boolean
}) {
  const [editing, setEditing] = useState<{
    expectedUpdatedAt: string
    performedAt: string
    notes: string | null
    sets: EditableSessionSet[]
  } | null>(null)
  const [editOk, setEditOk] = useState(false)
  const expanded = aberto || editing != null
  const setsQuery = useWorkoutLogSets(expanded ? log.id : undefined)
  const updateMut = useUpdateWorkoutLog(log.plan_id)

  const sets: EditableSessionSet[] = (setsQuery.data ?? []).map((s) => ({
    exerciseId: s.exercise_id,
    exerciseName: names[s.exercise_id] ?? 'Exercício',
    setNumber: s.set_number,
    weightKg: s.weight_kg,
    restSeconds: s.rest_seconds,
    reps: s.reps,
    rir: s.rir,
    reachedFailure: s.reached_failure,
  }))

  async function saveEdit(value: SessionEditValues) {
    if (!editing) return
    await updateMut.mutateAsync({
      id: log.id,
      expectedUpdatedAt: editing.expectedUpdatedAt,
      performedAt: value.performedAt,
      notes: value.notes,
      sets: value.sets.map((set) => ({
        exerciseId: set.exerciseId,
        setNumber: set.setNumber,
        weightKg: set.weightKg,
        reps: set.reps,
        rir: set.rir,
        restSeconds: set.restSeconds,
        reachedFailure: set.reachedFailure,
      })),
    })
    setEditing(null)
    setEditOk(true)
  }

  return (
    <li className="text-sm">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={expanded}
          disabled={editing != null}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="min-w-0">
            {formatDate(log.performed_at)}
            {log.day_label ? (
              <span className="text-muted-foreground"> · Treino {log.day_label}</span>
            ) : null}
            {log.week_number ? (
              <span className="text-muted-foreground"> · semana {log.week_number}</span>
            ) : null}
            {/* Sensação relatada pelo aluno (0038). O tipo gerado só conhece a
                coluna depois de regenerar database.types; até lá ela chega no
                select('*') sem estar declarada. */}
            {(log as WorkoutLogRow & { feel?: number | null }).feel != null ? (
              <>
                <span className="text-muted-foreground"> · </span>
                <SessionFeel feel={(log as WorkoutLogRow & { feel?: number | null }).feel} />
              </>
            ) : null}
            {/* Quem digitou. O acesso do aluno é anônimo, então
                audit_logs.user_id fica nulo: sem esta marca ninguém distingue
                o registro dele do seu. */}
            {log.source === 'student' ? (
              <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                registrado pelo aluno
              </span>
            ) : null}
          </span>
        </button>
        <button
          onClick={onExcluir}
          disabled={excluindo || editing != null || updateMut.isPending}
          className="grid size-10 shrink-0 place-items-center rounded-md text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Excluir"
          aria-label={`Excluir sessão de ${formatDate(log.performed_at)}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {expanded ? (
        <div className="border-t bg-muted/20 px-4 py-2.5">
          {editing ? (
            <SessionEditForm
              sets={editing.sets}
              performedAt={editing.performedAt}
              notes={editing.notes}
              exerciseOptions={Object.entries(names).map(([id, name]) => ({ id, name }))}
              onSave={saveEdit}
              onCancel={() => setEditing(null)}
            />
          ) : setsQuery.isPending ? (
            <p className="text-xs text-muted-foreground">Carregando séries...</p>
          ) : setsQuery.isError ? (
            <p className="text-xs text-muted-foreground">
              Não foi possível carregar as séries desta sessão.
            </p>
          ) : (
            <>
              <SessionSets sets={sets} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={excluindo}
                onClick={() => {
                  setEditOk(false)
                  setEditing({
                    expectedUpdatedAt: log.updated_at,
                    performedAt: log.performed_at,
                    notes: log.notes,
                    sets,
                  })
                }}
              >
                Editar treino
              </Button>
            </>
          )}
          {editOk ? <p role="status" className="mt-2 text-xs text-primary">Treino atualizado!</p> : null}
          {!editing && log.notes ? (
            <p className="mt-2 border-t pt-2 text-xs italic text-muted-foreground">{log.notes}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

const KIND_LABEL: Record<ProgressionKind, string> = {
  increase_load: 'subir carga',
  add_reps: '+1 rep',
  hold: 'manter',
  reduce: 'reduzir',
  insufficient: '',
}

// A grade de séries de um exercício. Vale para o que estava prescrito e para o
// exercício avulso — as duas coisas são a mesma tabela de carga/reps/RIR, e
// mantê-las em componentes separados era garantia de divergirem.
function SetGrid({
  name,
  rows,
  repsPlaceholder,
  rirPlaceholder,
  restPlaceholder,
  onCell,
  onAddRow,
}: {
  name: string
  rows: LogRow[]
  repsPlaceholder: string
  rirPlaceholder: string
  restPlaceholder: string
  onCell: (i: number, field: keyof LogRow, value: string | boolean) => void
  onAddRow: () => void
}) {
  return (
    <div className="mt-2 max-w-md space-y-1">
      <div className="grid grid-cols-[2.5rem_repeat(4,minmax(0,1fr))] items-center gap-1.5 text-center text-[11px] text-muted-foreground sm:gap-2">
        <span />
        <span>carga (kg)</span>
        <span>reps</span>
        <span>RIR</span>
        <span>desc. (s)</span>
      </div>
      {rows.map((row, i) => (
        <SetRowFields
          key={i}
          name={name}
          index={i}
          row={row}
          repsPlaceholder={repsPlaceholder}
          rirPlaceholder={rirPlaceholder}
          restPlaceholder={restPlaceholder}
          onChange={(field, value) => onCell(i, field, value)}
        />
      ))}
      <button
        type="button"
        onClick={onAddRow}
        className="flex min-h-11 items-center gap-1 rounded-md px-2 text-xs text-primary hover:bg-primary/5 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-3" /> série
      </button>
    </div>
  )
}

// Exercício feito fora da prescrição: equipamento ocupado, dor no dia, troca
// combinada na hora. O banco sempre permitiu (workout_log_sets aponta para o
// CATÁLOGO, não para o exercício do plano — 0009), o que faltava era a tela.
// Registrar o que foi feito de verdade vale mais do que uma sessão que só
// aceita o que estava no papel: é esse histórico que sustenta a progressão de
// carga do exercício, aqui e em qualquer plano futuro.
type ExtraExercise = { rowId: string; exerciseId: string }

function LogForm({
  detail,
  orgId,
  subjectId,
  names,
  exercises,
  history,
  weekSuggestion,
}: {
  detail: WorkoutPlanDetail
  orgId: string
  subjectId: string
  names: Record<string, string>
  exercises: ExerciseRow[]
  history: SetHistoryPoint[]
  // null enquanto as sessões não foram lidas: aí o campo fica em branco, como
  // sempre esteve, em vez de sugerir um número sem base.
  weekSuggestion: PlanWeekSuggestion | null
}) {
  const planId = detail.plan?.id ?? ''
  const lastByExercise = useMemo(() => latestBestByExercise(history), [history])
  const days = useMemo(
    () => detail.days.slice().sort((a, b) => a.position - b.position),
    [detail.days]
  )
  const createMut = useCreateWorkoutLog(planId)
  const [dayKey, setDayKey] = useState(days[0]?.id ?? '')
  const [date, setDate] = useState(todayLocal())
  const [week, setWeek] = useState(() => (weekSuggestion ? String(weekSuggestion.week) : ''))
  // Enquanto o educador não mexer no campo, ele acompanha a sugestão: as
  // sessões podem chegar depois da primeira renderização, e depois de gravar
  // uma sessão a sugestão muda para a próxima. Assim que ele digita ou clica
  // em "repetir", a escolha dele manda até a próxima sessão ser gravada.
  const [weekTouched, setWeekTouched] = useState(false)
  const [notes, setNotes] = useState('')
  const [sets, setSets] = useState<Record<string, LogRow[]>>({})
  const [extras, setExtras] = useState<ExtraExercise[]>([])
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const overrides = useMemo(() => overrideIndex(detail.overrides), [detail.overrides])
  const weekNumber = week.trim() ? Number(week) : null

  const suggestedWeek = weekSuggestion?.week ?? null
  useEffect(() => {
    if (weekTouched || suggestedWeek == null) return
    setWeek(String(suggestedWeek))
  }, [suggestedWeek, weekTouched])

  // Cronômetro de descanso. Existe só aqui, e não na tela do aluno: quem fica
  // com o celular na mão entre as séries é o profissional que conduz. Guarda
  // o INSTANTE do início, não um contador — a tela pode apagar, o app pode ir
  // para segundo plano, e o tempo continua certo quando ele volta.
  const [restTimer, setRestTimer] = useState<{
    rowId: string
    index: number
    name: string
    targetSeconds: number | null
    startedAt: number
  } | null>(null)
  const [restNow, setRestNow] = useState(() => Date.now())
  useEffect(() => {
    if (!restTimer) return
    setRestNow(Date.now())
    const id = window.setInterval(() => setRestNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [restTimer])
  const restSeconds = restTimer
    ? Math.max(0, Math.floor((restNow - restTimer.startedAt) / 1000))
    : 0
  const restDone = restTimer?.targetSeconds != null && restSeconds >= restTimer.targetSeconds

  const dayExercises = useMemo(
    () => detail.exercises.filter((e) => e.day_id === dayKey).sort((a, b) => a.position - b.position),
    [detail.exercises, dayKey]
  )

  useEffect(() => {
    setSets((previous) => {
      const next = { ...previous }
      for (const ex of dayExercises) {
        const effective = effectivePrescription(ex, overrideFor(overrides, weekNumber, ex.id))
        next[ex.id] = reconcileSetRows(next[ex.id] ?? [], effective.skipped ? 0 : effective.sets)
      }
      return next
    })
  }, [dayExercises, overrides, weekNumber])

  function setCell(exRowId: string, i: number, field: keyof LogRow, val: string | boolean) {
    setSets((prev) => {
      const rows = (prev[exRowId] ?? []).slice()
      rows[i] = updateLogRow(rows[i], field, val)
      return { ...prev, [exRowId]: rows }
    })
    if (field !== 'done') return
    // Marcar a série feita é o gatilho natural do descanso: é o instante em
    // que ele começa. Desmarcar a série que está cronometrando cancela.
    if (val === true) {
      const doPlano = dayExercises.find((ex) => ex.id === exRowId)
      const alvo = doPlano
        ? effectivePrescription(doPlano, overrideFor(overrides, weekNumber, doPlano.id)).restSeconds
        : null
      setRestTimer({
        rowId: exRowId,
        index: i,
        name: nomeDaGrade(exRowId),
        targetSeconds: alvo,
        startedAt: Date.now(),
      })
    } else {
      setRestTimer((atual) => (atual?.rowId === exRowId && atual.index === i ? null : atual))
    }
  }

  function nomeDaGrade(exRowId: string): string {
    const doPlano = dayExercises.find((ex) => ex.id === exRowId)
    if (doPlano) return names[doPlano.exercise_id] ?? 'exercício'
    const avulso = extras.find((x) => x.rowId === exRowId)
    return (avulso ? names[avulso.exerciseId] : null) ?? 'exercício'
  }

  // Grava o tempo medido no descanso da série que o iniciou e encerra a
  // contagem. É um toque só, no momento em que o aluno volta ao aparelho — e
  // é por isso que o número gravado é descanso de verdade, e não o intervalo
  // entre duas séries concluídas (que inclui a execução da segunda).
  function registrarDescanso() {
    if (!restTimer) return
    setCell(restTimer.rowId, restTimer.index, 'rest', String(Math.min(3600, restSeconds)))
    setRestTimer(null)
  }
  function addRow(exRowId: string) {
    setSets((prev) => ({ ...prev, [exRowId]: [...(prev[exRowId] ?? []), { weight: '', reps: '', rir: '', rest: '', failure: false }] }))
  }

  // A chave das linhas é o rowId, e não o exercício: o mesmo exercício pode ser
  // adicionado de novo numa sessão futura sem herdar as linhas da anterior.
  function addExtra(exerciseId: string) {
    const rowId = `extra:${crypto.randomUUID()}`
    setExtras((prev) => [...prev, { rowId, exerciseId }])
    setSets((prev) => ({
      ...prev,
      [rowId]: Array.from({ length: 3 }, () => ({ weight: '', reps: '', rir: '', rest: '', failure: false })),
    }))
  }

  function removeExtra(rowId: string) {
    setExtras((prev) => prev.filter((x) => x.rowId !== rowId))
    setSets((prev) => {
      const next = { ...prev }
      delete next[rowId]
      return next
    })
  }

  // Fora da lista o mesmo exercício duas vezes na sessão: o planejado e o
  // avulso disputariam a numeração das séries e o educador veria dois cartões
  // do mesmo movimento.
  const usedExerciseIds = useMemo(
    () => new Set([...dayExercises.map((e) => e.exercise_id), ...extras.map((x) => x.exerciseId)]),
    [dayExercises, extras]
  )

  const day = days.find((d) => d.id === dayKey)

  async function save() {
    if (savingRef.current) return
    setError(null)
    setOkMsg(false)
    if (!orgId) return setError('Organização não carregada.')

    const flat: Omit<NewLogSet, 'setNumber'>[] = []
    const fontes = [
      ...dayExercises.map((ex) => ({ rowId: ex.id, exerciseId: ex.exercise_id })),
      ...extras,
    ]
    const rowError = validateLogRows(Object.fromEntries(
      fontes.map((ex) => [ex.rowId, sets[ex.rowId] ?? []])
    ))
    if (rowError) return setError(rowError)
    for (const ex of fontes) {
      for (const row of sets[ex.rowId] ?? []) {
        const w = row.weight.trim() === '' ? null : Number(row.weight)
        const r = row.reps.trim() === '' ? null : Number(row.reps)
        const rir = row.rir.trim() === '' ? null : Number(row.rir)
        const restSeconds = row.rest?.trim() ? Number(row.rest) : null
        if (w == null && r == null) continue
        flat.push({ exerciseId: ex.exerciseId, weightKg: w, reps: r, rir, restSeconds, reachedFailure: row.failure ?? null })
      }
    }
    if (flat.length === 0) return setError('Registre ao menos uma série com carga ou repetições.')

    // numera as séries por exercício (a unique é por log+exercício+set_number)
    const counter = new Map<string, number>()
    const finalSets: NewLogSet[] = flat.map((s) => {
      const n = (counter.get(s.exerciseId) ?? 0) + 1
      counter.set(s.exerciseId, n)
      return { ...s, setNumber: n }
    })

    savingRef.current = true
    setSaving(true)
    try {
      await createMut.mutateAsync({
        orgId,
        subjectId,
        planId,
        dayLabel: day?.label ?? null,
        weekNumber: week.trim() ? Number(week) : null,
        performedAt: date,
        notes: notes.trim() || null,
        sets: finalSets,
      })
      // limpa pra registrar a próxima
      const init: Record<string, LogRow[]> = {}
      for (const ex of dayExercises) {
        const effective = effectivePrescription(ex, overrideFor(overrides, weekNumber, ex.id))
        init[ex.id] = reconcileSetRows([], effective.skipped ? 0 : effective.sets)
      }
      // Os avulsos pertencem à sessão que acabou de ser gravada: a próxima
      // começa de novo com o que está prescrito.
      setSets((previous) => {
        const next = { ...previous, ...init }
        for (const x of extras) delete next[x.rowId]
        return next
      })
      setExtras([])
      setNotes('')
      setRestTimer(null)
      // A sessão gravada muda a sugestão (pode ter fechado a semana): o campo
      // volta a segui-la para a próxima.
      setWeekTouched(false)
      setOkMsg(true)
    } catch (e) {
      setError(normalizeDbError(e))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (days.length === 0) {
    return <p className="text-sm text-muted-foreground">Este plano ainda não tem divisões.</p>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Registrar treino</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <fieldset disabled={saving || createMut.isPending} className="min-w-0 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="workout-day" className="text-xs">Divisão</Label>
            <select id="workout-day" className={controlClass} value={dayKey} onChange={(e) => setDayKey(e.target.value)}>
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                  {d.name ? ` — ${d.name}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workout-date" className="text-xs">Data</Label>
            <Input id="workout-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workout-week" className="text-xs">Semana</Label>
            <Input
              id="workout-week"
              type="number"
              min={1}
              max={planWeeks(detail)}
              placeholder="—"
              value={week}
              onChange={(e) => {
                setWeekTouched(true)
                setWeek(e.target.value)
              }}
            />
          </div>
        </div>

        {/* A semana gravada aqui escolhe o override que a tela aplica e segue
            para o histórico e para o PDF: ela precisa dizer de onde veio e
            poder ser recusada em um clique. "Fechou a semana" e "vou repetir a
            semana" são indistinguíveis para qualquer heurística — essa parte é
            do educador. */}
        {weekSuggestion ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{weekHint(weekSuggestion)}</span>
            {week !== String(weekSuggestion.week) ? (
              <button
                type="button"
                className="rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setWeekTouched(true)
                  setWeek(String(weekSuggestion.week))
                }}
              >
                Usar a semana {weekSuggestion.week}
              </button>
            ) : weekSuggestion.basis === 'advance' && weekSuggestion.lastLoggedWeek != null ? (
              <button
                type="button"
                className="rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setWeekTouched(true)
                  setWeek(String(weekSuggestion.lastLoggedWeek))
                }}
              >
                Repetir a semana {weekSuggestion.lastLoggedWeek}
              </button>
            ) : null}
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Descanso: informe quantos segundos descansou após cada série. O preenchimento é opcional.
          {' '}Marque Falha quando não conseguiu completar outra repetição. RIR 0, sozinho, não marca falha.
        </p>
        <div className="space-y-3">
          {/* Super-série e circuito mudam o que se faz ENTRE uma série e outra:
              a tela que conduz a sessão não pode listar os exercícios soltos. */}
          {toRowBlocks(dayExercises).map((block) => {
            const cartoes = block.items.map((ex) => {
              const effective = effectivePrescription(ex, overrideFor(overrides, weekNumber, ex.id))
              return (
            <div key={ex.id} className="rounded-md border bg-muted/20 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {names[ex.exercise_id] ?? 'Exercício'}
                  {techniqueLabel(ex.technique) ? (
                    <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {techniqueLabel(ex.technique)}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  plano: {formatSetsReps(effective.sets, effective.reps)}
                  {effective.rir != null ? ` · RIR ${effective.rir}` : ''}
                </span>
              </div>
              {effective.skipped ? (
                <p className="mt-1 text-xs text-muted-foreground">Nesta semana, não executar. Registre séries somente se o exercício foi realizado.</p>
              ) : null}
              {effective.notes ? <p className="mt-1 text-xs text-muted-foreground">{effective.notes}</p> : null}
              {(() => {
                if (effective.skipped) return null
                const last = lastByExercise.get(ex.exercise_id)
                if (!last) return null
                const s = suggestProgression({
                  last,
                  repRange: parseRepRange(effective.reps),
                  targetRir: effective.rir,
                })
                if (s.kind === 'insufficient') return null
                return (
                  <p className="mt-1 text-xs text-primary" title={s.reason}>
                    última {last.weightKg}×{last.reps}
                    {last.rir != null ? ` (RIR ${last.rir})` : ''} → sugestão{' '}
                    {s.suggestedWeightKg != null
                      ? `${roundToIncrement(s.suggestedWeightKg).toFixed(1)} kg`
                      : ''}
                    {s.suggestedReps != null ? ` × ${s.suggestedReps}` : ''} · {KIND_LABEL[s.kind]}
                  </p>
                )
              })()}
              <SetGrid
                name={names[ex.exercise_id] ?? 'exercício'}
                rows={sets[ex.id] ?? []}
                repsPlaceholder={effective.reps ?? '—'}
                rirPlaceholder={effective.rir != null ? String(effective.rir) : '—'}
                restPlaceholder={String(effective.restSeconds ?? '—')}
                onCell={(i, field, value) => setCell(ex.id, i, field, value)}
                onAddRow={() => addRow(ex.id)}
              />
            </div>
              )
            })
            return block.kind == null ? (
              cartoes
            ) : (
              <GroupBlock key={block.key} kind={block.kind} size={block.items.length}>
                {cartoes}
              </GroupBlock>
            )
          })}

          {extras.map((extra) => {
            const nome = names[extra.exerciseId] ?? 'Exercício'
            const last = lastByExercise.get(extra.exerciseId)
            return (
              <div key={extra.rowId} className="rounded-md border border-dashed bg-muted/20 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {nome}
                    <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      fora do plano
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeExtra(extra.rowId)}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remover ${nome} da sessão`}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                {last ? (
                  <p className="mt-1 text-xs text-primary">
                    última {last.weightKg}×{last.reps}
                    {last.rir != null ? ` (RIR ${last.rir})` : ''}
                  </p>
                ) : null}
                <SetGrid
                  name={nome}
                  rows={sets[extra.rowId] ?? []}
                  repsPlaceholder="—"
                  rirPlaceholder="—"
                  restPlaceholder="—"
                  onCell={(i, field, value) => setCell(extra.rowId, i, field, value)}
                  onAddRow={() => addRow(extra.rowId)}
                />
              </div>
            )
          })}
        </div>

        {/* Substituição de última hora (equipamento ocupado, dor no dia) deixa
            de virar série perdida ou linha digitada no exercício errado. */}
        <div className="space-y-1.5 rounded-md border border-dashed p-2">
          <p className="text-xs text-muted-foreground">
            Fez algo diferente do prescrito? Registre o exercício que foi feito de verdade — ele
            entra no histórico de carga do aluno.
          </p>
          <ExercisePicker
            exercises={exercises}
            orgId={orgId}
            excludedExerciseIds={usedExerciseIds}
            onPick={addExtra}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="workout-notes" className="text-xs">Observações (opcional)</Label>
          <textarea
            id="workout-notes"
            rows={2}
            className={controlClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {okMsg ? <p role="status" className="text-sm text-primary">Treino registrado!</p> : null}

        <Button size="sm" onClick={save} disabled={createMut.isPending}>
          {createMut.isPending ? 'Salvando...' : 'Registrar treino'}
        </Button>
        </fieldset>

        {/* Fora do fieldset: o cronômetro não pode congelar enquanto a sessão
            anterior está sendo gravada — o aluno já está descansando.
            Fixo na tela, e não no fim do formulário: durante a sessão o
            educador está no meio da lista de exercícios, e um cronômetro que
            só aparece rolando até o rodapé não serve para nada. Fica acima da
            barra de navegação do celular (que é `fixed bottom-0`). */}
        {restTimer ? (
          <div
            className={`fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-2xl items-center gap-2 rounded-xl border px-3 py-2 shadow-lg backdrop-blur sm:gap-3 lg:bottom-4 ${
              restDone ? 'border-success bg-success/15' : 'border-border bg-background/95'
            }`}
          >
            <span
              className={`shrink-0 text-xl font-semibold tabular-nums ${restDone ? 'text-success' : ''}`}
              role="timer"
              aria-live="off"
            >
              {formatRest(restSeconds)}
            </span>
            <span className="min-w-0 flex-1 text-xs leading-tight text-muted-foreground">
              <span className="block truncate">
                descanso · série {restTimer.index + 1} de {restTimer.name}
              </span>
              {restTimer.targetSeconds != null ? (
                <span className={`block ${restDone ? 'font-medium text-success' : ''}`}>
                  {restDone
                    ? `alvo de ${restTimer.targetSeconds}s cumprido`
                    : `alvo ${restTimer.targetSeconds}s`}
                </span>
              ) : null}
            </span>
            <Button
              size="sm"
              className="shrink-0"
              variant={restDone ? 'default' : 'outline'}
              onClick={registrarDescanso}
            >
              Começou a série
            </Button>
            <button
              type="button"
              onClick={() => setRestTimer(null)}
              aria-label="Descartar o cronômetro sem registrar o descanso"
              className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

// mm:ss a partir dos segundos corridos. Passa de 60 minutos? O treinador tem
// problema maior que a formatação.
function formatRest(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function planWeeks(detail: WorkoutPlanDetail): number {
  return detail.plan?.weeks ?? 52
}

// Explica o número que está no campo Semana. Frases separadas da tela do
// aluno de propósito: mesma regra (suggestedPlanWeek), públicos diferentes.
function weekHint(s: PlanWeekSuggestion): string {
  const feitas =
    `${s.sessionsInCurrentPass} de ${s.sessionsPerWeek} ` +
    `${s.sessionsPerWeek === 1 ? 'sessão' : 'sessões'}`
  switch (s.basis) {
    case 'first':
      return 'Primeira sessão registrada neste plano: começa na semana 1.'
    case 'continue':
      return s.sessionsPerWeek > 0
        ? `Semana ${s.lastLoggedWeek} em andamento (${feitas}).`
        : `Continuando na semana ${s.lastLoggedWeek}, a do último treino.`
    case 'advance':
      return `A semana ${s.lastLoggedWeek} fechou (${feitas}) — sugerindo a próxima.`
    case 'end':
      return `A semana ${s.lastLoggedWeek} era a última do mesociclo e já fechou (${feitas}).`
  }
}
