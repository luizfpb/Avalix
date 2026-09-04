import { useEffect, useMemo, useState } from 'react'
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
} from '../features/workout/hooks'
import type { ExerciseRow, NewLogSet, SetHistoryPoint, WorkoutPlanDetail } from '../features/workout/api'
import {
  adherencePct,
  exerciseProgression,
  plannedSessions,
  plannedSessionsToDate,
  sessionsPerWeek,
} from '../features/workout/progress'
import {
  latestBestByExercise,
  parseRepRange,
  suggestProgression,
  type ProgressionKind,
} from '../features/workout/progression'
import { roundToIncrement } from '../features/workout/oneRm'
import { formatSetsReps } from '../features/workout/effective'
import { techniqueLabel, toRowBlocks } from '../features/workout/groups'
import { GroupBlock } from '../features/workout/GroupBlock'
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
import { ensureLogRows, type LogRow } from '../features/workout/logRows'
import { SessionSets, type SessionSet } from '../features/workout/SessionSets'
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
  const startedOn = plan.starts_on ?? plan.created_at ?? null
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
  const setsQuery = useWorkoutLogSets(aberto ? log.id : undefined)

  const sets: SessionSet[] = (setsQuery.data ?? []).map((s) => ({
    exerciseName: names[s.exercise_id] ?? 'Exercício',
    setNumber: s.set_number,
    weightKg: s.weight_kg,
    reps: s.reps,
    rir: s.rir,
  }))

  return (
    <li className="text-sm">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={aberto}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {aberto ? (
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
          disabled={excluindo}
          className="grid size-10 shrink-0 place-items-center rounded-md text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Excluir"
          aria-label={`Excluir sessão de ${formatDate(log.performed_at)}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {aberto ? (
        <div className="border-t bg-muted/20 px-4 py-2.5">
          {setsQuery.isPending ? (
            <p className="text-xs text-muted-foreground">Carregando séries...</p>
          ) : setsQuery.isError ? (
            <p className="text-xs text-muted-foreground">
              Não foi possível carregar as séries desta sessão.
            </p>
          ) : (
            <SessionSets sets={sets} />
          )}
          {log.notes ? (
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
  onCell,
  onAddRow,
}: {
  name: string
  rows: LogRow[]
  repsPlaceholder: string
  rirPlaceholder: string
  onCell: (i: number, field: keyof LogRow, value: string) => void
  onAddRow: () => void
}) {
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
        <span className="w-6" />
        <span className="w-20 text-center">carga (kg)</span>
        <span className="w-16 text-center">reps</span>
        <span className="w-14 text-center">RIR</span>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 text-center text-xs text-muted-foreground">{i + 1}</span>
          <Input
            aria-label={`Carga da série ${i + 1} de ${name}`}
            className="h-8 w-20"
            type="number"
            inputMode="decimal"
            placeholder="kg"
            value={row.weight}
            onChange={(e) => onCell(i, 'weight', e.target.value)}
          />
          <Input
            aria-label={`Repetições da série ${i + 1} de ${name}`}
            className="h-8 w-16"
            type="number"
            inputMode="numeric"
            placeholder={repsPlaceholder}
            value={row.reps}
            onChange={(e) => onCell(i, 'reps', e.target.value)}
          />
          <Input
            aria-label={`RIR da série ${i + 1} de ${name}`}
            className="h-8 w-14"
            type="number"
            inputMode="numeric"
            placeholder={rirPlaceholder}
            value={row.rir}
            onChange={(e) => onCell(i, 'rir', e.target.value)}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={onAddRow}
        className="flex min-h-10 items-center gap-1 rounded-md px-2 text-xs text-primary hover:bg-primary/5 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
}: {
  detail: WorkoutPlanDetail
  orgId: string
  subjectId: string
  names: Record<string, string>
  exercises: ExerciseRow[]
  history: SetHistoryPoint[]
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
  const [week, setWeek] = useState('')
  const [notes, setNotes] = useState('')
  const [sets, setSets] = useState<Record<string, LogRow[]>>({})
  const [extras, setExtras] = useState<ExtraExercise[]>([])
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState(false)

  const dayExercises = useMemo(
    () => detail.exercises.filter((e) => e.day_id === dayKey).sort((a, b) => a.position - b.position),
    [detail.exercises, dayKey]
  )

  useEffect(() => {
    setSets((previous) => ensureLogRows(previous, dayExercises))
  }, [dayExercises])

  function setCell(exRowId: string, i: number, field: keyof LogRow, val: string) {
    setSets((prev) => {
      const rows = (prev[exRowId] ?? []).slice()
      rows[i] = { ...rows[i], [field]: val }
      return { ...prev, [exRowId]: rows }
    })
  }
  function addRow(exRowId: string) {
    setSets((prev) => ({ ...prev, [exRowId]: [...(prev[exRowId] ?? []), { weight: '', reps: '', rir: '' }] }))
  }

  // A chave das linhas é o rowId, e não o exercício: o mesmo exercício pode ser
  // adicionado de novo numa sessão futura sem herdar as linhas da anterior.
  function addExtra(exerciseId: string) {
    const rowId = `extra:${crypto.randomUUID()}`
    setExtras((prev) => [...prev, { rowId, exerciseId }])
    setSets((prev) => ({
      ...prev,
      [rowId]: Array.from({ length: 3 }, () => ({ weight: '', reps: '', rir: '' })),
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
    setError(null)
    setOkMsg(false)
    if (!orgId) return setError('Organização não carregada.')

    const flat: { exerciseId: string; weightKg: number | null; reps: number | null; rir: number | null }[] = []
    const fontes = [
      ...dayExercises.map((ex) => ({ rowId: ex.id, exerciseId: ex.exercise_id })),
      ...extras,
    ]
    for (const ex of fontes) {
      for (const row of sets[ex.rowId] ?? []) {
        const w = row.weight.trim() === '' ? null : Number(row.weight)
        const r = row.reps.trim() === '' ? null : Number(row.reps)
        const rir = row.rir.trim() === '' ? null : Number(row.rir)
        if (w == null && r == null) continue
        flat.push({ exerciseId: ex.exerciseId, weightKg: w, reps: r, rir })
      }
    }
    if (flat.length === 0) return setError('Registre ao menos uma série com carga ou repetições.')

    // numera as séries por exercício (a unique é por log+exercício+set_number)
    const counter = new Map<string, number>()
    const finalSets: NewLogSet[] = flat.map((s) => {
      const n = (counter.get(s.exerciseId) ?? 0) + 1
      counter.set(s.exerciseId, n)
      return { exerciseId: s.exerciseId, setNumber: n, weightKg: s.weightKg, reps: s.reps, rir: s.rir }
    })

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
        init[ex.id] = Array.from({ length: Math.min(ex.sets, 12) }, () => ({ weight: '', reps: '', rir: '' }))
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
      setOkMsg(true)
    } catch (e) {
      setError(normalizeDbError(e))
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
              onChange={(e) => setWeek(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3">
          {/* Super-série e circuito mudam o que se faz ENTRE uma série e outra:
              a tela que conduz a sessão não pode listar os exercícios soltos. */}
          {toRowBlocks(dayExercises).map((block) => {
            const cartoes = block.items.map((ex) => (
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
                  plano: {formatSetsReps(ex.sets, ex.reps)}
                </span>
              </div>
              {(() => {
                const last = lastByExercise.get(ex.exercise_id)
                if (!last) return null
                const s = suggestProgression({
                  last,
                  repRange: parseRepRange(ex.reps),
                  targetRir: ex.rir,
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
                repsPlaceholder={ex.reps ?? '—'}
                rirPlaceholder={ex.rir != null ? String(ex.rir) : '—'}
                onCell={(i, field, value) => setCell(ex.id, i, field, value)}
                onAddRow={() => addRow(ex.id)}
              />
            </div>
            ))
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
      </CardContent>
    </Card>
  )
}

function planWeeks(detail: WorkoutPlanDetail): number {
  return detail.plan?.weeks ?? 52
}
