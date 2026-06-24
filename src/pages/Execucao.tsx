import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Trash2, Plus } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import {
  useCreateWorkoutLog,
  useDeleteWorkoutLog,
  useExercises,
  usePlanSetHistory,
  useWorkoutLogs,
  useWorkoutPlan,
} from '../features/workout/hooks'
import type { NewLogSet, SetHistoryPoint, WorkoutPlanDetail } from '../features/workout/api'
import { adherencePct, exerciseProgression, plannedSessions } from '../features/workout/progress'
import {
  latestBestByExercise,
  parseRepRange,
  suggestProgression,
  type ProgressionKind,
} from '../features/workout/progression'
import { roundToIncrement } from '../features/workout/oneRm'
import { linePath } from '../features/reports/charts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const controlClass =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

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
        <Button asChild variant="outline">
          <Link to={`/avaliados/${id}`}>Voltar</Link>
        </Button>
      </div>
    )
  }

  const plan = detail.plan
  const logs = logsQuery.data ?? []
  const sessionsPerWeek =
    plan.weekly_schedule.length > 0 ? plan.weekly_schedule.length : detail.days.length
  const planned = plannedSessions(plan.weeks, sessionsPerWeek)
  const done = logs.length
  const pct = adherencePct(done, planned)
  const progress = exerciseProgression(historyQuery.data ?? [])

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adesão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-semibold">
              {done}
              <span className="text-base font-normal text-muted-foreground"> de {planned} sessões</span>
            </span>
            <span className="text-sm text-muted-foreground">{Math.round(pct * 100)}%</span>
          </div>
          <div className="h-2 rounded bg-muted">
            <div className="h-2 rounded bg-primary" style={{ width: `${(pct * 100).toFixed(0)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            Previsto = {plan.weeks} {plan.weeks === 1 ? 'semana' : 'semanas'} × {sessionsPerWeek}{' '}
            {sessionsPerWeek === 1 ? 'sessão' : 'sessões'} por semana.
          </p>
        </CardContent>
      </Card>

      <LogForm
        detail={detail}
        orgId={organization?.id ?? ''}
        subjectId={plan.subject_id}
        names={names}
        history={historyQuery.data ?? []}
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Sessões registradas</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma sessão registrada ainda.</p>
        ) : (
          <ul className="divide-y rounded-md border bg-card">
            {logs.map((log) => (
              <li key={log.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>
                  {formatDate(log.performed_at)}
                  {log.day_label ? <span className="text-muted-foreground"> · Treino {log.day_label}</span> : null}
                  {log.week_number ? <span className="text-muted-foreground"> · semana {log.week_number}</span> : null}
                </span>
                <button
                  onClick={() => {
                    if (window.confirm('Excluir esta sessão registrada?')) deleteMut.mutate(log.id)
                  }}
                  disabled={deleteMut.isPending}
                  className="text-destructive"
                  title="Excluir"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
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
                    <svg width={90} height={26} className="shrink-0">
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
    </div>
  )
}

type Row = { weight: string; reps: string; rir: string }

const KIND_LABEL: Record<ProgressionKind, string> = {
  increase_load: 'subir carga',
  add_reps: '+1 rep',
  hold: 'manter',
  reduce: 'reduzir',
  insufficient: '',
}

function LogForm({
  detail,
  orgId,
  subjectId,
  names,
  history,
}: {
  detail: WorkoutPlanDetail
  orgId: string
  subjectId: string
  names: Record<string, string>
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
  const [sets, setSets] = useState<Record<string, Row[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState(false)

  const dayExercises = useMemo(
    () => detail.exercises.filter((e) => e.day_id === dayKey).sort((a, b) => a.position - b.position),
    [detail.exercises, dayKey]
  )

  useEffect(() => {
    const init: Record<string, Row[]> = {}
    for (const ex of dayExercises) {
      init[ex.id] = Array.from({ length: Math.min(ex.sets, 12) }, () => ({ weight: '', reps: '', rir: '' }))
    }
    setSets(init)
  }, [dayExercises])

  function setCell(exRowId: string, i: number, field: keyof Row, val: string) {
    setSets((prev) => {
      const rows = (prev[exRowId] ?? []).slice()
      rows[i] = { ...rows[i], [field]: val }
      return { ...prev, [exRowId]: rows }
    })
  }
  function addRow(exRowId: string) {
    setSets((prev) => ({ ...prev, [exRowId]: [...(prev[exRowId] ?? []), { weight: '', reps: '', rir: '' }] }))
  }

  const day = days.find((d) => d.id === dayKey)

  async function save() {
    setError(null)
    setOkMsg(false)
    if (!orgId) return setError('Organização não carregada.')

    const flat: { exerciseId: string; weightKg: number | null; reps: number | null; rir: number | null }[] = []
    for (const ex of dayExercises) {
      for (const row of sets[ex.id] ?? []) {
        const w = row.weight.trim() === '' ? null : Number(row.weight)
        const r = row.reps.trim() === '' ? null : Number(row.reps)
        const rir = row.rir.trim() === '' ? null : Number(row.rir)
        if (w == null && r == null) continue
        flat.push({ exerciseId: ex.exercise_id, weightKg: w, reps: r, rir })
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
      const init: Record<string, Row[]> = {}
      for (const ex of dayExercises) {
        init[ex.id] = Array.from({ length: Math.min(ex.sets, 12) }, () => ({ weight: '', reps: '', rir: '' }))
      }
      setSets(init)
      setNotes('')
      setOkMsg(true)
    } catch (e) {
      setError((e as Error).message)
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
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Divisão</Label>
            <select className={controlClass} value={dayKey} onChange={(e) => setDayKey(e.target.value)}>
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                  {d.name ? ` — ${d.name}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Semana</Label>
            <Input
              type="number"
              min={1}
              max={plan_weeks(detail)}
              placeholder="—"
              value={week}
              onChange={(e) => setWeek(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3">
          {dayExercises.map((ex) => (
            <div key={ex.id} className="rounded-md border bg-muted/20 p-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{names[ex.exercise_id] ?? 'Exercício'}</span>
                <span className="text-xs text-muted-foreground">
                  plano: {ex.sets}×{ex.reps}
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
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                  <span className="w-6" />
                  <span className="w-20 text-center">carga (kg)</span>
                  <span className="w-16 text-center">reps</span>
                  <span className="w-14 text-center">RIR</span>
                </div>
                {(sets[ex.id] ?? []).map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 text-center text-xs text-muted-foreground">{i + 1}</span>
                    <Input
                      className="h-8 w-20"
                      type="number"
                      inputMode="decimal"
                      placeholder="kg"
                      value={row.weight}
                      onChange={(e) => setCell(ex.id, i, 'weight', e.target.value)}
                    />
                    <Input
                      className="h-8 w-16"
                      type="number"
                      inputMode="numeric"
                      placeholder={ex.reps}
                      value={row.reps}
                      onChange={(e) => setCell(ex.id, i, 'reps', e.target.value)}
                    />
                    <Input
                      className="h-8 w-14"
                      type="number"
                      inputMode="numeric"
                      placeholder={ex.rir != null ? String(ex.rir) : '—'}
                      value={row.rir}
                      onChange={(e) => setCell(ex.id, i, 'rir', e.target.value)}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addRow(ex.id)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus className="size-3" /> série
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Observações (opcional)</Label>
          <textarea
            rows={2}
            className={controlClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {okMsg ? <p className="text-sm text-primary">Treino registrado!</p> : null}

        <Button size="sm" onClick={save} disabled={createMut.isPending}>
          {createMut.isPending ? 'Salvando...' : 'Registrar treino'}
        </Button>
      </CardContent>
    </Card>
  )
}

function plan_weeks(detail: WorkoutPlanDetail): number {
  return detail.plan?.weeks ?? 52
}
