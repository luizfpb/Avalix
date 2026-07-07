import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useSubject } from '../features/subjects/hooks'
import { useAssessment, useAssessments } from '../features/assessment/hooks'
import { buildComparison, type ComparePoint, type CompareRow } from '../features/assessment/compare'
import type { AssessmentResultSnapshot } from '../features/assessment/result'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { controlClass } from '@/lib/ui'

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

// "Antes → depois" entre duas avaliações (P1 da auditoria v2.0). Defaults:
// da penúltima pra última. O cálculo é puro (buildComparison, testado).
export default function AvaliacoesComparar() {
  const { id } = useParams()
  const subjectQuery = useSubject(id)
  const assessmentsQuery = useAssessments(id)

  // cronológica ascendente pra "de → para" fazer sentido
  const assessments = useMemo(
    () =>
      [...(assessmentsQuery.data ?? [])].sort((a, b) => a.assessed_at.localeCompare(b.assessed_at)),
    [assessmentsQuery.data]
  )

  const [fromId, setFromId] = useState<string | null>(null)
  const [toId, setToId] = useState<string | null>(null)

  const back = (
    <Link to={`/avaliados/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
      ← Voltar
    </Link>
  )

  if (subjectQuery.isPending || assessmentsQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }
  if (assessments.length < 2) {
    return (
      <div className="space-y-3">
        {back}
        <h1 className="text-xl font-semibold">Comparar avaliações</h1>
        <p className="text-sm text-muted-foreground">
          A comparação aparece a partir da 2ª avaliação registrada.
        </p>
      </div>
    )
  }

  const effectiveFrom = fromId ?? assessments[assessments.length - 2].id
  const effectiveTo = toId ?? assessments[assessments.length - 1].id

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        {back}
        <h1 className="mt-2 text-xl font-semibold">Comparar avaliações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {subjectQuery.data?.full_name} · {assessments.length} avaliações
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>De (antes)</Label>
          <select
            className={controlClass}
            value={effectiveFrom}
            onChange={(e) => setFromId(e.target.value)}
          >
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {formatDate(a.assessed_at)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Para (depois)</Label>
          <select
            className={controlClass}
            value={effectiveTo}
            onChange={(e) => setToId(e.target.value)}
          >
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {formatDate(a.assessed_at)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ComparisonBody fromId={effectiveFrom} toId={effectiveTo} />
    </div>
  )
}

function toPoint(data: {
  assessment: { assessed_at: string; weight_kg: number; height_cm: number; results: unknown } | null
  circumferences: { site: string; value_cm: number }[]
}): ComparePoint | null {
  if (!data.assessment) return null
  return {
    assessedAt: data.assessment.assessed_at,
    weightKg: data.assessment.weight_kg,
    heightCm: data.assessment.height_cm,
    results: data.assessment.results as AssessmentResultSnapshot | null,
    circumferences: data.circumferences.map((c) => ({ site: c.site, valueCm: c.value_cm })),
  }
}

function ComparisonBody({ fromId, toId }: { fromId: string; toId: string }) {
  const fromQuery = useAssessment(fromId)
  const toQuery = useAssessment(toId)

  if (fromQuery.isPending || toQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Carregando comparação...</p>
  }
  const from = fromQuery.data ? toPoint(fromQuery.data) : null
  const to = toQuery.data ? toPoint(toQuery.data) : null
  if (!from || !to) {
    return <p className="text-sm text-destructive">Não foi possível carregar as avaliações.</p>
  }
  if (fromId === toId) {
    return <p className="text-sm text-muted-foreground">Escolha duas avaliações diferentes.</p>
  }

  const cmp = buildComparison(from, to)
  const days = Math.round(
    (new Date(to.assessedAt).getTime() - new Date(from.assessedAt).getTime()) / 86400000
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Composição e medidas gerais</CardTitle>
          <CardDescription>
            {formatDate(from.assessedAt)} → {formatDate(to.assessedAt)}
            {Number.isFinite(days) && days !== 0 ? ` · ${Math.abs(days)} dias` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompareTable rows={cmp.metrics} fromDate={from.assessedAt} toDate={to.assessedAt} />
        </CardContent>
      </Card>

      {cmp.circumferences.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Circunferências (cm)</CardTitle>
          </CardHeader>
          <CardContent>
            <CompareTable
              rows={cmp.circumferences}
              fromDate={from.assessedAt}
              toDate={to.assessedAt}
            />
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Δ positivo = aumento entre as duas datas. A cor indica melhora/piora apenas nas métricas
        com direção clara (% de gordura, massas); nas demais o objetivo depende do plano.
      </p>
    </div>
  )
}

function CompareTable({
  rows,
  fromDate,
  toDate,
}: {
  rows: CompareRow[]
  fromDate: string
  toDate: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="py-1.5 pr-2 text-left font-medium">Métrica</th>
            <th className="px-2 py-1.5 text-right font-medium">{formatDate(fromDate)}</th>
            <th className="px-2 py-1.5 text-right font-medium">{formatDate(toDate)}</th>
            <th className="py-1.5 pl-2 text-right font-medium">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const fmt = (v: number | null) => (v != null ? v.toFixed(r.decimals) : '—')
            let deltaClass = 'text-muted-foreground'
            if (r.delta != null && r.delta !== 0 && r.betterWhen) {
              const improved = r.betterWhen === 'up' ? r.delta > 0 : r.delta < 0
              deltaClass = improved ? 'text-success' : 'text-warning'
            }
            const arrow = r.delta == null || r.delta === 0 ? '–' : r.delta > 0 ? '▲' : '▼'
            return (
              <tr key={r.key} className="border-b last:border-0">
                <td className="py-1.5 pr-2 text-muted-foreground">{r.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.from)}</td>
                <td className="px-2 py-1.5 text-right font-medium tabular-nums">{fmt(r.to)}</td>
                <td className={`py-1.5 pl-2 text-right font-semibold tabular-nums ${deltaClass}`}>
                  {r.delta != null ? (
                    <>
                      {arrow} {Math.abs(r.delta).toFixed(r.decimals)}
                      {r.unit ? ` ${r.unit}` : ''}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
