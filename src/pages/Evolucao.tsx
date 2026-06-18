import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { useSubject } from '../features/subjects/hooks'
import { useAssessments, useSubjectCircumferences } from '../features/assessment/hooks'
import type { AssessmentRow } from '../features/assessment/api'
import type { AssessmentResultSnapshot } from '../features/assessment/result'
import { computeBmi, bmiCategory } from '../features/assessment/bmi'
import { classifyBodyFat } from '../features/assessment/bodyFat'
import { circumferenceLabel } from '../features/assessment/sites'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

const COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-brand-magenta)',
]
const tick = { fill: 'var(--color-muted-foreground)', fontSize: 11 }
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

type Point = {
  date: string
  bodyFatPct: number | null
  weightKg: number
  bmi: number
  fatMassKg: number | null
  leanMassKg: number | null
}

export default function Evolucao() {
  const { id } = useParams()
  const subjectQuery = useSubject(id)
  const assessmentsQuery = useAssessments(id)
  const circsQuery = useSubjectCircumferences(id)

  const assessments = useMemo(
    () => [...(assessmentsQuery.data ?? [])].sort((a, b) => a.assessed_at.localeCompare(b.assessed_at)),
    [assessmentsQuery.data]
  )
  const points: Point[] = useMemo(() => assessments.map(toPoint), [assessments])

  if (subjectQuery.isPending || assessmentsQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
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
  const sex = subject?.sex === 'F' ? 'F' : 'M'

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        {back}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Evolução e gráficos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {subject?.full_name} · {assessments.length}{' '}
          {assessments.length === 1 ? 'avaliação' : 'avaliações'}
        </p>
      </div>

      {/* ===== ESTADO ATUAL ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado atual</CardTitle>
          <CardDescription>Última avaliação · {dateShort(last.assessed_at)}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {lastRes ? <BodyCompDonut res={lastRes} /> : <p className="text-sm text-muted-foreground">Avaliação sem composição corporal.</p>}
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

      {/* ===== EVOLUÇÃO COMPOSIÇÃO ===== */}
      {points.length >= 2 ? (
        <>
          <ChartCard title="% de gordura e IMC" desc="ao longo das avaliações">
            <LineChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={tick} axisLine={axis} tickLine={axis} />
              <YAxis tick={tick} width={36} axisLine={axis} tickLine={axis} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-muted-foreground)' }} />
              <Line type="monotone" dataKey="bodyFatPct" name="% Gordura" stroke={COLORS[1]} strokeWidth={2} connectNulls dot={{ r: 3 }} />
              <Line type="monotone" dataKey="bmi" name="IMC" stroke={COLORS[2]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ChartCard>

          <ChartCard title="Massa magra e gorda (kg)" desc="composição ao longo do tempo">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={tick} axisLine={axis} tickLine={axis} />
              <YAxis tick={tick} width={36} axisLine={axis} tickLine={axis} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-muted-foreground)' }} />
              <Area type="monotone" dataKey="leanMassKg" name="Massa magra" stackId="m" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.5} />
              <Area type="monotone" dataKey="fatMassKg" name="Massa gorda" stackId="m" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.5} />
            </AreaChart>
          </ChartCard>

          <ChartCard title="Peso (kg)" desc="ao longo das avaliações">
            <LineChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={tick} axisLine={axis} tickLine={axis} />
              <YAxis tick={tick} width={36} domain={['dataMin - 2', 'dataMax + 2']} axisLine={axis} tickLine={axis} />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="weightKg" name="Peso" stroke={COLORS[4]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ChartCard>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          As linhas de evolução aparecem a partir da 2ª avaliação.
        </p>
      )}

      {/* ===== CIRCUNFERÊNCIAS ===== */}
      <CircumferencesCharts subjectId={id} loading={circsQuery.isPending} rows={circsQuery.data ?? []} />
    </div>
  )
}

function toPoint(a: AssessmentRow): Point {
  const res = a.results as AssessmentResultSnapshot | null
  return {
    date: dateShort(a.assessed_at),
    bodyFatPct: res?.bodyFatPct ?? null,
    weightKg: a.weight_kg,
    bmi: computeBmi(a.weight_kg, a.height_cm),
    fatMassKg: res?.fatMassKg ?? null,
    leanMassKg: res?.leanMassKg ?? null,
  }
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

function BodyCompDonut({ res }: { res: AssessmentResultSnapshot }) {
  const data = [
    { name: 'Massa magra', value: res.leanMassKg, fill: COLORS[0] },
    { name: 'Massa gorda', value: res.fatMassKg, fill: COLORS[1] },
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
          <Tooltip {...tooltipStyle} formatter={(value, name) => [`${Number(value).toFixed(1)} kg`, name]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold">{res.bodyFatPct.toFixed(1)}%</span>
        <span className="text-xs text-muted-foreground">gordura</span>
      </div>
    </div>
  )
}

function ChartCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactElement }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {desc ? <CardDescription>{desc}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          {children}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function CircumferencesCharts({
  subjectId,
  loading,
  rows,
}: {
  subjectId: string | undefined
  loading: boolean
  rows: { assessedAt: string; site: string; valueCm: number }[]
}) {
  const { dates, sites, evolution, current } = useMemo(() => buildCircData(rows), [rows])
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
  void subjectId
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
        </CardContent>
      </Card>

      {dates.length >= 2 && sites.length > 0 ? (
        <ChartCard title="Evolução das circunferências (cm)" desc="principais pontos medidos">
          <LineChart data={evolution} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="date" tick={tick} axisLine={axis} tickLine={axis} />
            <YAxis tick={tick} width={36} domain={['dataMin - 2', 'dataMax + 2']} axisLine={axis} tickLine={axis} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-muted-foreground)' }} />
            {sites.map((s, i) => (
              <Line key={s} type="monotone" dataKey={s} name={circumferenceLabel(s)} stroke={COLORS[i % COLORS.length]} strokeWidth={2} connectNulls dot={{ r: 2 }} />
            ))}
          </LineChart>
        </ChartCard>
      ) : null}
    </>
  )
}

// Agrupa as circunferências por data e por ponto, escolhe os mais medidos.
function buildCircData(rows: { assessedAt: string; site: string; valueCm: number }[]) {
  const dates = [...new Set(rows.map((r) => r.assessedAt))].sort()
  const byDateSite = new Map<string, number>() // `${date}|${site}` -> value
  const count = new Map<string, number>() // site -> nº de medidas
  for (const r of rows) {
    byDateSite.set(`${r.assessedAt}|${r.site}`, r.valueCm)
    count.set(r.site, (count.get(r.site) ?? 0) + 1)
  }
  // sites com ≥2 medidas, os 6 mais frequentes
  const sites = [...count.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([s]) => s)

  const evolution = dates.map((d) => {
    const row: Record<string, string | number | null> = { date: dateShort(d) }
    for (const s of sites) row[s] = byDateSite.get(`${d}|${s}`) ?? null
    return row
  })

  // barras do estado atual: último date
  const lastDate = dates[dates.length - 1]
  const current = rows
    .filter((r) => r.assessedAt === lastDate)
    .map((r) => ({ label: circumferenceLabel(r.site), value: r.valueCm }))
    .sort((a, b) => b.value - a.value)

  return { dates, sites, evolution, current }
}
