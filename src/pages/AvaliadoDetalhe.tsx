import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { PageTrail } from '../components/PageTrail'
import { useSubjectTrail } from '../lib/subjectTrail'
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'
import { useSubject } from '../features/subjects/hooks'
import {
  useAssessment,
  useAssessments,
  useSubjectCircumferences,
} from '../features/assessment/hooks'
import { useAnamneses } from '../features/anamnesis/hooks'
import { parseAnswers } from '../features/anamnesis/parse'
import { computeGate } from '../features/anamnesis/gate'
import {
  anamneseAlerta,
  declaracaoFromAnswers,
  liberacaoFromRow,
} from '../features/anamnesis/clearance'
import {
  useSubjectIntakes,
  useGenerateIntakeLink,
  useCancelIntake,
} from '../features/anamnesis/intakeHooks'
import { IntakeLinkButtons } from '../features/anamnesis/IntakeLinkButtons'
import { useWorkoutPlans } from '../features/workout/hooks'
import { WorkoutLinkCard } from '../features/workout/WorkoutLinkCard'
import { goalLabel } from '../features/workout/volume'
import { protocolLabel } from '../features/assessment/protocols'
import type { AssessmentResultSnapshot } from '../features/assessment/result'
import {
  groupCircumferencesByAssessment,
  sortAssessmentsChronologically,
} from '../features/assessment/timeline'
import { CopyPromptButton } from '../features/prompts/CopyPromptButton'
import { buildBriefingPrompt, type AssessmentPromptPoint } from '../features/prompts'
import type { SubjectRow } from '../features/subjects/api'
import { useSessions } from '../features/posture/hooks'
import { assessmentCsvRecord, buildAssessmentsCsv, type CsvDialect } from '../features/reports/csv'
import { csvBlob, downloadBlob } from '../features/reports/download'
import { logExport } from '../features/reports/audit'
import { exportSubjectArchive, type SubjectExportProgress } from '../features/reports/subjectExport'
import {
  useActiveConsent,
  useGrantConsent,
  useRevokeConsent,
} from '../features/consent/hooks'
import { consentText } from '../features/consent/text'
import type { SignerKind } from '../features/consent/api'
import { Pencil, TrendingUp, CalendarPlus, Send, Copy, MessageCircle, Download, ClipboardList } from 'lucide-react'
import { ageFromBirthDate } from '../lib/age'
import { formatPhone } from '../lib/phone'
import { Initials } from '../components/Initials'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

import { controlClass } from '@/lib/ui'
import { normalizeDbError } from '../lib/errors'
import { QueryError } from '../components/QueryError'

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="block text-xs text-muted-foreground">{label}</span>
      {value ? (
        <span className="block break-words">{value}</span>
      ) : (
        <span className="block text-muted-foreground">Não informado</span>
      )}
    </div>
  )
}

export default function AvaliadoDetalhe() {
  const { id } = useParams()
  // Troca direta pelo histórico pode conservar esta rota e os dados em cache.
  // O estado de convites/consentimento nunca pode acompanhar outro titular.
  return <AvaliadoDetalheContent key={id} />
}

function AvaliadoDetalheContent() {
  const { id } = useParams()
  const trail = useSubjectTrail(undefined)
  const { organization } = useOrganization()
  const subjectQuery = useSubject(id)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportProgress, setExportProgress] = useState<SubjectExportProgress | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  if (subjectQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }
  if (subjectQuery.isError || !subjectQuery.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Não foi possível carregar.</p>
        <Button asChild variant="outline">
          <Link to="/avaliados">Voltar</Link>
        </Button>
      </div>
    )
  }

  const s = subjectQuery.data
  const age = ageFromBirthDate(s.birth_date)

  async function handleFullExport() {
    if (!organization) return
    setExportBusy(true)
    setExportError(null)
    setExportProgress(null)
    try {
      await exportSubjectArchive({
        subjectId: s.id,
        subjectName: s.full_name,
        onProgress: setExportProgress,
      })
    } catch (error) {
      setExportError(normalizeDbError(error))
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <PageTrail steps={trail} current={s.full_name} />
        {/* Empilhado no celular: com as ações em `shrink-0` na mesma linha, o
            `truncate` do nome engolia o nome inteiro — sobrava o avatar. */}
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Initials name={s.full_name} size="xl" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold lg:text-2xl">{s.full_name}</h1>
              <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {age !== null ? `${age} anos` : null}
                  <span className="hidden lg:inline">
                    {age !== null ? ' · ' : ''}
                    {s.sex === 'F' ? 'Feminino' : 'Masculino'}
                    {s.height_cm != null ? ` · ${s.height_cm} cm` : ''}
                  </span>
                </span>
                {!s.is_active ? <Badge variant="secondary">Inativo</Badge> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFullExport}
              disabled={exportBusy || !organization}
            >
              <Download />
              {exportBusy
                ? exportProgress && exportProgress.total > 0
                  ? `Fotos ${exportProgress.completed}/${exportProgress.total}`
                  : 'Preparando...'
                : 'Exportar dados'}
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={`/agenda?subject=${s.id}`}>
                <CalendarPlus /> Agendar
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={`/avaliados/${s.id}/editar`}>
                <Pencil /> Editar
              </Link>
            </Button>
          </div>
        </div>
        {exportError ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {exportError}
          </p>
        ) : null}
      </div>

      {/* Duas colunas no computador. Cada coluna é uma pilha na ordem do
          celular (a da esquerda vem antes), então nada muda de lugar lá. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-start xl:gap-8">
        <div className="min-w-0 space-y-6 lg:space-y-8">
          <BodySnapshot subjectId={s.id} />

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Dados</h2>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2 lg:p-5">
              <Info label="Idade" value={age !== null ? `${age} anos` : null} />
              <Info label="Sexo" value={s.sex === 'F' ? 'Feminino' : 'Masculino'} />
              <Info label="Nascimento" value={formatDate(s.birth_date)} />
              <Info label="Altura" value={s.height_cm != null ? `${s.height_cm} cm` : null} />
              <Info label="Telefone" value={formatPhone(s.phone)} />
              <Info label="E-mail" value={s.email} />
              {s.guardian_name ? (
                <Info
                  label="Responsável"
                  value={`${s.guardian_name}${
                    s.guardian_relationship ? ` (${s.guardian_relationship})` : ''
                  }`}
                />
              ) : null}
              {s.notes ? (
                <div className="sm:col-span-2">
                  <Info label="Observações" value={s.notes} />
                </div>
              ) : null}
            </div>
          </section>

          <ConsentSection
            subjectId={s.id}
            orgId={organization?.id ?? ''}
            controllerName={organization?.name ?? null}
            requiresGuardian={age !== null && age < 18}
          />

          <AnamneseSection subjectId={s.id} />
        </div>

        <div className="min-w-0 space-y-6 lg:space-y-8">
          <AssessmentsSection subjectId={s.id} />

          <BriefingSection subject={s} />

          <WorkoutSection subjectId={s.id} subjectName={s.full_name} orgName={organization?.name ?? ''} />

          <PosturalSection subjectId={s.id} />
        </div>
      </div>
    </div>
  )
}

function decimal(value: number): string {
  return value.toFixed(1).replace('.', ',')
}

// Resumo físico no alto da ficha, só no computador: a composição da última
// avaliação e a linha da % de gordura em todas elas. No celular a ficha segue
// direto para os dados, como antes.
function BodySnapshot({ subjectId }: { subjectId: string }) {
  const assessmentsQuery = useAssessments(subjectId)
  const assessments = useMemo(
    () => sortAssessmentsChronologically(assessmentsQuery.data ?? []),
    [assessmentsQuery.data]
  )
  const series = assessments
    .map((a) => ({ date: a.assessed_at, results: a.results as AssessmentResultSnapshot | null }))
    .filter((p): p is { date: string; results: AssessmentResultSnapshot } => p.results != null)
  const last = series.at(-1)
  if (!last) return null
  const first = series[0]
  const fat = last.results.bodyFatPct
  const delta = series.length > 1 ? fat - first.results.bodyFatPct : null

  return (
    <section aria-labelledby="resumo-fisico" className="hidden rounded-lg border bg-card p-5 lg:block">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="resumo-fisico" className="text-base font-semibold">Composição atual</h2>
        <span className="text-sm text-muted-foreground tabular-nums">{formatDate(last.date)}</span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-5xl leading-none font-semibold tracking-tight tabular-nums">
            {decimal(fat)}
            <span className="ml-0.5 text-2xl font-medium text-muted-foreground">%</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">gordura corporal</p>
        </div>
        {series.length > 1 ? <FatTrend values={series.map((p) => p.results.bodyFatPct)} /> : null}
      </div>
      {delta != null ? (
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">
            {delta > 0 ? '▲' : delta < 0 ? '▼' : '–'} {decimal(Math.abs(delta))} p.p.
          </span>{' '}
          desde {formatDate(first.date)}, em {series.length} avaliações
        </p>
      ) : null}
      <dl className="mt-5 grid grid-cols-3 divide-x border-t pt-4">
        {[
          ['Peso', last.results.inputs.weightKg],
          ['Massa magra', last.results.leanMassKg],
          ['Massa gorda', last.results.fatMassKg],
        ].map(([label, value], i) => (
          <div key={label} className={i === 0 ? 'pr-3' : 'px-3'}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {decimal(value as number)}
              <span className="ml-0.5 text-sm font-normal text-muted-foreground">kg</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// Linha da % de gordura, da primeira à última avaliação. Os valores exatos
// estão na lista de avaliações e em Evolução; aqui só a direção.
function FatTrend({ values }: { values: number[] }) {
  const w = 156
  const h = 64
  const pad = 4
  const max = Math.max(...values)
  const span = max - Math.min(...values) || 1
  const points = values.map((v, i) => [
    pad + (i * (w - 2 * pad)) / (values.length - 1),
    pad + ((max - v) * (h - 2 * pad)) / span,
  ])
  const [lx, ly] = points[points.length - 1]
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0 text-muted-foreground">
      <polyline
        points={points.map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.slice(0, -1).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2} className="fill-muted-foreground" />
      ))}
      <circle cx={lx} cy={ly} r={3.5} className="fill-foreground" />
    </svg>
  )
}

// Briefing de prescrição: junta a anamnese mais recente com a série de
// avaliações num prompt só. É o cruzamento que nenhuma das duas telas mostra
// sozinha — meta declarada que a triagem não autoriza, queixa de dor que
// explica uma medida parada, perda de peso com perda de massa magra em quem
// pediu hipertrofia.
function BriefingSection({ subject }: { subject: SubjectRow }) {
  const { organization } = useOrganization()
  const { user } = useAuth()
  const anamnesesQuery = useAnamneses(subject.id)
  const assessmentsQuery = useAssessments(subject.id)
  const circsQuery = useSubjectCircumferences(subject.id)

  // listAnamneses já vem da mais recente para a mais antiga
  const anamneseRow = (anamnesesQuery.data ?? [])[0] ?? null

  const assessments = useMemo(
    () => sortAssessmentsChronologically(assessmentsQuery.data ?? []),
    [assessmentsQuery.data]
  )
  const lastAssessment = assessments.length > 0 ? assessments[assessments.length - 1] : null
  // as dobras cruas só existem na consulta por avaliação; useAssessment fica
  // desabilitado enquanto não há avaliação nenhuma
  const lastDetailQuery = useAssessment(lastAssessment?.id)

  const points: AssessmentPromptPoint[] = useMemo(() => {
    const byAssessment = groupCircumferencesByAssessment(circsQuery.data ?? [])
    return assessments.map((a) => ({
      assessedAt: a.assessed_at,
      protocolId: a.protocol_id,
      engineVersion: a.engine_version,
      weightKg: a.weight_kg,
      heightCm: a.height_cm,
      results: a.results as AssessmentResultSnapshot | null,
      circumferences: byAssessment.get(a.id) ?? [],
    }))
  }, [assessments, circsQuery.data])

  // Sem anamnese e sem avaliação não há material nenhum para cruzar.
  if (!anamneseRow && assessments.length === 0) return null

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Briefing para IA</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Anamnese e avaliações físicas num prompt só, para pedir a leitura cruzada antes de
          prescrever.
        </p>
      </div>
      <div>
        <CopyPromptButton
          label="Copiar briefing"
          build={() =>
            buildBriefingPrompt({
              subject: {
                fullName: subject.full_name,
                birthDate: subject.birth_date,
                sex: subject.sex,
              },
              anamnese: anamneseRow
                ? {
                    assessedAt: anamneseRow.assessed_at,
                    answers: parseAnswers(anamneseRow.payload),
                    liberacao: liberacaoFromRow(anamneseRow),
                  }
                : null,
              points,
              skinfolds: (lastDetailQuery.data?.skinfolds ?? []).map((sf) => ({
                site: sf.site,
                readings: [sf.reading_1, sf.reading_2, sf.reading_3].filter(
                  (v): v is number => v != null
                ),
              })),
            })
          }
          onCopied={() => {
            if (!organization) return
            void logExport({
              orgId: organization.id,
              userId: user?.id,
              action: 'AI_SUMMARY',
              tableName: 'assessments',
              rowId: null,
              subjectId: subject.id,
            })
          }}
        />
      </div>
    </section>
  )
}

function WorkoutSection({
  subjectId,
  subjectName,
  orgName,
}: {
  subjectId: string
  subjectName: string
  orgName: string
}) {
  const plansQuery = useWorkoutPlans(subjectId)
  const plans = plansQuery.data ?? []

  if (plansQuery.isError) {
    return <QueryError message="Não foi possível carregar os planos de treino." onRetry={() => void plansQuery.refetch()} />
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Treinos</h2>
        <Button asChild size="sm" variant="outline">
          <Link to={`/avaliados/${subjectId}/treinos/nova`}>Novo plano</Link>
        </Button>
      </div>
      {plansQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : plans.length > 0 ? (
        <ul className="divide-y rounded-md border bg-card">
          {plans.map((p) => (
            <li key={p.id} className="flex items-center gap-1 pr-2">
              {/* Duas linhas no celular: com nome, objetivo, duração e status
                  na mesma linha, sobrava meia dúzia de letras para o nome do
                  plano ("Mesociclo 3 — hip...") e o objetivo sumia cortado. */}
              <Link
                to={`/avaliados/${subjectId}/treinos/${p.id}`}
                className="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-2.5 text-sm hover:bg-accent sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="min-w-0 truncate">{p.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                  <span>
                    {goalLabel(p.goal)} · {p.weeks} {p.weeks === 1 ? 'semana' : 'semanas'}
                  </span>
                  {p.status === 'active' ? (
                    <Badge variant="secondary">Vigente</Badge>
                  ) : (
                    <Badge variant="secondary">{p.status === 'draft' ? 'Rascunho' : 'Arquivado'}</Badge>
                  )}
                </span>
              </Link>
              {/* Atalho para o treino vigente: ver como foi o treino era o
                  caminho mais percorrido do app e custava quatro cliques
                  (avaliados -> aluno -> plano -> execução). Só aparece no
                  vigente porque, desde a 0027, ele é único por aluno — no plano
                  arquivado a execução continua na tela do próprio plano. */}
              {p.status === 'active' ? (
                <Button asChild size="xs" variant="outline">
                  <Link
                    to={`/avaliados/${subjectId}/treinos/${p.id}/execucao`}
                    aria-label={`Execução do plano ${p.name}`}
                  >
                    <ClipboardList /> Execução
                  </Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum plano de treino ainda.</p>
      )}

      <WorkoutLinkCard subjectId={subjectId} subjectName={subjectName} orgName={orgName} />
    </section>
  )
}

function PosturalSection({ subjectId }: { subjectId: string }) {
  const consentQuery = useActiveConsent(subjectId)
  const sessionsQuery = useSessions(subjectId)
  const hasConsent = !!consentQuery.data

  if (consentQuery.isError || sessionsQuery.isError) {
    return (
      <QueryError
        message="Não foi possível confirmar o consentimento ou carregar as fotos posturais."
        onRetry={() => void Promise.all([consentQuery.refetch(), sessionsQuery.refetch()])}
      />
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Avaliação postural</h2>
        {hasConsent ? (
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to={`/avaliados/${subjectId}/postural/comparar`}>Comparar</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/avaliados/${subjectId}/postural/nova`}>Nova sessão</Link>
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            Registre o consentimento para coletar fotos
          </span>
        )}
      </div>
      {sessionsQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : sessionsQuery.data && sessionsQuery.data.length > 0 ? (
        <ul className="divide-y rounded-md border bg-card">
          {sessionsQuery.data.map((sess) => (
            <li key={sess.id}>
              <Link
                to={`/avaliados/${subjectId}/postural/${sess.id}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-accent"
              >
                <span>{formatDate(sess.taken_at)}</span>
                <span className="text-muted-foreground">ver fotos</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma sessão postural ainda.</p>
      )}
    </section>
  )
}

function AnamneseSection({ subjectId }: { subjectId: string }) {
  const { organization } = useOrganization()
  const consentQuery = useActiveConsent(subjectId)
  const anamnesesQuery = useAnamneses(subjectId)
  const intakesQuery = useSubjectIntakes(subjectId)
  const generate = useGenerateIntakeLink(subjectId)
  const cancel = useCancelIntake(subjectId)
  const hasConsent = !!consentQuery.data
  const items = anamnesesQuery.data ?? []
  const intakes = intakesQuery.data ?? []

  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  if (consentQuery.isError || anamnesesQuery.isError || intakesQuery.isError) {
    return (
      <QueryError
        message="Não foi possível confirmar o consentimento ou carregar a anamnese."
        onRetry={() => void Promise.all([
          consentQuery.refetch(),
          anamnesesQuery.refetch(),
          intakesQuery.refetch(),
        ])}
      />
    )
  }

  async function handleGenerate() {
    setGenError(null)
    setCopied(false)
    if (!organization) return
    try {
      const res = await generate.mutateAsync({ subjectId, orgId: organization.id })
      setGeneratedUrl(res.url)
    } catch (e) {
      setGenError(normalizeDbError(e))
    }
  }

  async function copyLink() {
    if (!generatedUrl) return
    try {
      await navigator.clipboard.writeText(generatedUrl)
      setCopied(true)
    } catch {
      // clipboard bloqueado: o campo fica selecionável para copiar manualmente
    }
  }

  const waHref = generatedUrl
    ? `https://wa.me/?text=${encodeURIComponent(
        `Olá! Preencha sua anamnese para começarmos: ${generatedUrl}`
      )}`
    : '#'

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold whitespace-nowrap">Anamnese e triagem</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerate}
            disabled={generate.isPending || !organization}
          >
            <Send /> {generate.isPending ? 'Gerando...' : 'Enviar link'}
          </Button>
          {hasConsent ? (
            <Button asChild size="sm" variant="outline">
              <Link to={`/avaliados/${subjectId}/anamnese/nova`}>Nova anamnese</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {genError ? <p role="alert" className="text-sm text-destructive">{genError}</p> : null}
      {cancel.error ? (
        <p role="alert" className="text-sm text-destructive">
          {normalizeDbError(cancel.error)}
        </p>
      ) : null}

      {generatedUrl ? (
        <div className="space-y-2 rounded-lg border bg-card p-4 text-sm">
          <p className="font-medium">Link gerado. Envie para o aluno responder.</p>
          <input
            readOnly
            value={generatedUrl}
            onFocus={(e) => e.currentTarget.select()}
            className={controlClass}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copyLink}>
              <Copy /> {copied ? 'Copiado!' : 'Copiar'}
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={waHref} target="_blank" rel="noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setGeneratedUrl(null)}>
              Fechar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Válido por 7 dias e de uso único. O link fica disponível na lista abaixo (neste
            aparelho) enquanto o convite estiver ativo.
          </p>
        </div>
      ) : null}

      {intakes.length > 0 ? (
        <ul className="divide-y rounded-md border bg-card">
          {intakes.map((it) =>
            it.status === 'submitted' ? (
              <li
                key={it.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <Badge variant="warn">Aguardando revisão</Badge>
                <Button asChild size="sm">
                  <Link to={`/avaliados/${subjectId}/anamnese/intake/${it.id}`}>Revisar</Link>
                </Button>
              </li>
            ) : (
              <li
                key={it.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5 text-sm"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge variant="secondary">Aguardando o aluno</Badge>
                  <span className="text-xs text-muted-foreground">
                    gerado {formatDateTime(it.created_at)} · expira {formatDate(it.expires_at)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <IntakeLinkButtons
                    intakeId={it.id}
                    waMessage="Olá! Preencha sua anamnese para começarmos:"
                  />
                  <button
                    onClick={() => cancel.mutate(it.id)}
                    disabled={cancel.isPending}
                    className="text-xs text-destructive hover:underline disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </span>
              </li>
            )
          )}
        </ul>
      ) : null}

      {anamnesesQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : items.length > 0 ? (
        <ul className="divide-y rounded-md border bg-card">
          {items.map((an) => {
            // O badge mostra o estado ATUAL: a triagem cruzada com o parecer
            // médico registrado sobre ela.
            const answers = parseAnswers(an.payload)
            const alerta = anamneseAlerta({
              gate: computeGate(answers),
              liberacao: liberacaoFromRow(an),
              declaracao: declaracaoFromAnswers(answers),
              assessedAt: an.assessed_at,
              updatedAt: an.updated_at,
            })
            return (
              <li key={an.id}>
                <Link
                  to={`/avaliados/${subjectId}/anamnese/${an.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent"
                >
                  <span>{formatDate(an.assessed_at)}</span>
                  <Badge variant={alerta.badge.variant}>{alerta.badge.label}</Badge>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : intakes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma anamnese ainda.</p>
      ) : null}
    </section>
  )
}

function AssessmentsSection({ subjectId }: { subjectId: string }) {
  const consentQuery = useActiveConsent(subjectId)
  const assessmentsQuery = useAssessments(subjectId)
  const { organization } = useOrganization()
  const { user } = useAuth()
  const hasConsent = !!consentQuery.data
  const assessments = assessmentsQuery.data ?? []

  if (consentQuery.isError || assessmentsQuery.isError) {
    return (
      <QueryError
        message="Não foi possível confirmar o consentimento ou carregar as avaliações."
        onRetry={() => void Promise.all([consentQuery.refetch(), assessmentsQuery.refetch()])}
      />
    )
  }

  function exportCsv(dialect: CsvDialect) {
    const csv = buildAssessmentsCsv(assessments.map(assessmentCsvRecord), dialect)
    downloadBlob(csvBlob(csv), `avaliacoes-${dialect}.csv`)
    if (organization && user) {
      void logExport({
        orgId: organization.id,
        userId: user.id,
          action: 'EXPORT_CSV',
          tableName: 'assessments',
          rowId: null,
          subjectId,
        })
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Avaliações</h2>
        {hasConsent ? (
          <Button asChild size="sm" variant="outline">
            <Link to={`/avaliados/${subjectId}/avaliacoes/nova`}>Nova avaliação</Link>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            Registre o consentimento para avaliar
          </span>
        )}
      </div>
      {assessmentsQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : assessments.length > 0 ? (
        <>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="flex-1">
              <Link to={`/avaliados/${subjectId}/evolucao`}>
                <TrendingUp /> Evolução e gráficos
              </Link>
            </Button>
            {assessments.length >= 2 ? (
              <Button asChild variant="outline" size="sm" className="flex-1">
                <Link to={`/avaliados/${subjectId}/comparar`}>Comparar avaliações</Link>
              </Button>
            ) : null}
          </div>
          <ul className="divide-y rounded-md border bg-card">
            {assessments.map((a) => {
              const res = a.results as { bodyFatPct?: number } | null
              return (
                <li key={a.id}>
                  <Link
                    to={`/avaliados/${subjectId}/avaliacoes/${a.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-accent"
                  >
                    <span>
                      {formatDate(a.assessed_at)}{' '}
                      <span className="text-muted-foreground">
                        · {protocolLabel(a.protocol_id)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {res?.bodyFatPct != null ? `${res.bodyFatPct.toFixed(1).replace('.', ',')}%` : '—'}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Exportar histórico:</span>
            <button onClick={() => exportCsv('intl')} className="text-primary hover:underline">
              CSV
            </button>
            <button onClick={() => exportCsv('br')} className="text-primary hover:underline">
              Excel BR
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma avaliação ainda.</p>
      )}
    </section>
  )
}

function ConsentSection({
  subjectId,
  orgId,
  controllerName,
  requiresGuardian,
}: {
  subjectId: string
  orgId: string
  controllerName: string | null
  requiresGuardian: boolean
}) {
  const { user } = useAuth()
  const consentQuery = useActiveConsent(subjectId)
  const grant = useGrantConsent(subjectId)
  const revoke = useRevokeConsent(subjectId)
  const [signerKind, setSignerKind] = useState<SignerKind>(
    requiresGuardian ? 'responsavel' : 'titular'
  )
  const [signerName, setSignerName] = useState('')
  const [showText, setShowText] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  if (consentQuery.isPending) {
    return (
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Consentimento</h2>
        <p className="text-sm text-muted-foreground">Carregando consentimento...</p>
      </section>
    )
  }

  if (consentQuery.isError) {
    return (
      <QueryError
        message="Não foi possível confirmar se existe consentimento vigente. Nenhuma ação foi liberada."
        onRetry={() => void consentQuery.refetch()}
      />
    )
  }

  const active = consentQuery.data
  const revokeError = revoke.error as Error | null
  const grantError = grant.error as Error | null

  if (active) {
    return (
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          Consentimento <Badge variant="success">Vigente</Badge>
        </h2>
        <div className="space-y-3 rounded-lg border bg-card p-4 text-sm">
          <p>A coleta de dados está liberada.</p>
          <p className="text-muted-foreground">
            Aceito por {active.signer_name} (
            {active.signer_kind === 'responsavel' ? 'responsável legal' : 'titular'}) em{' '}
            {formatDateTime(active.granted_at)}, versão {active.consent_version} do termo.
          </p>
          {revokeError ? <p role="alert" className="text-destructive">{normalizeDbError(revokeError)}</p> : null}
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={revoke.isPending}
            onClick={() => setConfirmRevoke(true)}
          >
            {revoke.isPending ? 'Revogando...' : 'Revogar consentimento'}
          </Button>
        </div>
        <ConfirmDialog
          open={confirmRevoke}
          title="Revogar o consentimento?"
          description="O sistema deixa de aceitar novas avaliações, anamneses e fotos neste cadastro até que um novo consentimento seja registrado. O que já foi registrado continua guardado."
          confirmLabel="Revogar"
          onConfirm={() => {
            setConfirmRevoke(false)
            revoke.mutate(active.id)
          }}
          onCancel={() => setConfirmRevoke(false)}
        />
      </section>
    )
  }

  const collectedBy = user?.id ?? ''
  const canSubmit =
    accepted && signerName.trim().length >= 3 && orgId.length > 0 && collectedBy.length > 0

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Consentimento</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sem consentimento vigente. Sem ele, o sistema não permite registrar avaliações.
        </p>
      </div>
      <div className="space-y-4 rounded-lg border bg-card p-4 text-sm">
        <button
          type="button"
          onClick={() => setShowText((v) => !v)}
          className="text-primary underline-offset-4 hover:underline"
        >
          {showText ? 'Ocultar termo' : 'Ler o termo de consentimento'}
        </button>
        {showText ? (
          <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
            {consentText(controllerName)}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="consent-signer-kind">Quem assina</Label>
            <select
              id="consent-signer-kind"
              value={signerKind}
              onChange={(e) => setSignerKind(e.target.value as SignerKind)}
              className={controlClass}
              disabled={requiresGuardian}
            >
              <option value="titular">O próprio titular</option>
              <option value="responsavel">Responsável legal</option>
            </select>
            {requiresGuardian ? (
              <p className="text-xs text-muted-foreground">
                Menor de idade: o responsável legal deve consentir.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="consent-signer-name">Nome de quem assina</Label>
            <Input
              id="consent-signer-name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Nome completo"
            />
          </div>
        </div>

        <label className="flex items-start gap-2 rounded-md border p-3">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          <span>
            Confirmo que a pessoa indicada leu o termo exibido e manifestou consentimento livre,
            informado e inequívoco para este tratamento.
          </span>
        </label>

        {grantError ? <p role="alert" className="text-destructive">{normalizeDbError(grantError)}</p> : null}

        <Button
          size="sm"
          disabled={!canSubmit || grant.isPending}
          onClick={() =>
            grant.mutate({
              subjectId,
              orgId,
              collectedBy,
              controllerName,
              signerKind,
              signerName,
            })
          }
        >
          {grant.isPending ? 'Registrando...' : 'Registrar consentimento'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Ao registrar, guardamos a versão do termo, o hash do texto exibido, quem assinou e
          quando.
        </p>
      </div>
    </section>
  )
}
