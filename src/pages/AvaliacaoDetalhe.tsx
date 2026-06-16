import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAssessment } from '../features/assessment/hooks'
import { useSubject } from '../features/subjects/hooks'
import { useOrganization } from '../features/organization/context'
import { useAuth } from '../features/auth/context'
import { downloadBlob } from '../features/reports/download'
import { logExport } from '../features/reports/audit'
import { protocolLabel } from '../features/assessment/protocols'
import { SKINFOLD_LABELS, CIRCUMFERENCE_LABELS } from '../features/assessment/sites'
import type { AssessmentResultSnapshot } from '../features/assessment/result'
import type { SkinfoldSite, CircumferenceSite } from '../features/assessment/protocols'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="block text-base font-semibold">{value}</span>
    </div>
  )
}

export default function AvaliacaoDetalhe() {
  const { id, assessmentId } = useParams()
  const query = useAssessment(assessmentId)
  const subjectQuery = useSubject(id)
  const { organization } = useOrganization()
  const { user } = useAuth()
  const [pdfBusy, setPdfBusy] = useState(false)

  if (query.isPending) return <p className="text-sm text-muted-foreground">Carregando...</p>
  if (query.isError || !query.data.assessment) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Não foi possível carregar a avaliação.</p>
        <Button asChild variant="outline">
          <Link to={`/avaliados/${id}`}>Voltar</Link>
        </Button>
      </div>
    )
  }

  const { assessment, skinfolds, circumferences } = query.data
  const result = assessment.results as AssessmentResultSnapshot | null

  async function handlePdf() {
    setPdfBusy(true)
    try {
      const { generateAssessmentPdf } = await import('../features/reports/assessmentPdf')
      const blob = await generateAssessmentPdf({
        orgName: organization?.name ?? '',
        subjectName: subjectQuery.data?.full_name ?? '',
        assessment,
        skinfolds,
        circumferences,
      })
      downloadBlob(blob, `avaliacao-${assessment.assessed_at}.pdf`)
      if (organization && user) {
        void logExport({
          orgId: organization.id,
          userId: user.id,
          action: 'PDF_REPORT',
          tableName: 'assessments',
          rowId: assessment.id,
        })
      }
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            to={`/avaliados/${id}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Voltar
          </Link>
          <h1 className="mt-2 text-xl font-semibold">
            Avaliação de {formatDate(assessment.assessed_at)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {protocolLabel(assessment.protocol_id)} · {assessment.weight_kg} kg ·{' '}
            {assessment.height_cm} cm
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handlePdf} disabled={pdfBusy}>
          {pdfBusy ? 'Gerando...' : 'Baixar PDF'}
        </Button>
      </div>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultado</CardTitle>
            <CardDescription>motor {result.engineVersion}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="% Gordura" value={`${result.bodyFatPct.toFixed(1)}%`} />
            {result.bodyDensity != null ? (
              <Stat label="Densidade" value={result.bodyDensity.toFixed(4)} />
            ) : null}
            <Stat label="Massa gorda" value={`${result.fatMassKg.toFixed(1)} kg`} />
            <Stat label="Massa magra" value={`${result.leanMassKg.toFixed(1)} kg`} />
            {result.conversions ? (
              <p className="col-span-2 text-xs text-muted-foreground sm:col-span-4">
                Siri {result.conversions.siri.toFixed(1)}% · Brozek{' '}
                {result.conversions.brozek.toFixed(1)}% (principal: Siri)
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {skinfolds.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dobras cutâneas (mm)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {skinfolds.map((s) => {
              const vals = [s.reading_1, s.reading_2, s.reading_3].filter(
                (v): v is number => v != null
              )
              const mean = vals.reduce((a, b) => a + b, 0) / vals.length
              return (
                <div key={s.id} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {SKINFOLD_LABELS[s.site as SkinfoldSite] ?? s.site}
                  </span>
                  <span>
                    {vals.join(' / ')} <span className="text-muted-foreground">(méd {mean.toFixed(1)})</span>
                  </span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ) : null}

      {circumferences.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Circunferências (cm)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {circumferences.map((c) => (
              <div key={c.id} className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  {CIRCUMFERENCE_LABELS[c.site as CircumferenceSite] ?? c.site}
                </span>
                <span>{c.value_cm}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {assessment.notes ? (
        <div className="text-sm">
          <span className="block text-xs text-muted-foreground">Observações</span>
          <p className="whitespace-pre-wrap">{assessment.notes}</p>
        </div>
      ) : null}
    </div>
  )
}
