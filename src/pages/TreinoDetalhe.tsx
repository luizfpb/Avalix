import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Trash2, Copy, Share2, ClipboardList } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import { useAuth } from '../features/auth/context'
import { useSubject, useSubjects } from '../features/subjects/hooks'
import {
  useDeleteWorkoutPlan,
  useDuplicateWorkoutPlan,
  useExercises,
  useSetWorkoutPlanStatus,
  useWorkoutPlan,
} from '../features/workout/hooks'
import { useAssessments } from '../features/assessment/hooks'
import { useSessions } from '../features/posture/hooks'
import type { WorkoutExerciseRow, WorkoutPlanDetail } from '../features/workout/api'
import {
  goalLabel,
  snapshotVolumeItems,
  type MuscleGroup,
  type VolumeSnapshot,
} from '../features/workout/volume'
import {
  duplicatePlanEditor,
  editorToSaveInput,
  snapshotFromEditor,
  type ExerciseMeta,
} from '../features/workout/builder'
import { VolumeLandmarkPanel } from '../features/workout/VolumeLandmarkPanel'
import { planShareText, whatsappUrl } from '../features/workout/share'
import { downloadBlob } from '../features/reports/download'
import { logExport } from '../features/reports/audit'
import { loadOrgLogoDataUrl } from '../features/organization/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  active: 'Ativo',
  archived: 'Arquivado',
}

const controlClass =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

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
  const statusMut = useSetWorkoutPlanStatus(id, planId)
  const assessmentsQ = useAssessments(id)
  const sessionsQ = useSessions(id)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [showDup, setShowDup] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [copied, setCopied] = useState(false)

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

  const srcAssessment = plan.source_assessment_id
    ? (assessmentsQ.data ?? []).find((a) => a.id === plan.source_assessment_id) ?? null
    : null
  const srcSession = plan.source_posture_session_id
    ? (sessionsQ.data ?? []).find((s) => s.id === plan.source_posture_session_id) ?? null
    : null
  const srcBodyFat =
    srcAssessment != null
      ? (srcAssessment.results as { bodyFatPct?: number } | null)?.bodyFatPct ?? null
      : null

  const exNameByWorkoutExerciseId = new Map(
    exercises.map((e) => [e.id, exerciseNames[e.exercise_id] ?? 'Exercício'])
  )
  const weekNumbers = [
    ...new Set([
      ...weeks.map((w) => w.week_number),
      ...overrides.map((o) => o.week_number),
    ]),
  ].sort((a, b) => a - b)

  const shareText = planShareText({
    orgName: organization?.name ?? '',
    plan,
    days,
    exercises,
    exerciseNames,
  })
  const pdfFilename = `treino-${plan.name.replace(/\s+/g, '-').toLowerCase()}.pdf`
  const canShareFiles = (() => {
    if (typeof navigator === 'undefined') return false
    const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean }
    try {
      return !!nav.canShare?.({ files: [new File([''], 'x.pdf', { type: 'application/pdf' })] })
    } catch {
      return false
    }
  })()

  async function buildPdfBlob(): Promise<Blob> {
    const { generateWorkoutPdf } = await import('../features/reports/workoutPdf')
    const logoUrl = await loadOrgLogoDataUrl(organization?.logo_path)
    return generateWorkoutPdf({
      orgName: organization?.name ?? '',
      subjectName: subjectQuery.data?.full_name ?? '',
      logoUrl,
      plan,
      days,
      exercises,
      weeks,
      overrides,
      exerciseNames,
      source:
        srcAssessment || srcSession
          ? {
              assessmentDate: srcAssessment ? srcAssessment.assessed_at : null,
              bodyFatPct: srcBodyFat,
              postureDate: srcSession ? srcSession.taken_at : null,
            }
          : undefined,
    })
  }

  function logPdf() {
    if (organization && user) {
      void logExport({
        orgId: organization.id,
        userId: user.id,
        action: 'PDF_REPORT',
        tableName: 'workout_plans',
        rowId: plan.id,
      })
    }
  }

  async function handlePdf() {
    setPdfBusy(true)
    try {
      const blob = await buildPdfBlob()
      downloadBlob(blob, pdfFilename)
      logPdf()
    } finally {
      setPdfBusy(false)
    }
  }

  async function handleSharePdf() {
    setPdfBusy(true)
    try {
      const blob = await buildPdfBlob()
      const file = new File([blob], pdfFilename, { type: 'application/pdf' })
      const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean }
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: plan.name, text: shareText })
        logPdf()
      } else {
        downloadBlob(blob, pdfFilename)
        logPdf()
      }
    } catch {
      // share cancelado pelo usuário ou indisponível — ignora
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
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={plan.status === 'active' ? 'success' : 'secondary'}>
              {STATUS_LABELS[plan.status] ?? plan.status}
            </Badge>
            {plan.status !== 'active' ? (
              <button
                onClick={() => statusMut.mutate('active')}
                disabled={statusMut.isPending}
                className="text-primary hover:underline"
              >
                Ativar
              </button>
            ) : null}
            {plan.status !== 'archived' ? (
              <button
                onClick={() => statusMut.mutate('archived')}
                disabled={statusMut.isPending}
                className="text-muted-foreground hover:underline"
              >
                Arquivar
              </button>
            ) : null}
            {plan.status !== 'draft' ? (
              <button
                onClick={() => statusMut.mutate('draft')}
                disabled={statusMut.isPending}
                className="text-muted-foreground hover:underline"
              >
                Voltar a rascunho
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button asChild size="sm">
            <Link to={`/avaliados/${id}/treinos/${plan.id}/execucao`}>
              <ClipboardList /> Execução
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/avaliados/${id}/treinos/${plan.id}/editar`}>
              <Pencil /> Editar
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handlePdf} disabled={pdfBusy}>
            {pdfBusy ? 'Gerando...' : 'Baixar PDF'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDup((s) => !s)}>
            <Copy /> Duplicar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowShare((s) => !s)}>
            <Share2 /> Compartilhar
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

      {showDup ? (
        <DuplicatePanel
          detail={query.data}
          orgId={organization?.id ?? ''}
          currentSubjectId={plan.subject_id}
          defaultName={`Cópia de ${plan.name}`}
          onClose={() => setShowDup(false)}
        />
      ) : null}

      {showShare ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compartilhar plano</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea readOnly rows={8} value={shareText} className={controlClass} />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() =>
                  window.open(whatsappUrl(shareText, subjectQuery.data?.phone), '_blank')
                }
              >
                Enviar no WhatsApp
              </Button>
              {canShareFiles ? (
                <Button size="sm" variant="outline" onClick={handleSharePdf} disabled={pdfBusy}>
                  {pdfBusy ? 'Gerando...' : 'Compartilhar PDF'}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareText)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  } catch {
                    // sem permissão de clipboard — ignora
                  }
                }}
              >
                {copied ? 'Copiado!' : 'Copiar texto'}
              </Button>
            </div>
            {!canShareFiles ? (
              <p className="text-xs text-muted-foreground">
                O WhatsApp abre com o resumo pronto. Para anexar o PDF, baixe-o e anexe no WhatsApp
                Web; no celular, "Compartilhar PDF" usa o compartilhamento nativo.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {srcAssessment || srcSession ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Base da prescrição</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {srcAssessment ? (
              <div className="flex items-center justify-between gap-3">
                <span>
                  <span className="text-muted-foreground">Avaliação física: </span>
                  {formatDate(srcAssessment.assessed_at)}
                  {srcBodyFat != null ? ` · ${srcBodyFat.toFixed(1)}% gordura` : ''}
                </span>
                <Link
                  to={`/avaliados/${id}/avaliacoes/${srcAssessment.id}`}
                  className="shrink-0 text-xs text-primary hover:underline"
                >
                  ver
                </Link>
              </div>
            ) : null}
            {srcSession ? (
              <div className="flex items-center justify-between gap-3">
                <span>
                  <span className="text-muted-foreground">Avaliação postural: </span>
                  {formatDate(srcSession.taken_at)}
                </span>
                <Link
                  to={`/avaliados/${id}/postural/${srcSession.id}`}
                  className="shrink-0 text-xs text-primary hover:underline"
                >
                  ver
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>
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

function DuplicatePanel({
  detail,
  orgId,
  currentSubjectId,
  defaultName,
  onClose,
}: {
  detail: WorkoutPlanDetail
  orgId: string
  currentSubjectId: string
  defaultName: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const subjectsQ = useSubjects(orgId)
  const exercisesQ = useExercises(orgId)
  const dupMut = useDuplicateWorkoutPlan()
  const [name, setName] = useState(defaultName)
  const [targetSubjectId, setTargetSubjectId] = useState(currentSubjectId)
  const [error, setError] = useState<string | null>(null)

  const metaById = useMemo(
    () =>
      new Map<string, ExerciseMeta>(
        (exercisesQ.data ?? []).map((e) => [
          e.id,
          {
            primaryMuscle: e.primary_muscle as MuscleGroup,
            secondaryMuscles: e.secondary_muscles as MuscleGroup[],
          },
        ])
      ),
    [exercisesQ.data]
  )

  async function confirm() {
    setError(null)
    if (!name.trim()) return setError('Informe o nome do novo plano.')
    if (!orgId) return setError('Organização não carregada.')
    const keepSources = targetSubjectId === currentSubjectId
    const editor = duplicatePlanEditor(detail, { name: name.trim(), keepSources })
    const snapshot = snapshotFromEditor(editor, metaById)
    const save = editorToSaveInput(editor, { orgId, subjectId: targetSubjectId }, snapshot)
    try {
      const created = await dupMut.mutateAsync(save)
      navigate(`/avaliados/${targetSubjectId}/treinos/${created.id}`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Duplicar plano</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Nome do novo plano</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Para qual avaliado</Label>
          <select
            className={controlClass}
            value={targetSubjectId}
            onChange={(e) => setTargetSubjectId(e.target.value)}
          >
            {(subjectsQ.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
                {s.id === currentSubjectId ? ' (este)' : ''}
              </option>
            ))}
          </select>
          {targetSubjectId !== currentSubjectId ? (
            <p className="text-xs text-muted-foreground">
              A avaliação/postura de origem não é copiada para outro avaliado.
            </p>
          ) : null}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex gap-2">
          <Button size="sm" onClick={confirm} disabled={dupMut.isPending}>
            {dupMut.isPending ? 'Duplicando...' : 'Duplicar'}
          </Button>
          <Button size="sm" variant="outline" onClick={onClose} disabled={dupMut.isPending}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
