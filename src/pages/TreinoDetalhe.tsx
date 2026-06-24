import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import { useAuth } from '../features/auth/context'
import { useSubject } from '../features/subjects/hooks'
import {
  useDeleteWorkoutPlan,
  useExercises,
  useWorkoutPlan,
} from '../features/workout/hooks'
import type { WorkoutExerciseRow } from '../features/workout/api'
import { goalLabel, snapshotVolumeItems, type VolumeSnapshot } from '../features/workout/volume'
import { VolumeLandmarkPanel } from '../features/workout/VolumeLandmarkPanel'
import { downloadBlob } from '../features/reports/download'
import { logExport } from '../features/reports/audit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function fmtSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function exerciseMeta(ex: WorkoutExerciseRow): string {
  const parts: string[] = []
  if (ex.rir != null) parts.push(`RIR ${fmtSets(ex.rir)}`)
  if (ex.rest_seconds != null) parts.push(`${ex.rest_seconds}s descanso`)
  if (ex.tempo) parts.push(`cadência ${ex.tempo}`)
  return parts.join(' · ')
}

export default function TreinoDetalhe() {
  const { id, planId } = useParams()
  const query = useWorkoutPlan(planId)
  const subjectQuery = useSubject(id)
  const { organization } = useOrganization()
  const exercisesQuery = useExercises(organization?.id)
  const { user } = useAuth()
  const navigate = useNavigate()
  const deleteMut = useDeleteWorkoutPlan(id)
  const [pdfBusy, setPdfBusy] = useState(false)

  const exerciseNames = useMemo(() => {
    const m: Record<string, string> = {}
    for (const e of exercisesQuery.data ?? []) m[e.id] = e.name
    return m
  }, [exercisesQuery.data])

  if (query.isPending) return <p className="text-sm text-muted-foreground">Carregando...</p>
  if (query.isError || !query.data.plan) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Não foi possível carregar o plano.</p>
        <Button asChild variant="outline">
          <Link to={`/avaliados/${id}`}>Voltar</Link>
        </Button>
      </div>
    )
  }

  const { plan, days, exercises, overrides, weeks } = query.data
  const snapshot = plan.volume as VolumeSnapshot | null
  const orderedDays = days.slice().sort((a, b) => a.position - b.position)
  const startsOn = formatDate(plan.starts_on)

  const exNameByWorkoutExerciseId = new Map(
    exercises.map((e) => [e.id, exerciseNames[e.exercise_id] ?? 'Exercício'])
  )
  const weekNumbers = [
    ...new Set([
      ...weeks.map((w) => w.week_number),
      ...overrides.map((o) => o.week_number),
    ]),
  ].sort((a, b) => a - b)

  async function handlePdf() {
    setPdfBusy(true)
    try {
      const { generateWorkoutPdf } = await import('../features/reports/workoutPdf')
      const blob = await generateWorkoutPdf({
        orgName: organization?.name ?? '',
        subjectName: subjectQuery.data?.full_name ?? '',
        plan,
        days,
        exercises,
        weeks,
        overrides,
        exerciseNames,
      })
      downloadBlob(blob, `treino-${plan.name.replace(/\s+/g, '-').toLowerCase()}.pdf`)
      if (organization && user) {
        void logExport({
          orgId: organization.id,
          userId: user.id,
          action: 'PDF_REPORT',
          tableName: 'workout_plans',
          rowId: plan.id,
        })
      }
    } finally {
      setPdfBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Excluir este plano de treino? Esta ação é definitiva.')) return
    try {
      await deleteMut.mutateAsync(plan.id)
      navigate(`/avaliados/${id}`)
    } catch {
      // erro exibido abaixo
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to={`/avaliados/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← Voltar
          </Link>
          <h1 className="mt-2 text-xl font-semibold">{plan.name}</h1>
          <p className="text-sm text-muted-foreground">
            {goalLabel(plan.goal)} · {plan.weeks} {plan.weeks === 1 ? 'semana' : 'semanas'}
            {startsOn ? ` · início ${startsOn}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/avaliados/${id}/treinos/${plan.id}/editar`}>
              <Pencil /> Editar
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handlePdf} disabled={pdfBusy}>
            {pdfBusy ? 'Gerando...' : 'Baixar PDF'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={handleDelete}
            disabled={deleteMut.isPending}
          >
            <Trash2 /> {deleteMut.isPending ? 'Excluindo...' : 'Excluir'}
          </Button>
        </div>
      </div>

      {deleteMut.error ? (
        <p className="text-sm text-destructive">{(deleteMut.error as Error).message}</p>
      ) : null}

      {snapshot ? (
        <VolumeLandmarkPanel
          items={snapshotVolumeItems(snapshot)}
          typicalWeek={snapshot.typicalWeek}
        />
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Divisões</h2>
        {orderedDays.map((day) => {
          const rows = exercises
            .filter((e) => e.day_id === day.id)
            .slice()
            .sort((a, b) => a.position - b.position)
          return (
            <Card key={day.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  Treino {day.label}
                  {day.name ? <span className="text-muted-foreground"> — {day.name}</span> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {rows.map((ex, i) => {
                  const meta = exerciseMeta(ex)
                  return (
                    <div key={ex.id} className="flex flex-col border-b py-1 last:border-0">
                      <div className="flex justify-between gap-3">
                        <span>
                          {i + 1}. {exerciseNames[ex.exercise_id] ?? 'Exercício'}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {ex.sets}×{ex.reps}
                        </span>
                      </div>
                      {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )
        })}
      </section>

      {weekNumbers.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Organização por semana</h2>
          <div className="rounded-md border bg-card text-sm">
            {weekNumbers.map((n) => {
              const meta = weeks.find((w) => w.week_number === n)
              const ovs = overrides.filter((o) => o.week_number === n)
              return (
                <div key={n} className="border-b px-4 py-2 last:border-0">
                  <div className="flex items-center gap-2">
                    <span>Semana {n}</span>
                    {meta?.label ? <span className="text-muted-foreground">— {meta.label}</span> : null}
                    {meta?.is_deload ? <Badge variant="secondary">Deload</Badge> : null}
                  </div>
                  {ovs.map((o) => (
                    <p key={o.id} className="text-xs text-muted-foreground">
                      · {exNameByWorkoutExerciseId.get(o.workout_exercise_id) ?? 'Exercício'}:{' '}
                      {o.is_skipped
                        ? 'não executar'
                        : [
                            o.sets != null ? `${o.sets} séries` : null,
                            o.reps != null ? `${o.reps} reps` : null,
                            o.rir != null ? `RIR ${fmtSets(o.rir)}` : null,
                            o.rest_seconds != null ? `${o.rest_seconds}s` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'ajuste'}
                    </p>
                  ))}
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {plan.notes ? (
        <div className="text-sm">
          <span className="block text-xs text-muted-foreground">Observações</span>
          <p className="whitespace-pre-wrap">{plan.notes}</p>
        </div>
      ) : null}
    </div>
  )
}
