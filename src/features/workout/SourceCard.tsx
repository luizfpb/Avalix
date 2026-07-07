import { useAssessments } from '../assessment/hooks'
import { useSessions } from '../posture/hooks'
import { classifyBodyFat } from '../assessment/bodyFat'
import type { AssessmentResultSnapshot } from '../assessment/result'
import type { EditorPlan } from './builder'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { controlClass } from '@/lib/ui'

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

// "Base da prescrição": amarra o plano a uma avaliação física/postural de
// origem e mostra os achados de composição (extraído de TreinoNovo na v2.0,
// sem mudança de comportamento).
export function SourceCard({
  subjectId,
  assessmentId,
  sessionId,
  onChange,
}: {
  subjectId: string
  assessmentId: string | null
  sessionId: string | null
  onChange: (patch: Partial<EditorPlan>) => void
}) {
  const assessmentsQ = useAssessments(subjectId)
  const sessionsQ = useSessions(subjectId)
  const assessments = assessmentsQ.data ?? []
  const sessions = sessionsQ.data ?? []
  const selected = assessments.find((a) => a.id === assessmentId)
  const r = (selected?.results ?? null) as AssessmentResultSnapshot | null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Base da prescrição <span className="font-normal text-muted-foreground">· opcional</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Avaliação física de origem</Label>
            <select
              className={controlClass}
              value={assessmentId ?? ''}
              onChange={(e) => onChange({ sourceAssessmentId: e.target.value || null })}
            >
              <option value="">Nenhuma</option>
              {assessments.map((a) => {
                const rr = a.results as { bodyFatPct?: number } | null
                return (
                  <option key={a.id} value={a.id}>
                    {fmtDate(a.assessed_at)}
                    {rr?.bodyFatPct != null ? ` · ${rr.bodyFatPct.toFixed(1)}% gordura` : ''}
                  </option>
                )
              })}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Avaliação postural de origem</Label>
            <select
              className={controlClass}
              value={sessionId ?? ''}
              onChange={(e) => onChange({ sourcePostureSessionId: e.target.value || null })}
            >
              <option value="">Nenhuma</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {fmtDate(s.taken_at)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {r && selected ? (
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">
              Achados da avaliação de {fmtDate(selected.assessed_at)} — orientam a prescrição
            </p>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span>
                <span className="text-muted-foreground">% gordura </span>
                <b>{r.bodyFatPct.toFixed(1)}%</b>{' '}
                <span className="text-muted-foreground">
                  ({classifyBodyFat(r.inputs.sex, r.bodyFatPct).label})
                </span>
              </span>
              <span>
                <span className="text-muted-foreground">Massa magra </span>
                <b>{r.leanMassKg.toFixed(1)} kg</b>
              </span>
              <span>
                <span className="text-muted-foreground">Massa gorda </span>
                <b>{r.fatMassKg.toFixed(1)} kg</b>
              </span>
              <span>
                <span className="text-muted-foreground">Peso </span>
                <b>{selected.weight_kg} kg</b>
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
