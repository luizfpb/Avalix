import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { GitCompareArrows } from 'lucide-react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { useSubject } from '../features/subjects/hooks'
import { useAssessments, useSubjectCircumferences } from '../features/assessment/hooks'
import type { AssessmentRow } from '../features/assessment/api'
import type { AssessmentResultSnapshot } from '../features/assessment/result'
import { computeBmi, bmiCategory } from '../features/assessment/bmi'
import { classifyBodyFat } from '../features/assessment/bodyFat'
import { circumferenceLabel } from '../features/assessment/sites'
import { useOrganization } from '../features/organization/context'
import { useAuth } from '../features/auth/context'
import { loadOrgLogoDataUrl } from '../features/organization/logo'
import { downloadBlob } from '../features/reports/download'
import { logExport } from '../features/reports/audit'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { QueryError } from '../components/QueryError'

const LEAN = 'var(--color-chart-1)'
const FAT = 'var(--color-chart-2)'
const tick = { fill: 'var(--color-muted-foreground)', fontSize: 10 }
const axis = { stroke: 'var(--color-border)' }
const tooltipStyle = {
  contentStyle: {
    background: 'var(--color-popover)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: 'var(--color-popover-foreground)' },
}

function dateShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}` : iso
}
const round1 = (n: number) => Math.round(n * 10) / 10

type SeriesPoint = { date: string; value: number | null }

export default function Evolucao() {
  const { id } = useParams()
  const subjectQuery = useSubject(id)
  const assessmentsQuery = useAssessments(id)
  const circsQuery = useSubjectCircumferences(id)
  const { organization } = useOrganization()
  const { user } = useAuth()
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  const assessments = useMemo(
    () => [...(assessmentsQuery.data ?? [])].sort((a, b) => a.assessed_at.localeCompare(b.assessed_at)),
    [assessmentsQuery.data]
  )

  // PDF de evolução (P6): resumo do período + cartões de tendência, chunk lazy
  async function handlePdf() {
    setPdfBusy(true)
    setPdfError(null)
    try {
      const { generateEvolutionPdf } = await import('../features/reports/assessmentPdf')
      const history = assessments.map((x) => {
        const rr = x.results as AssessmentResultSnapshot | null
        return {
          date: dateShort(x.assessed_at),
          weightKg: x.weight_kg ?? null,
          bmi: x.weight_kg && x.height_cm ? round1(computeBmi(x.weight_kg, x.height_cm)) : null,
          bodyFatPct: rr?.bodyFatPct ?? null,
          leanMassKg: rr?.leanMassKg ?? null,
          fatMassKg: rr?.fatMassKg ?? null,
        }
      })
      const logoUrl = await loadOrgLogoDataUrl(organization?.logo_path)
      const blob = await generateEvolutionPdf({
        orgName: organization?.name ?? '',
        subjectName: subjectQuery.data?.full_name ?? '',
        logoUrl,
        history,
        circumferenceHistory: circsQuery.data ?? [],
      })
      downloadBlob(blob, `evolucao-${id}.pdf`)
      if (organization && user) {
        void logExport({
          orgId: organization.id,
          userId: user.id,
          action: 'PDF_REPORT',
          tableName: 'assessments',
          rowId: null,
          subjectId: id,
        })
      }
    } catch {
      setPdfError('Não foi possível gerar o PDF de evolução. Tente novamente.')
    } finally {
      setPdfBusy(false)
    }
  }

  if (subjectQuery.isPending || assessmentsQuery.isPending || circsQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }

  if (subjectQuery.isError || assessmentsQuery.isError || circsQuery.isError || !subjectQuery.data) {
    return (
      <QueryError
        message="Não foi possível carregar os dados completos da evolução."
        onRetry={() => void Promise.all([
          subjectQuery.refetch(),
          assessmentsQuery.refetch(),
          circsQuery.refetch(),
        ])}
      />
    )
  }

  const subject = subjectQuery.data
  const back = (
    <Link to={`/avaliados/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
      ← Voltar
    </Link>
  )

  if (assessments.length === 0) {
    return (
      <div className="space-y-3">
        {back}
        <p className="text-sm text-muted-foreground">
          Sem avaliações ainda — os gráficos aparecem após a primeira avaliação física.
        </p>
      </div>
    )
  }

  const last = assessments[assessments.length - 1]
  const lastRes = last.results as AssessmentResultSnapshot | null
  const sex = subject.sex === 'F' ? 'F' : 'M'

  // séries por métrica (uma por gráfico)
  const dates = assessments.map((a) => dateShort(a.assessed_at))
  const series = (pick: (a: AssessmentRow) => number | null): SeriesPoint[] =>
    assessments.map((a, i) => ({ date: dates[i], value: pick(a) }))

  const fatPct = series((a) => (a.results as AssessmentResultSnapshot | null)?.bodyFatPct ?? null)
  const bmiSeries = series((a) => round1(computeBmi(a.weight_kg, a.height_cm)))
  const weight = series((a) => a.weight_kg)
  const leanMass = series((a) => (a.results as AssessmentResultSnapshot | null)?.leanMassKg ?? null)
  const fatMass = series((a) => (a.results as AssessmentResultSnapshot | null)?.fatMassKg ?? null)

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {back}
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Evolução e gráficos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {subject?.full_name} · {assessments.length}{' '}
            {assessments.length === 1 ? 'avaliação' : 'avaliações'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {assessments.length >= 2 ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link to={`/avaliados/${id}/comparar`}>
                  <GitCompareArrows /> Comparar
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={handlePdf} disabled={pdfBusy}>
                {pdfBusy ? 'Gerando...' : 'PDF de evolução'}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {pdfError ? <p role="alert" className="text-sm text-destructive">{pdfError}</p> : null}

      {/* ===== ESTADO ATUAL ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado atual</CardTitle>
          <CardDescription>Última avaliação · {dateShort(last.assessed_at)}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {lastRes ? (
            <BodyCompDonut res={lastRes} />
          ) : (
            <p className="text-sm text-muted-foreground">Avaliação sem composição corporal.</p>
          )}
          <div className="grid grid-cols-2 gap-3 self-center">
            {lastRes ? (
              <>
                <Stat
                  label="% Gordura"
                  value={`${lastRes.bodyFatPct.toFixed(1)}%`}
                  hint={classifyBodyFat(sex, lastRes.bodyFatPct).label}
                />
                <Stat label="Massa magra" value={`${lastRes.leanMassKg.toFixed(1)} kg`} />
                <Stat label="Massa gorda" value={`${lastRes.fatMassKg.toFixed(1)} kg`} />
              </>
            ) : null}
            <Stat
              label="IMC"
              value={computeBmi(last.weight_kg, last.height_cm).toFixed(1)}
              hint={bmiCategory(computeBmi(last.weight_kg, last.height_cm)).label}
            />
            <Stat label="Peso" value={`${last.weight_kg} kg`} />
          </div>
        </CardContent>
      </Card>

      {/* ===== EVOLUÇÃO — UM GRÁFICO POR MÉTRICA, COM ZOOM NO EIXO ===== */}
      {assessments.length >= 2 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Evolução da composição</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetricChart title="% de gordura" unit="%" color={FAT} series={fatPct} betterDown />
            <MetricChart title="Peso" unit="kg" color="var(--color-chart-5)" series={weight} />
            <MetricChart title="IMC" unit="" color="var(--color-chart-3)" series={bmiSeries} />
            <MetricChart title="Massa magra" unit="kg" color={LEAN} series={leanMass} betterUp />
            <MetricChart title="Massa gorda" unit="kg" color={FAT} series={fatMass} betterDown />
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          As linhas de evolução aparecem a partir da 2ª avaliação.
        </p>
      )}

      {/* ===== CIRCUNFERÊNCIAS ===== */}
      <CircumferencesCharts loading={circsQuery.isPending} rows={circsQuery.data ?? []} />
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="block text-lg font-semibold">{value}</span>
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  )
}

// Gráfico de uma única métrica. O eixo Y faz "zoom" na faixa dos dados (com
// folga), então variações pequenas ficam visíveis. Mostra o Δ início→fim.
function MetricChart({
  title,
  unit,
  color,
  series,
  betterUp,
  betterDown,
}: {
  title: string
  unit: string
  color: string
  series: SeriesPoint[]
  betterUp?: boolean
  betterDown?: boolean
}) {
  const valid = series.filter((s) => s.value != null) as { date: string; value: number }[]
  if (valid.length < 2) return null
  const vals = valid.map((s) => s.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min
  const pad = range > 0 ? range * 0.25 : Math.max(1, Math.abs(max) * 0.05)
  const domain: [number, number] = [round1(min - pad), round1(max + pad)]

  const first = valid[0].value
  const lastV = valid[valid.length - 1].value
  const delta = round1(lastV - first)
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '–'
  // cor do Δ: verde quando melhora (depende da métrica), âmbar quando piora
  let deltaClass = 'text-muted-foreground'
  if (delta !== 0 && (betterUp || betterDown)) {
    const improved = betterUp ? delta > 0 : delta < 0
    deltaClass = improved ? 'text-success' : 'text-warning'
  }
  const u = unit ? ` ${unit}` : ''

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className={`text-xs font-semibold ${deltaClass}`}>
          {arrow} {Math.abs(delta).toFixed(1)}
          {u}
        </span>
      </div>
      <p className="mb-1 text-xs text-muted-foreground">
        {first.toFixed(1)} → {lastV.toFixed(1)}
        {u}
      </p>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={series} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="date" tick={tick} axisLine={axis} tickLine={axis} />
          <YAxis domain={domain} tick={tick} width={40} axisLine={axis} tickLine={axis} allowDecimals />
          <Tooltip {...tooltipStyle} formatter={(value) => [`${value}${u}`, title]} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} connectNulls dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Ver dados do gráfico</summary>
        <table className="mt-2 w-full text-left">
          <thead><tr><th scope="col">Data</th><th scope="col" className="text-right">{title}</th></tr></thead>
          <tbody>
            {valid.map((point) => (
              <tr key={point.date}><td>{point.date}</td><td className="text-right tabular-nums">{point.value.toFixed(1)}{u}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

function BodyCompDonut({ res }: { res: AssessmentResultSnapshot }) {
  const data = [
    { name: 'Massa magra', value: res.leanMassKg, fill: LEAN },
    { name: 'Massa gorda', value: res.fatMassKg, fill: FAT },
  ]
  return (
    <div className="relative h-44">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} formatter={(value, n) => [`${Number(value).toFixed(1)} kg`, n]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold">{res.bodyFatPct.toFixed(1)}%</span>
        <span className="text-xs text-muted-foreground">gordura</span>
      </div>
    </div>
  )
}

function CircumferencesCharts({
  loading,
  rows,
}: {
  loading: boolean
  rows: { assessedAt: string; site: string; valueCm: number }[]
}) {
  const { current, siteSeries } = useMemo(() => buildCircData(rows), [rows])
  if (loading) return <p className="text-sm text-muted-foreground">Carregando circunferências...</p>
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Circunferências</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Registre circunferências nas avaliações para ver a evolução aqui.
          </p>
        </CardContent>
      </Card>
    )
  }
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Circunferências atuais (cm)</CardTitle>
          <CardDescription>Última avaliação</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.max(160, current.length * 26)}>
            <BarChart data={current} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
              <XAxis type="number" tick={tick} axisLine={axis} tickLine={axis} />
              <YAxis type="category" dataKey="label" width={116} tick={tick} axisLine={axis} tickLine={axis} />
              <Tooltip {...tooltipStyle} formatter={(value) => [`${value} cm`, 'Medida']} />
              <Bar dataKey="value" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Ver medidas em tabela</summary>
            <table className="mt-2 w-full text-left">
              <thead><tr><th scope="col">Ponto</th><th scope="col" className="text-right">Medida</th></tr></thead>
              <tbody>{current.map((item) => <tr key={item.label}><td>{item.label}</td><td className="text-right tabular-nums">{item.value} cm</td></tr>)}</tbody>
            </table>
          </details>
        </CardContent>
      </Card>

      {siteSeries.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Evolução das circunferências</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {siteSeries.map((s, i) => (
              <MetricChart
                key={s.site}
                title={circumferenceLabel(s.site)}
                unit="cm"
                color={`var(--color-chart-${(i % 5) + 1})`}
                series={s.series}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}

// Agrupa as circunferências: barras do estado atual + uma série por ponto medido.
function buildCircData(rows: { assessedAt: string; site: string; valueCm: number }[]) {
  const dates = [...new Set(rows.map((r) => r.assessedAt))].sort()
  const byDateSite = new Map<string, number>()
  const count = new Map<string, number>()
  for (const r of rows) {
    byDateSite.set(`${r.assessedAt}|${r.site}`, r.valueCm)
    count.set(r.site, (count.get(r.site) ?? 0) + 1)
  }
  // um gráfico por ponto com ≥2 medidas
  const sites = [...count.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s)
  const siteSeries = sites.map((site) => ({
    site,
    series: dates.map((d) => ({ date: dateShort(d), value: byDateSite.get(`${d}|${site}`) ?? null })),
  }))

  const lastDate = dates[dates.length - 1]
  const current = rows
    .filter((r) => r.assessedAt === lastDate)
    .map((r) => ({ label: circumferenceLabel(r.site), value: r.valueCm }))
    .sort((a, b) => b.value - a.value)

  return { current, siteSeries }
}
