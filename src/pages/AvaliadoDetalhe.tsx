import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'
import { useSubject } from '../features/subjects/hooks'
import { useAssessments } from '../features/assessment/hooks'
import { useAnamneses } from '../features/anamnesis/hooks'
import {
  useSubjectIntakes,
  useGenerateIntakeLink,
  useCancelIntake,
} from '../features/anamnesis/intakeHooks'
import { useWorkoutPlans } from '../features/workout/hooks'
import { goalLabel } from '../features/workout/volume'
import { protocolLabel } from '../features/assessment/protocols'
import { useSessions } from '../features/posture/hooks'
import { assessmentCsvRecord, buildAssessmentsCsv, type CsvDialect } from '../features/reports/csv'
import { csvBlob, downloadBlob } from '../features/reports/download'
import { logExport } from '../features/reports/audit'
import {
  useActiveConsent,
  useGrantConsent,
  useRevokeConsent,
} from '../features/consent/hooks'
import { consentText } from '../features/consent/text'
import type { SignerKind } from '../features/consent/api'
import { Pencil, TrendingUp, CalendarPlus, Send, Copy, MessageCircle } from 'lucide-react'
import { subjectTermLabels } from '../lib/subjectTerm'
import { ageFromBirthDate } from '../lib/age'
import { initials } from '../lib/initials'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'

import { controlClass } from '@/lib/ui'
import { normalizeDbError } from '../lib/errors'

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR')
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="block">{value}</span>
    </div>
  )
}

export default function AvaliadoDetalhe() {
  const { id } = useParams()
  const { organization } = useOrganization()
  const labels = subjectTermLabels(organization?.subject_term)
  const subjectQuery = useSubject(id)

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

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link to="/avaliados" className="text-sm text-muted-foreground hover:text-foreground">
          ← {labels.pluralCap}
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {initials(s.full_name)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{s.full_name}</h1>
              <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                <span>{age !== null ? `${age} anos` : 'idade -'}</span>
                {!s.is_active ? <Badge variant="secondary">Inativo</Badge> : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Info label="Idade" value={age !== null ? `${age} anos` : '-'} />
          <Info label="Sexo" value={s.sex === 'F' ? 'Feminino' : 'Masculino'} />
          <Info label="Nascimento" value={formatDate(s.birth_date)} />
          <Info label="Altura" value={s.height_cm != null ? `${s.height_cm} cm` : '-'} />
          <Info label="Telefone" value={s.phone ?? '-'} />
          <Info label="E-mail" value={s.email ?? '-'} />
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
        </CardContent>
      </Card>

      <ConsentSection
        subjectId={s.id}
        orgId={organization?.id ?? ''}
        controllerName={organization?.name ?? null}
      />

      <AnamneseSection subjectId={s.id} />

      <AssessmentsSection subjectId={s.id} />

      <WorkoutSection subjectId={s.id} />

      <PosturalSection subjectId={s.id} />
    </div>
  )
}

function WorkoutSection({ subjectId }: { subjectId: string }) {
  const plansQuery = useWorkoutPlans(subjectId)
  const plans = plansQuery.data ?? []

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Treinos</h2>
        <Button asChild size="sm">
          <Link to={`/avaliados/${subjectId}/treinos/nova`}>Novo plano</Link>
        </Button>
      </div>
      {plansQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : plans.length > 0 ? (
        <ul className="divide-y rounded-md border bg-card">
          {plans.map((p) => (
            <li key={p.id}>
              <Link
                to={`/avaliados/${subjectId}/treinos/${p.id}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-accent"
              >
                <span className="min-w-0 truncate">
                  {p.name}{' '}
                  <span className="text-muted-foreground">
                    · {goalLabel(p.goal)} · {p.weeks} {p.weeks === 1 ? 'sem' : 'sems'}
                  </span>
                </span>
                {p.status !== 'active' ? (
                  <Badge variant="secondary">{p.status === 'draft' ? 'Rascunho' : 'Arquivado'}</Badge>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum plano de treino ainda.</p>
      )}
    </section>
  )
}

function PosturalSection({ subjectId }: { subjectId: string }) {
  const consentQuery = useActiveConsent(subjectId)
  const sessionsQuery = useSessions(subjectId)
  const hasConsent = !!consentQuery.data

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Avaliação postural</h2>
        {hasConsent ? (
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to={`/avaliados/${subjectId}/postural/comparar`}>Comparar</Link>
            </Button>
            <Button asChild size="sm">
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
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Anamnese e triagem</h2>
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
            <Button asChild size="sm">
              <Link to={`/avaliados/${subjectId}/anamnese/nova`}>Nova anamnese</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {genError ? <p className="text-sm text-destructive">{genError}</p> : null}

      {generatedUrl ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="space-y-2 py-3 text-sm">
            <p className="font-medium">Link gerado — envie para o aluno responder</p>
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
              Válido por 7 dias e de uso único. Por segurança, o link não é exibido de novo — se
              precisar, gere outro.
            </p>
          </CardContent>
        </Card>
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
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">Aguardando o aluno</Badge>
                  <span className="text-muted-foreground">expira {formatDate(it.expires_at)}</span>
                </span>
                <button
                  onClick={() => cancel.mutate(it.id)}
                  disabled={cancel.isPending}
                  className="text-xs text-destructive hover:underline disabled:opacity-50"
                >
                  Cancelar
                </button>
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
            const ok = an.liberado && !an.flag_encaminhamento
            return (
              <li key={an.id}>
                <Link
                  to={`/avaliados/${subjectId}/anamnese/${an.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent"
                >
                  <span>{formatDate(an.assessed_at)}</span>
                  <Badge variant={ok ? 'success' : 'warn'}>
                    {ok ? 'Liberado' : 'Encaminhamento'}
                  </Badge>
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
      })
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Avaliações</h2>
        {hasConsent ? (
          <Button asChild size="sm">
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
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to={`/avaliados/${subjectId}/evolucao`}>
              <TrendingUp /> Ver evolução e gráficos
            </Link>
          </Button>
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
                      {res?.bodyFatPct != null ? `${res.bodyFatPct.toFixed(1)}%` : '—'}
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
}: {
  subjectId: string
  orgId: string
  controllerName: string | null
}) {
  const { user } = useAuth()
  const consentQuery = useActiveConsent(subjectId)
  const grant = useGrantConsent(subjectId)
  const revoke = useRevokeConsent(subjectId)
  const [signerKind, setSignerKind] = useState<SignerKind>('titular')
  const [signerName, setSignerName] = useState('')
  const [showText, setShowText] = useState(false)

  if (consentQuery.isPending) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          Carregando consentimento...
        </CardContent>
      </Card>
    )
  }

  const active = consentQuery.data
  const revokeError = revoke.error as Error | null
  const grantError = grant.error as Error | null

  if (active) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Consentimento <Badge variant="success">Vigente</Badge>
          </CardTitle>
          <CardDescription>A coleta de dados está liberada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Aceito por {active.signer_name} ({active.signer_kind}) em{' '}
            {formatDateTime(active.granted_at)} · versão {active.consent_version}
          </p>
          {revokeError ? <p className="text-destructive">{revokeError.message}</p> : null}
          <Button
            variant="destructive"
            size="sm"
            disabled={revoke.isPending}
            onClick={() => revoke.mutate(active.id)}
          >
            {revoke.isPending ? 'Revogando...' : 'Revogar consentimento'}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const collectedBy = user?.id ?? ''
  const canSubmit = signerName.trim().length >= 3 && orgId.length > 0 && collectedBy.length > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Consentimento</CardTitle>
        <CardDescription>
          Sem consentimento vigente. Sem ele, o sistema não permite registrar avaliações.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
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
            <Label>Quem assina</Label>
            <select
              value={signerKind}
              onChange={(e) => setSignerKind(e.target.value as SignerKind)}
              className={controlClass}
            >
              <option value="titular">O próprio titular</option>
              <option value="responsavel">Responsável legal</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Nome de quem assina</Label>
            <Input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Nome completo"
            />
          </div>
        </div>

        {grantError ? <p className="text-destructive">{grantError.message}</p> : null}

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
      </CardContent>
    </Card>
  )
}
