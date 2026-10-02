import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Trash2, Plus, X, ChevronDown, ChevronRight, ChevronUp, GripVertical } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import {
  useCreateWorkoutLog,
  useDeleteWorkoutLog,
  useExercises,
  usePlanSetHistory,
  useSaveTrainerSession,
  useWorkoutLogs,
  useWorkoutLogSets,
  useWorkoutPlan,
  useUpdateWorkoutLog,
} from '../features/workout/hooks'
import type { ExerciseRow, NewLogSet, SetHistoryPoint, WorkoutPlanDetail } from '../features/workout/api'
import {
  adherencePct,
  closedWeeksCutoff,
  completedWeeks,
  effectivePlanStart,
  exerciseProgression,
  isCompletedLog,
  plannedSessions,
  plannedSessionsToDate,
  sessionsInClosedWeeks,
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
import { RecordMismatch } from '../components/RecordMismatch'
import { UnsavedBadge } from '../components/UnsavedChanges'

import { controlClass } from '@/lib/ui'
import { normalizeDbError } from '../lib/errors'
import { useFormDraft } from '../lib/draft'
import { useUnsavedChanges } from '../lib/unsavedChanges'
import { useClock } from '../lib/useClock'
import { updateLogRow, validateLogRows, type LogRow } from '../features/workout/logRows'
import { reconcileSetRows } from '../features/workout/logRows'
import {
  RESTORE_TIMER_MAX_MS,
  execucaoContentKey,
  execucaoHasContent,
  isExecucaoDraft,
  reconcileExecucaoDraft,
  sessionToForm,
  type ExecucaoContinuing,
  type ExecucaoDraft,
  type ExecucaoRestTimer,
} from '../features/workout/execucaoDraft'
import { listWorkoutLogSets } from '../features/workout/api'
import { moveRow, orderSessionRows } from '../features/workout/sessionOrder'
import { SessionSets } from '../features/workout/SessionSets'
import { SetRowFields } from '../features/workout/SetRowFields'
import { RestTimerBar } from '../features/workout/RestTimerBar'
import { SessionEditForm, type EditableSessionSet, type SessionEditValues } from '../features/workout/SessionEditForm'
import type { WorkoutLogRow } from '../features/workout/api'

function dateIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Semana digitada: vazio é "sem semana"; o resto precisa ser inteiro dentro do
// mesociclo. O campo tem min/max no HTML, mas não há envio de formulário para
// o navegador aplicar: "80" era gravado e "2.5" voltava como erro cru do banco.
function parseWeekInput(text: string, max: number): number | null | 'invalid' {
  const t = text.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isInteger(n) && n >= 1 && n <= max ? n : 'invalid'
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
  const now = useClock()

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
  if (id && plan.subject_id !== id) {
    return <RecordMismatch what="Este plano" backTo={`/avaliados/${id}`} />
  }
  const logs = logsQuery.data ?? []
  const sessionsPerWeekCount = sessionsPerWeek(plan.weekly_schedule, detail.days.length)
  // Sessão que o aluno salvou para continuar depois e não concluiu (0039) não
  // é treino feito: fica fora da adesão e da semana do mesociclo.
  const completos = logs.filter(isCompletedLog)
  const emAndamento = logs.length - completos.length
  // Início efetivo: a data informada, a primeira sessão registrada ou, em
  // último caso, a criação do plano. Plano entregue em janeiro e começado em
  // março não pode ser cobrado desde janeiro.
  const firstSessionOn = logs.length > 0 ? logs[logs.length - 1].performed_at : null
  const startedOn = effectivePlanStart(plan.starts_on, firstSessionOn, plan.created_at)
  // Cobra apenas as semanas já fechadas: quem está em dia na semana 2 de um
  // plano de 8 não pode aparecer com 25%. E conta só as sessões DESSAS semanas:
  // as da semana em curso escondiam uma semana inteira de falta.
  const plannedToDate = plannedSessionsToDate(plan.weeks, sessionsPerWeekCount, startedOn, now)
  const cutoff = closedWeeksCutoff(startedOn, plan.weeks, now)
  const doneToDate = sessionsInClosedWeeks(completos.map((l) => l.performed_at), cutoff)
  const foraDaConta = completos.length - doneToDate
  const mesocicloEncerrado = (completedWeeks(startedOn, now) ?? 0) >= plan.weeks
  const planned = plannedToDate ?? 0
  const pct = plannedToDate != null ? adherencePct(doneToDate, plannedToDate) : 0
  const notaEmAndamento =
    emAndamento > 0
      ? ` ${emAndamento} ${emAndamento === 1 ? 'sessão não concluída pelo aluno fica' : 'sessões não concluídas pelo aluno ficam'} fora da conta.`
      : ''
  const adherenceCaption =
    plannedToDate != null
      ? `Cobrado até aqui: ${plannedToDate} ${plannedToDate === 1 ? 'sessão' : 'sessões'} (semanas já concluídas). ` +
        (foraDaConta > 0
          ? mesocicloEncerrado
            ? `${foraDaConta} ${foraDaConta === 1 ? 'sessão feita depois do fim do mesociclo não entra' : 'sessões feitas depois do fim do mesociclo não entram'} na adesão. `
            : `${foraDaConta} ${foraDaConta === 1 ? 'sessão da semana em curso entra' : 'sessões da semana em curso entram'} quando ela fechar. `
          : '') +
        `Plano completo = ${plan.weeks} ${plan.weeks === 1 ? 'semana' : 'semanas'} × ${sessionsPerWeekCount} ` +
        `${sessionsPerWeekCount === 1 ? 'sessão' : 'sessões'} por semana.` +
        notaEmAndamento
      : `Primeira semana em andamento — a adesão passa a ser calculada quando ela fechar. ` +
        `Plano completo = ${plannedSessions(plan.weeks, sessionsPerWeekCount)} sessões.` +
        notaEmAndamento
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
  const calendarWeek = startedOn ? (completedWeeks(startedOn, now) ?? 0) + 1 : null
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
                {plannedToDate != null ? doneToDate : completos.length}
                <span className="text-base font-normal text-muted-foreground">
                  {plannedToDate != null
                    ? ` de ${planned} ${planned === 1 ? 'sessão' : 'sessões'}`
                    : ` ${completos.length === 1 ? 'sessão registrada' : 'sessões registradas'}`}
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
        pendingSession={
          logs.find((log) => log.in_progress === true && log.source === 'trainer') ?? null
        }
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
            {/* Sensação relatada pelo aluno (0038). */}
            {log.feel != null ? (
              <>
                <span className="text-muted-foreground"> · </span>
                <SessionFeel feel={log.feel} />
              </>
            ) : null}
            {/* O aluno salvou para continuar depois e não concluiu (0039): o
                registro existe, mas não conta na adesão nem fecha a semana. */}
            {log.in_progress === true ? (
              <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                não concluído
              </span>
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
  pendingSession,
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
  // a sessão mais recente do profissional salva para continuar depois (0041)
  pendingSession: WorkoutLogRow | null
}) {
  const planId = detail.plan?.id ?? ''
  const lastByExercise = useMemo(() => latestBestByExercise(history), [history])
  const days = useMemo(
    () => detail.days.slice().sort((a, b) => a.position - b.position),
    [detail.days]
  )
  const createMut = useCreateWorkoutLog(planId)
  const totalWeeks = planWeeks(detail)
  const today = dateIso(useClock())
  const [dayKey, setDayKey] = useState(days[0]?.id ?? '')
  const [date, setDate] = useState(today)
  // A data acompanha o dia de hoje até o educador escolher outra. Antes ela
  // ficava presa no dia em que a tela abriu: a aba deixada aberta de um dia
  // para o outro registrava a sessão com a data de ontem.
  const [dateTouched, setDateTouched] = useState(false)
  const [week, setWeek] = useState(() => (weekSuggestion ? String(weekSuggestion.week) : ''))
  // Enquanto o educador não mexer no campo, ele acompanha a sugestão: as
  // sessões podem chegar depois da primeira renderização, e depois de gravar
  // uma sessão a sugestão muda para a próxima. Assim que ele digita ou clica
  // em "repetir", a escolha dele manda até a próxima sessão ser gravada.
  const [weekTouched, setWeekTouched] = useState(false)
  const [notes, setNotes] = useState('')
  const [sets, setSets] = useState<Record<string, LogRow[]>>({})
  const [extras, setExtras] = useState<ExtraExercise[]>([])
  // Ordem desta sessão e exercícios do plano que hoje não vão ser feitos
  // (sessionOrder.ts). O plano não muda; a próxima sessão começa como ele diz.
  const [order, setOrder] = useState<string[]>([])
  const [skipped, setSkipped] = useState<string[]>([])
  const [dragging, setDragging] = useState<string | null>(null)
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

  useEffect(() => {
    if (!dateTouched && date !== today) setDate(today)
  }, [date, dateTouched, today])

  // Cronômetro de descanso. Existe só aqui, e não na tela do aluno: quem fica
  // com o celular na mão entre as séries é o profissional que conduz. Guarda
  // o INSTANTE do início, não um contador — a tela pode apagar, o app pode ir
  // para segundo plano, e o tempo continua certo quando ele volta. A contagem
  // na tela mora em RestTimerBar: o tique de cada segundo re-renderizava o
  // formulário inteiro, com todas as séries, enquanto o educador digitava.
  const [restTimer, setRestTimer] = useState<ExecucaoRestTimer | null>(null)
  const [restored, setRestored] = useState<{ lostRows: number } | null>(null)
  // Sessão salva no servidor com "Salvar e continuar depois" que esta tela
  // está continuando, e o conteúdo dela no último salvamento (para saber se há
  // o que perder ao sair).
  const saveSessionMut = useSaveTrainerSession(planId)
  const [continuing, setContinuing] = useState<ExecucaoContinuing | null>(null)
  const [serverKey, setServerKey] = useState<string | null>(null)
  const [progressMsg, setProgressMsg] = useState<string | null>(null)
  const [loadingPending, setLoadingPending] = useState(false)
  const syncKeyAfterLoad = useRef(false)

  const dayExercises = useMemo(
    () => detail.exercises.filter((e) => e.day_id === dayKey).sort((a, b) => a.position - b.position),
    [detail.exercises, dayKey]
  )
  const day = days.find((d) => d.id === dayKey)

  // O que será registrado: as linhas da divisão escolhida e dos avulsos.
  const fontes = useMemo(
    () => [
      ...dayExercises.map((ex) => ({ rowId: ex.id, exerciseId: ex.exercise_id })),
      ...extras,
    ],
    [dayExercises, extras]
  )
  // O que está na sessão, na ordem em que vai ser feito: é o que aparece na
  // tela e o que é registrado.
  const sessao = useMemo(() => orderSessionRows(fontes, order, skipped), [fontes, order, skipped])

  // Rascunho no aparelho (ver features/workout/execucaoDraft.ts).
  const draftValue = useMemo<ExecucaoDraft>(() => {
    const visiveis: Record<string, LogRow[]> = {}
    const rowExercises: Record<string, string> = {}
    for (const ex of dayExercises) rowExercises[ex.id] = ex.exercise_id
    for (const fonte of fontes) {
      if (sets[fonte.rowId]) visiveis[fonte.rowId] = sets[fonte.rowId]
    }
    return {
      version: 1,
      dayKey,
      dayLabel: day?.label ?? null,
      date,
      week,
      weekTouched,
      notes,
      sets: visiveis,
      rowExercises,
      extras,
      restTimer,
      continuing,
      order,
      skipped,
    }
  }, [dayExercises, fontes, sets, dayKey, day, date, week, weekTouched, notes, extras, restTimer, continuing, order, skipped])
  const contentKey = execucaoContentKey(draftValue)
  // Tem o que perder: conteúdo que ainda não foi salvo no servidor como está.
  const dirty = execucaoHasContent(draftValue) && contentKey !== serverKey

  // Depois de carregar uma sessão do servidor, o que está na tela É o que está
  // salvo: a chave é tirada já com o estado aplicado.
  useEffect(() => {
    if (!syncKeyAfterLoad.current) return
    syncKeyAfterLoad.current = false
    setServerKey(contentKey)
  }, [contentKey])

  function restaurarRascunho(value: ExecucaoDraft) {
    if (!isExecucaoDraft(value)) return
    const { draft, lostRows } = reconcileExecucaoDraft(value, detail)
    // Depois de registrar, o rascunho gravado é a sessão vazia seguinte: não
    // há o que restaurar, e a data dele não pode prender a tela num dia antigo.
    if (!execucaoHasContent(draft) && lostRows === 0) return
    setDayKey(draft.dayKey)
    setDate(draft.date)
    setDateTouched(true)
    setWeek(draft.week)
    setWeekTouched(draft.weekTouched)
    setNotes(draft.notes)
    setSets((previous) => ({ ...previous, ...draft.sets }))
    setExtras(draft.extras)
    setRestTimer(
      draft.restTimer && Date.now() - draft.restTimer.startedAt < RESTORE_TIMER_MAX_MS
        ? draft.restTimer
        : null
    )
    setContinuing(draft.continuing ?? null)
    setOrder(draft.order ?? [])
    setSkipped(draft.skipped ?? [])
    setRestored({ lostRows })
  }
  useFormDraft<ExecucaoDraft>(planId ? `execucao:${planId}` : null, draftValue, restaurarRascunho)
  // Sair pela navegação do app, recarregar ou tocar em "Atualizar" no aviso de
  // versão nova pergunta antes, com a opção de salvar no servidor e sair; o
  // rascunho continua no aparelho de todo jeito.
  const guard = useUnsavedChanges(dirty)

  // Continuar a sessão salva para depois: traz as séries do servidor para a
  // tela, na divisão, semana e data em que ela foi feita.
  async function continuarSessao(session: WorkoutLogRow) {
    setError(null)
    setLoadingPending(true)
    try {
      const salvas = await listWorkoutLogSets(session.id)
      const form = sessionToForm(session, salvas, detail)
      if (form.dayKey) setDayKey(form.dayKey)
      setSets((previous) => ({ ...previous, ...form.sets }))
      setExtras(form.extras)
      // A ordem não vai para o servidor: a sessão retomada volta na do plano.
      setOrder([])
      setSkipped([])
      setWeek(session.week_number != null ? String(session.week_number) : '')
      setWeekTouched(true)
      setDate(session.performed_at)
      setDateTouched(true)
      setNotes(session.notes ?? '')
      setRestTimer(null)
      setRestored(null)
      setContinuing({ logId: session.id, updatedAt: session.updated_at, savedAt: session.updated_at })
      syncKeyAfterLoad.current = true
    } catch (e) {
      setError(normalizeDbError(e))
    } finally {
      setLoadingPending(false)
    }
  }
  const sessaoParaContinuar =
    pendingSession && pendingSession.id !== continuing?.logId && !dirty ? pendingSession : null

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
  //
  // Só grava numa série que ainda está na tela: se o exercício saiu da sessão
  // (avulso removido, divisão trocada), o descanso ia parar numa linha
  // escondida, que nunca seria registrada.
  function registrarDescanso() {
    if (!restTimer) return
    const visivel = sessao.some((f) => f.rowId === restTimer.rowId)
      && (sets[restTimer.rowId]?.length ?? 0) > restTimer.index
    if (visivel) {
      const segundos = Math.floor((Date.now() - restTimer.startedAt) / 1000)
      setCell(restTimer.rowId, restTimer.index, 'rest', String(Math.max(0, Math.min(3600, segundos))))
    }
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
    setOrder((prev) => prev.filter((id) => id !== rowId))
    // o cronômetro de uma série que saiu da sessão não tem onde gravar
    setRestTimer((atual) => (atual?.rowId === rowId ? null : atual))
  }

  // Exercício do plano que hoje não vai ser feito sai da tela e do registro.
  // As séries ficam guardadas: "Voltar" traz o cartão como estava.
  function skipPlanned(rowId: string) {
    setSkipped((prev) => (prev.includes(rowId) ? prev : [...prev, rowId]))
    setRestTimer((atual) => (atual?.rowId === rowId ? null : atual))
  }
  function unskipPlanned(rowId: string) {
    setSkipped((prev) => prev.filter((id) => id !== rowId))
  }

  // Reordenar grava a ordem inteira que está na tela: dali em diante ela
  // manda, e o avulso adicionado depois entra no fim.
  function moveSessionRow(rowId: string, to: number) {
    const ids = sessao.map((f) => f.rowId)
    const from = ids.indexOf(rowId)
    if (from < 0 || to < 0 || to >= ids.length || from === to) return
    setOrder(moveRow(ids, from, to))
  }

  // Arrastar pelo puxador, com o dedo ou o mouse. Pointer events, e não o
  // drag-and-drop do HTML: esse não existe no toque, e a Execução é usada no
  // celular. Os ouvintes ficam na janela porque o cartão pode ser remontado
  // no meio do gesto (ao entrar ou sair de um bloco de super-série), e com ele
  // iria embora a captura do ponteiro.
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao
  useEffect(() => {
    if (!dragging) return
    const rowId = dragging
    function onMove(e: PointerEvent) {
      // Perto da borda, rola a página: a lista não cabe na tela do celular, e
      // o rodapé tem a barra de navegação e o cronômetro por cima.
      if (e.clientY < 80) window.scrollBy(0, -12)
      else if (e.clientY > window.innerHeight - 160) window.scrollBy(0, 12)
      const alvo = document.elementFromPoint?.(e.clientX, e.clientY)
        ?.closest<HTMLElement>('[data-session-row]')
      const alvoId = alvo?.dataset.sessionRow
      if (!alvo || !alvoId || alvoId === rowId) return
      const ids = sessaoRef.current.map((f) => f.rowId)
      const from = ids.indexOf(rowId)
      const to = ids.indexOf(alvoId)
      if (from < 0 || to < 0) return
      // Só troca depois de passar do meio do cartão-alvo. Sem isso, um cartão
      // baixo arrastado sobre um alto trocaria de lugar e voltaria em seguida.
      const caixa = alvo.getBoundingClientRect()
      const meio = caixa.top + caixa.height / 2
      if (to > from ? e.clientY < meio : e.clientY > meio) return
      setOrder(moveRow(ids, from, to))
    }
    function onEnd() {
      setDragging(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
  }, [dragging])

  // Fora da lista o mesmo exercício duas vezes na sessão: o planejado e o
  // avulso disputariam a numeração das séries e o educador veria dois cartões
  // do mesmo movimento.
  const usedExerciseIds = useMemo(
    () => new Set([...dayExercises.map((e) => e.exercise_id), ...extras.map((x) => x.exerciseId)]),
    [dayExercises, extras]
  )

  // Validação e montagem comuns a registrar e a salvar para continuar depois.
  // Devolve null (e mostra o motivo) quando não há o que gravar.
  function montarSessao(): { weekValue: number | null; finalSets: NewLogSet[] } | null {
    if (!orgId) {
      setError('Organização não carregada.')
      return null
    }
    const weekValue = parseWeekInput(week, totalWeeks)
    if (weekValue === 'invalid') {
      setError(`Informe a semana com um número inteiro de 1 a ${totalWeeks}, ou deixe em branco.`)
      return null
    }

    const flat: Omit<NewLogSet, 'setNumber'>[] = []
    const rowError = validateLogRows(Object.fromEntries(
      sessao.map((ex) => [ex.rowId, sets[ex.rowId] ?? []])
    ))
    if (rowError) {
      setError(rowError)
      return null
    }
    for (const ex of sessao) {
      for (const row of sets[ex.rowId] ?? []) {
        const w = row.weight.trim() === '' ? null : Number(row.weight)
        const r = row.reps.trim() === '' ? null : Number(row.reps)
        const rir = row.rir.trim() === '' ? null : Number(row.rir)
        const restSeconds = row.rest?.trim() ? Number(row.rest) : null
        if (w == null && r == null) continue
        flat.push({ exerciseId: ex.exerciseId, weightKg: w, reps: r, rir, restSeconds, reachedFailure: row.failure ?? null })
      }
    }
    if (flat.length === 0) {
      setError('Registre ao menos uma série com carga ou repetições.')
      return null
    }

    // numera as séries por exercício (a unique é por log+exercício+set_number)
    const counter = new Map<string, number>()
    const finalSets: NewLogSet[] = flat.map((s) => {
      const n = (counter.get(s.exerciseId) ?? 0) + 1
      counter.set(s.exerciseId, n)
      return { ...s, setNumber: n }
    })
    return { weekValue, finalSets }
  }

  // "Salvar e continuar depois": grava no servidor como sessão em andamento
  // (0041), que não conta na adesão nem fecha a semana, e pode ser continuada
  // de qualquer aparelho. Devolve se deu certo, para o "Salvar e sair".
  async function salvarProgresso(): Promise<boolean> {
    if (savingRef.current) return false
    setError(null)
    setOkMsg(false)
    setProgressMsg(null)
    const sessao = montarSessao()
    if (!sessao) return false
    const chave = execucaoContentKey(draftValue)
    savingRef.current = true
    setSaving(true)
    try {
      const salvo = await saveSessionMut.mutateAsync({
        planId,
        logId: continuing?.logId ?? null,
        expectedUpdatedAt: continuing?.updatedAt ?? null,
        inProgress: true,
        dayLabel: day?.label ?? null,
        weekNumber: sessao.weekValue,
        performedAt: date,
        notes: notes.trim() || null,
        sets: sessao.finalSets,
      })
      const agora = new Date()
      setContinuing({ logId: salvo.id, updatedAt: salvo.updated_at, savedAt: agora.toISOString() })
      setServerKey(chave)
      setProgressMsg(
        `Progresso salvo às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. ` +
          'Dá para continuar depois, neste ou em outro aparelho; o treino só conta como feito ao registrar.'
      )
      return true
    } catch (e) {
      setError(normalizeDbError(e))
      return false
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function save() {
    if (savingRef.current) return
    setError(null)
    setOkMsg(false)
    setProgressMsg(null)
    const sessao = montarSessao()
    if (!sessao) return
    const { weekValue, finalSets } = sessao

    savingRef.current = true
    setSaving(true)
    try {
      if (continuing) {
        // Conclui a MESMA sessão que estava salva em andamento, em vez de
        // criar outra e deixar a parcial sobrando.
        await saveSessionMut.mutateAsync({
          planId,
          logId: continuing.logId,
          expectedUpdatedAt: continuing.updatedAt,
          inProgress: false,
          dayLabel: day?.label ?? null,
          weekNumber: weekValue,
          performedAt: date,
          notes: notes.trim() || null,
          sets: finalSets,
        })
      } else {
        await createMut.mutateAsync({
          orgId,
          subjectId,
          planId,
          dayLabel: day?.label ?? null,
          weekNumber: weekValue,
          performedAt: date,
          notes: notes.trim() || null,
          sets: finalSets,
        })
      }
      setContinuing(null)
      setServerKey(null)
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
      setOrder([])
      setSkipped([])
      setNotes('')
      setRestTimer(null)
      setRestored(null)
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

  const planoPorRow = new Map(dayExercises.map((ex) => [ex.id, ex]))
  const skippedVisiveis = dayExercises.filter((ex) => skipped.includes(ex.id))
  const podeReordenar = sessao.length > 1

  // Um passo para cima ou para baixo, devolvendo o foco ao controle usado: o
  // cartão pode ser remontado ao entrar ou sair de um bloco.
  function moverUmPasso(rowId: string, delta: -1 | 1, foco: string) {
    const i = sessao.findIndex((f) => f.rowId === rowId)
    moveSessionRow(rowId, i + delta)
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(foco)?.focus()
    })
  }

  // Moldura comum aos cartões do plano e aos avulsos: puxador à esquerda;
  // setas e lixeira à direita. O puxador também responde às setas do teclado.
  // As setas existem além do arrastar: um toque é mais preciso que arrastar
  // com a mão suada, e a troca de um lugar só é o caso mais comum.
  function cartao(
    rowId: string,
    nome: string,
    remover: { label: string; title: string; onClick: () => void },
    cabecalho: ReactNode,
    corpo: ReactNode,
    avulso = false
  ) {
    const arrastando = dragging === rowId
    const posicao = sessao.findIndex((f) => f.rowId === rowId)
    const seta = 'grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30'
    return (
      <div
        key={rowId}
        data-session-row={rowId}
        className={`rounded-md border bg-muted/20 p-2 ${avulso ? 'border-dashed' : ''} ${
          arrastando ? 'relative z-10 bg-card shadow-lg ring-2 ring-primary/60' : ''
        }`}
      >
        <div className="flex items-start gap-1">
          {podeReordenar ? (
            <button
              type="button"
              data-grip={rowId}
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return
                e.preventDefault()
                setDragging(rowId)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
                e.preventDefault()
                moverUmPasso(rowId, e.key === 'ArrowUp' ? -1 : 1, `[data-grip="${rowId}"]`)
              }}
              className="-ml-1 grid size-9 shrink-0 cursor-grab touch-none select-none place-items-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
              aria-label={`Mover ${nome}`}
              title="Arraste para mudar a ordem (no teclado, setas para cima e para baixo)"
            >
              <GripVertical className="size-4" aria-hidden="true" />
            </button>
          ) : null}
          <div className="flex min-h-9 min-w-0 flex-1 flex-wrap items-center justify-between gap-x-2">
            {cabecalho}
          </div>
          {podeReordenar ? (
            <>
              <button
                type="button"
                data-move-up={rowId}
                onClick={() => moverUmPasso(rowId, -1, `[data-move-up="${rowId}"]`)}
                disabled={posicao <= 0}
                className={seta}
                aria-label={`Subir ${nome}`}
                title="Subir"
              >
                <ChevronUp className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                data-move-down={rowId}
                onClick={() => moverUmPasso(rowId, 1, `[data-move-down="${rowId}"]`)}
                disabled={posicao >= sessao.length - 1}
                className={seta}
                aria-label={`Descer ${nome}`}
                title="Descer"
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={remover.onClick}
            className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={remover.label}
            title={remover.title}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
        {corpo}
      </div>
    )
  }

  function renderPlanejado(ex: (typeof dayExercises)[number]) {
    const effective = effectivePrescription(ex, overrideFor(overrides, weekNumber, ex.id))
    const nome = names[ex.exercise_id] ?? 'Exercício'
    return cartao(
      ex.id,
      nome,
      {
        label: `Tirar ${nome} desta sessão`,
        title: 'Não vai ser feito hoje: tira da sessão, sem mudar o plano',
        onClick: () => skipPlanned(ex.id),
      },
      <>
        <span className="text-sm font-medium">
          {nome}
          {techniqueLabel(ex.technique) ? (
            <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              {techniqueLabel(ex.technique)}
            </span>
          ) : null}
        </span>
        <span className="text-xs text-muted-foreground">
          plano: {formatSetsReps(effective.sets, effective.reps)}
          {effective.rir != null ? ` · RIR ${effective.rir}` : ''}
        </span>
      </>,
      <>
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
              {/* Sem arredondar para a grade de 2,5 kg: o motor já
                  escolhe o incremento pela faixa de carga (halter leve
                  vai de 1 em 1 kg), e arredondar aqui desfazia isso. */}
              {s.suggestedWeightKg != null ? `${formatKg(s.suggestedWeightKg)} kg` : ''}
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
      </>
    )
  }

  function renderAvulso(extra: ExtraExercise) {
    const nome = names[extra.exerciseId] ?? 'Exercício'
    const last = lastByExercise.get(extra.exerciseId)
    return cartao(
      extra.rowId,
      nome,
      {
        label: `Remover ${nome} da sessão`,
        title: 'Remover da sessão',
        onClick: () => removeExtra(extra.rowId),
      },
      <span className="text-sm font-medium">
        {nome}
        <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          fora do plano
        </span>
      </span>,
      <>
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
      </>,
      true
    )
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
        <ConfirmDialog
          open={guard.blocked}
          title="Sair do registro?"
          description={
            <>
              O treino ainda não foi registrado. O que você preencheu fica guardado neste aparelho e
              volta quando você abrir esta tela de novo. Para continuar em outro aparelho, ou para não
              depender deste, salve no servidor antes de sair.
            </>
          }
          cancelLabel="Ficar"
          confirmLabel="Sair"
          onCancel={guard.stay}
          onConfirm={guard.leave}
          extraAction={{
            label: saving ? 'Salvando...' : 'Salvar e sair',
            disabled: saving,
            onClick: () => {
              void salvarProgresso().then((ok) => (ok ? guard.leave() : guard.stay()))
            },
          }}
        />
        {sessaoParaContinuar ? (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <span>
              Há um treino de {formatDate(sessaoParaContinuar.performed_at)}
              {sessaoParaContinuar.day_label ? ` (Treino ${sessaoParaContinuar.day_label})` : ''} salvo
              para continuar.
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loadingPending || saving}
              onClick={() => void continuarSessao(sessaoParaContinuar)}
            >
              {loadingPending ? 'Abrindo...' : 'Continuar esse treino'}
            </Button>
          </div>
        ) : null}
        {continuing ? (
          <p className="text-xs text-muted-foreground">
            Continuando o treino salvo de {formatDate(date)}. "Registrar treino" conclui essa mesma sessão.
          </p>
        ) : null}
        {restored ? (
          <div role="status" className="flex items-start justify-between gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            <span>
              Sessão não registrada recuperada deste aparelho — continue de onde parou.
              {restored.lostRows > 0
                ? ` ${restored.lostRows} ${restored.lostRows === 1 ? 'série ficou de fora porque o exercício saiu' : 'séries ficaram de fora porque os exercícios saíram'} do plano.`
                : ''}
            </span>
            <button
              type="button"
              onClick={() => setRestored(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Fechar aviso de sessão recuperada"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <fieldset disabled={saving || createMut.isPending} className="min-w-0 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="workout-day" className="text-xs">Divisão</Label>
            <select
              id="workout-day"
              className={controlClass}
              value={dayKey}
              onChange={(e) => {
                setDayKey(e.target.value)
                // a série que estava cronometrando ficou em outra divisão
                setRestTimer(null)
                // ordem e remoções eram da divisão anterior
                setOrder([])
                setSkipped([])
              }}
            >
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
            <Input
              id="workout-date"
              type="date"
              value={date}
              onChange={(e) => {
                setDateTouched(true)
                setDate(e.target.value)
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workout-week" className="text-xs">Semana</Label>
            <Input
              id="workout-week"
              type="number"
              min={1}
              max={totalWeeks}
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
              a tela que conduz a sessão não pode listar os exercícios soltos.
              Os blocos saem da ordem DESTA sessão: o avulso arrastado para o
              meio de um bloco o parte, e o pedaço que ficar com um exercício
              só deixa de ser bloco. */}
          {toRowBlocks(
            sessao.map((fonte) => {
              const doPlano = planoPorRow.get(fonte.rowId)
              return { ...fonte, group_key: doPlano?.group_key ?? null, group_kind: doPlano?.group_kind ?? null }
            })
          ).map((block) => {
            const cartoes = block.items.map((fonte) => {
              const ex = planoPorRow.get(fonte.rowId)
              return ex ? renderPlanejado(ex) : renderAvulso(fonte)
            })
            return block.kind == null || block.items.length < 2 ? (
              cartoes
            ) : (
              <GroupBlock key={`${block.key}:${block.start}`} kind={block.kind} size={block.items.length}>
                {cartoes}
              </GroupBlock>
            )
          })}
          {sessao.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum exercício nesta sessão.</p>
          ) : null}
        </div>

        {/* O que foi tirado da sessão não some sem deixar rastro: um toque
            traz de volta, com as séries que já estavam preenchidas. */}
        {skippedVisiveis.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>Fora desta sessão:</span>
            {skippedVisiveis.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => unskipPlanned(ex.id)}
                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-dashed px-2 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Voltar ${names[ex.exercise_id] ?? 'exercício'} para a sessão`}
              >
                <Plus className="size-3" aria-hidden="true" />
                {names[ex.exercise_id] ?? 'Exercício'}
              </button>
            ))}
          </div>
        ) : null}

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
        {progressMsg ? <p role="status" className="text-sm text-primary">{progressMsg}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? 'Salvando...' : 'Registrar treino'}
          </Button>
          {/* Parar no meio sem perder nada e sem contar o treino como feito:
              a sessão fica no servidor como não concluída (0041). */}
          <Button size="sm" variant="outline" onClick={() => void salvarProgresso()} disabled={saving}>
            Salvar e continuar depois
          </Button>
          {dirty ? <UnsavedBadge /> : null}
        </div>
        </fieldset>

        {/* Fora do fieldset: o cronômetro não pode congelar enquanto a sessão
            anterior está sendo gravada — o aluno já está descansando.
            A key reinicia a contagem na tela quando uma nova série começa. */}
        {restTimer ? (
          <RestTimerBar
            key={restTimer.startedAt}
            timer={restTimer}
            onRegister={registrarDescanso}
            onDiscard={() => setRestTimer(null)}
            className="bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-4"
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

// Carga sugerida: uma casa decimal só quando existe (22.5 kg; 5 kg), no mesmo
// formato da "última" carga ao lado.
function formatKg(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1)
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
