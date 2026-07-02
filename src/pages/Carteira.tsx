import { useMemo } from 'react'
import { Link } from 'react-router'
import { useOrganization } from '../features/organization/context'
import { useSubjects } from '../features/subjects/hooks'
import { useLastAssessmentBySubject } from '../features/assessment/hooks'
import { useOrgActivePlans, useOrgWorkoutLogSummary } from '../features/workout/hooks'
import { buildCarteira } from '../features/workout/carteira'
import { relativeDayLabel } from '../lib/reminders'
import { subjectTermLabels } from '../lib/subjectTerm'
import { Badge } from '@/components/ui/badge'

export default function Carteira() {
  const { organization } = useOrganization()
  const orgId = organization?.id
  const labels = subjectTermLabels(organization?.subject_term)
  const subjectsQ = useSubjects(orgId)
  const lastAssessQ = useLastAssessmentBySubject(orgId)
  const plansQ = useOrgActivePlans(orgId)
  const logsQ = useOrgWorkoutLogSummary(orgId)

  const now = useMemo(() => new Date(), [])
  const rows = useMemo(
    () =>
      buildCarteira({
        subjects: subjectsQ.data ?? [],
        lastAssessment: lastAssessQ.data ?? {},
        activePlans: plansQ.data ?? [],
        logSummary: logsQ.data ?? {},
        now,
      }),
    [subjectsQ.data, lastAssessQ.data, plansQ.data, logsQ.data, now]
  )

  const reassessCount = rows.filter((r) => r.reassessDue).length
  const quietCount = rows.filter((r) => r.quiet).length
  const loading = subjectsQ.isPending || plansQ.isPending || logsQ.isPending

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Carteira</h1>
        <p className="text-sm text-muted-foreground">
          {labels.plural} ativos de relance · ordenados por urgência.
        </p>
      </div>

      {!loading && rows.length > 0 ? (
        <div className="flex flex-wrap gap-4 text-sm">
          <span>
            <b className="tabular-nums">{rows.length}</b>{' '}
            <span className="text-muted-foreground">ativos</span>
          </span>
          <span>
            <b className="tabular-nums">{reassessCount}</b>{' '}
            <span className="text-muted-foreground">para reavaliar</span>
          </span>
          <span>
            <b className="tabular-nums">{quietCount}</b>{' '}
            <span className="text-muted-foreground">sumidos</span>
          </span>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum {labels.singular} ativo.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.subjectId}>
              <Link
                to={`/avaliados/${r.subjectId}`}
                className="block rounded-md border bg-card p-3 transition-colors hover:bg-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{r.name}</span>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {r.reassessDue ? <Badge variant="warn">Reavaliar</Badge> : null}
                    {r.quiet ? <Badge variant="warn">Sumido</Badge> : null}
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className="min-w-0">
                    <span className="block text-muted-foreground">Avaliação</span>
                    <span className="block truncate">
                      {r.lastAssessedAt ? relativeDayLabel(r.lastAssessedAt, now) : 'nunca'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="block text-muted-foreground">Plano ativo</span>
                    <span className="block truncate">{r.planName ?? '—'}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="block text-muted-foreground">Último treino</span>
                    <span className="block truncate">
                      {r.lastLogAt ? relativeDayLabel(r.lastLogAt, now) : r.planName ? 'nenhum' : '—'}
                    </span>
                  </div>
                </div>

                {r.adherencePct != null ? (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded bg-muted">
                      <div
                        className={`h-1.5 rounded ${r.adherencePct < 0.5 ? 'bg-warning' : 'bg-primary'}`}
                        style={{ width: `${Math.round(r.adherencePct * 100)}%` }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                      {Math.round(r.adherencePct * 100)}%
                    </span>
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
