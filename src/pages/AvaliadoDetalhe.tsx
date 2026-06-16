import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'
import { useSubject } from '../features/subjects/hooks'
import { useAssessments } from '../features/assessment/hooks'
import { protocolLabel } from '../features/assessment/protocols'
import { useSessions } from '../features/posture/hooks'
import {
  useActiveConsent,
  useGrantConsent,
  useRevokeConsent,
} from '../features/consent/hooks'
import { consentText } from '../features/consent/text'
import type { SignerKind } from '../features/consent/api'
import { subjectTermLabels } from '../lib/subjectTerm'
import { ageFromBirthDate } from '../lib/age'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'

const controlClass =
  'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to="/avaliados" className="text-sm text-muted-foreground hover:text-foreground">
            ← {labels.pluralCap}
          </Link>
          <h1 className="mt-2 text-xl font-semibold">
            {s.full_name}
            {!s.is_active ? (
              <span className="ml-2 rounded bg-muted px-2 py-0.5 align-middle text-xs text-muted-foreground">
                Inativo
              </span>
            ) : null}
          </h1>
        </div>
        <Button asChild variant="outline">
          <Link to={`/avaliados/${s.id}/editar`}>Editar</Link>
        </Button>
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

      <AssessmentsSection subjectId={s.id} />

      <PosturalSection subjectId={s.id} />
    </div>
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
          <Button asChild size="sm">
            <Link to={`/avaliados/${subjectId}/postural/nova`}>Nova sessão</Link>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            Registre o consentimento para coletar fotos
          </span>
        )}
      </div>
      {sessionsQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : sessionsQuery.data && sessionsQuery.data.length > 0 ? (
        <ul className="divide-y rounded-md border">
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

function AssessmentsSection({ subjectId }: { subjectId: string }) {
  const consentQuery = useActiveConsent(subjectId)
  const assessmentsQuery = useAssessments(subjectId)
  const hasConsent = !!consentQuery.data

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
      ) : assessmentsQuery.data && assessmentsQuery.data.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {assessmentsQuery.data.map((a) => {
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
          <CardTitle className="text-base">Consentimento</CardTitle>
          <CardDescription>Vigente. A coleta de dados está liberada.</CardDescription>
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
