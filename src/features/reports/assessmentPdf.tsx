import {
  Circle,
  Document,
  Line,
  Page,
  Path,
  Polyline,
  Svg,
  StyleSheet,
  Text,
  View,
  pdf,
} from '@react-pdf/renderer'
import type {
  AssessmentRow,
  CircumferenceReadingRow,
  SkinfoldReadingRow,
  SubjectCircumference,
} from '../assessment/api'
import type { AssessmentResultSnapshot } from '../assessment/result'
import { protocolLabel } from '../assessment/protocols'
import { SKINFOLD_LABELS, circumferenceLabel } from '../assessment/sites'
import type { SkinfoldSite } from '../assessment/protocols'
import { computeBmi, bmiCategory } from '../assessment/bmi'
import { classifyBodyFat } from '../assessment/bodyFat'
import { donutSlices } from './charts'
import {
  InfoCard,
  ReportFooter,
  ReportHeader,
  SectionTitle,
  fmtDate,
  palette,
  pdfTheme,
  type InfoItem,
} from './pdfTheme'

const LEAN = palette.violet
const FAT = palette.magenta

// um ponto do histórico cronológico do avaliado (uma avaliação). peso/IMC
// existem sempre; %gordura/massas só quando houve protocolo de composição.
export type AssessmentHistoryPoint = {
  date: string
  weightKg: number | null
  bmi: number | null
  bodyFatPct: number | null
  leanMassKg: number | null
  fatMassKg: number | null
}

export type AssessmentPdfData = {
  orgName: string
  subjectName: string
  // logo da org como data URL (branding); ausente = plaqueta AVALIX
  logoUrl?: string | null
  assessment: AssessmentRow
  skinfolds: SkinfoldReadingRow[]
  circumferences: CircumferenceReadingRow[]
  // histórico cronológico (opcional) para os gráficos de evolução
  history?: AssessmentHistoryPoint[]
  // todas as circunferências do avaliado ao longo das avaliações (opcional),
  // pra evolução dos perímetros mais medidos
  circumferenceHistory?: SubjectCircumference[]
}

type TrendPoint = { value: number | null; date: string }

// inteiro sem casa decimal; senão 1 casa (80.0 -> "80", 18.23 -> "18.2")
function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// ISO (aaaa-mm-dd) -> dd/mm pro eixo do gráfico
function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}` : iso
}

// Grupos de circunferências plotados no PDF, em ordem de prioridade (tronco
// central → membros inferiores → superiores → resto). Bilateral (D/E) entra
// como MÉDIA dos lados medidos, pra um gráfico por região em vez de dois. As
// chaves batem com o CIRCUMFERENCE_CATALOG.
const CIRC_TREND_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Cintura', keys: ['waist'] },
  { label: 'Abdômen', keys: ['abdomen'] },
  { label: 'Quadril', keys: ['hip'] },
  { label: 'Coxa proximal', keys: ['thigh_proximal_r', 'thigh_proximal_l'] },
  { label: 'Coxa medial', keys: ['thigh_mid_r', 'thigh_mid_l'] },
  { label: 'Coxa distal', keys: ['thigh_distal_r', 'thigh_distal_l'] },
  { label: 'Panturrilha', keys: ['calf_r', 'calf_l'] },
  { label: 'Braço contraído', keys: ['arm_flexed_r', 'arm_flexed_l'] },
  { label: 'Braço relaxado', keys: ['arm_relaxed_r', 'arm_relaxed_l'] },
  { label: 'Antebraço', keys: ['forearm_r', 'forearm_l'] },
  { label: 'Tórax', keys: ['chest'] },
  { label: 'Pescoço', keys: ['neck'] },
  { label: 'Ombro', keys: ['shoulder'] },
]

// Séries de evolução das circunferências pro PDF. Cobre tronco E membros
// (coxas/panturrilha, braços/antebraço) por prioridade; bilateral vira média
// dos lados medidos. Janela aos últimos maxPoints registros e limita a
// maxCharts gráficos. Sites fora do catálogo (customizados) entram no fim,
// por nº de medidas, pra não sumir. Puro/testável.
export function buildCircSeries(
  rows: SubjectCircumference[],
  maxCharts: number,
  maxPoints: number
): { label: string; points: TrendPoint[] }[] {
  const dates = [...new Set(rows.map((r) => r.assessedAt))].sort().slice(-maxPoints)
  const dateSet = new Set(dates)
  const byDateSite = new Map<string, number>()
  const seen = new Set<string>()
  for (const r of rows) {
    if (!dateSet.has(r.assessedAt)) continue
    byDateSite.set(`${r.assessedAt}|${r.site}`, r.valueCm)
    seen.add(r.site)
  }

  // média dos lados medidos numa data, pra um conjunto de chaves
  const meanAt = (d: string, keys: string[]): number | null => {
    const vals = keys
      .map((k) => byDateSite.get(`${d}|${k}`))
      .filter((v): v is number => v != null)
    if (vals.length === 0) return null
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
  }

  const out: { label: string; points: TrendPoint[] }[] = []
  const consumed = new Set<string>()
  for (const g of CIRC_TREND_GROUPS) {
    if (out.length >= maxCharts) return out
    if (!g.keys.some((k) => seen.has(k))) continue
    g.keys.forEach((k) => consumed.add(k))
    const points = dates.map((d) => ({ value: meanAt(d, g.keys), date: shortDate(d) }))
    if (points.filter((p) => p.value != null).length >= 2) out.push({ label: g.label, points })
  }

  // sobrou espaço? sites medidos fora do catálogo (customizados), por nº de medidas
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (dateSet.has(r.assessedAt) && !consumed.has(r.site)) {
      counts.set(r.site, (counts.get(r.site) ?? 0) + 1)
    }
  }
  for (const [site] of [...counts.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1])) {
    if (out.length >= maxCharts) break
    const points = dates.map((d) => ({
      value: byDateSite.get(`${d}|${site}`) ?? null,
      date: shortDate(d),
    }))
    out.push({ label: circumferenceLabel(site), points })
  }
  return out
}

// métricas plotadas na evolução, na ordem de exibição. key bate com o ponto.
type TrendKey = 'bodyFatPct' | 'weightKg' | 'bmi' | 'leanMassKg' | 'fatMassKg'
const TREND_METRICS: { key: TrendKey; title: string; unit: string; color: string }[] = [
  { key: 'bodyFatPct', title: '% de gordura', unit: '%', color: FAT },
  { key: 'weightKg', title: 'Peso', unit: ' kg', color: palette.plum },
  { key: 'bmi', title: 'IMC', unit: '', color: palette.violet },
  { key: 'leanMassKg', title: 'Massa magra', unit: ' kg', color: LEAN },
  { key: 'fatMassKg', title: 'Massa gorda', unit: ' kg', color: FAT },
]

const styles = StyleSheet.create({
  section: { marginBottom: 14 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  stat: { width: '25%', marginBottom: 6 },
  statLabel: { fontSize: 8, color: palette.muted },
  statValue: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: palette.plum },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2.5,
    borderBottomWidth: 0.5,
    borderBottomColor: palette.hairline,
  },
  muted: { color: palette.muted },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2, marginRight: 5 },
  reproNote: { fontSize: 8, color: palette.muted, marginTop: 6, lineHeight: 1.4 },
  evoGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  trendCard: { width: '48%', marginBottom: 10 },
  trendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 1,
  },
  trendTitle: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: palette.plum },
  trendDelta: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
})

// dimensões e margens internas do gráfico (espaço pra escala, rótulos e datas)
const CHART_W = 250
const CHART_H = 104
const PX0 = 34 // gutter esquerdo (escala y)
const PX1 = 212 // borda direita do plot (deixa margem à direita pro valor atual)
const PY0 = 18 // topo (espaço pro rótulo de valor sobre o ponto)
const PY1 = 84 // base do plot (acima da linha de datas)
const AXIS_COLOR = '#66717E' // escala/datas: legível sem disputar com os dados
const GRID_COLOR = '#DCE2E8' // linhas de referência

function Donut({ lean, fat }: { lean: number; fat: number }) {
  const slices = donutSlices([lean, fat], 50, 50, 46, 28)
  const colors = [LEAN, FAT]
  return (
    <Svg width={100} height={100} viewBox="0 0 100 100">
      {slices.map((s, i) => (
        <Path key={i} d={s.d} fill={colors[i] ?? LEAN} />
      ))}
    </Svg>
  )
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text>{text}</Text>
    </View>
  )
}

// Cartão de evolução de uma métrica: linha com pontos marcados, valor inicial
// e final sobre os pontos, variação (Δ) no cabeçalho, linhas de referência
// mín/máx com a escala, e datas das pontas. Só desenha com >=2 pontos válidos
// (a linha pula buracos: avaliação sem composição não tem %gordura/massas).
function TrendChart({
  title,
  unit,
  color,
  points,
}: {
  title: string
  unit: string
  color: string
  points: TrendPoint[]
}) {
  const valid = points
    .map((p, i) => ({ value: p.value, date: p.date, i }))
    .filter((p): p is { value: number; date: string; i: number } => p.value != null)
  if (valid.length < 2) return null

  const nums = valid.map((p) => p.value)
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  const n = points.length
  const xOf = (i: number) => (n <= 1 ? (PX0 + PX1) / 2 : PX0 + (i / (n - 1)) * (PX1 - PX0))
  const yOf = (v: number) => PY1 - ((v - min) / span) * (PY1 - PY0)

  const coords = valid.map((p) => ({ x: xOf(p.i), y: yOf(p.value), value: p.value, date: p.date }))
  const polyPoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const first = coords[0]
  const last = coords[coords.length - 1]
  const delta = last.value - first.value
  const deltaTxt = `${delta > 0 ? '+' : ''}${fmtNum(delta)}${unit}`
  // 3 referências: máximo (topo), meio e mínimo (base), com a escala à esquerda
  const grid = [
    { v: max, y: PY0 },
    { v: (max + min) / 2, y: (PY0 + PY1) / 2 },
    { v: min, y: PY1 },
  ]

  return (
    <View style={styles.trendCard} wrap={false}>
      <View style={styles.trendHeader}>
        <Text style={styles.trendTitle}>{title}</Text>
        <Text style={[styles.trendDelta, { color }]}>{deltaTxt}</Text>
      </View>
      <Svg width={CHART_W} height={CHART_H}>
        {/* linhas de referência + escala (máx / meio / mín) */}
        {grid.map((g, i) => (
          <Line key={`g${i}`} x1={PX0} y1={g.y} x2={PX1} y2={g.y} stroke={GRID_COLOR} strokeWidth={0.6} />
        ))}
        {grid.map((g, i) => (
          <Text
            key={`s${i}`}
            x={PX0 - 4}
            y={g.y + 2.4}
            style={{ fontSize: 7, fill: AXIS_COLOR, textAnchor: 'end' }}
          >
            {fmtNum(g.v)}
          </Text>
        ))}
        {/* linha + pontos */}
        <Polyline points={polyPoints} fill="none" stroke={color} strokeWidth={1.8} />
        {coords.map((c, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 3.2 : 2.2} fill={color} />
        ))}
        {/* valor inicial: pequeno, acima do 1º ponto (referência) */}
        <Text
          x={first.x + 4}
          y={first.y - 5}
          style={{ fontSize: 7.5, fill: AXIS_COLOR, textAnchor: 'start' }}
        >
          {fmtNum(first.value)}
        </Text>
        {/* valor atual: em destaque, FORA do plot, ao lado do último ponto */}
        <Text
          x={PX1 + 6}
          y={last.y + 2.5}
          style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', fill: palette.ink, textAnchor: 'start' }}
        >
          {fmtNum(last.value)}
        </Text>
        {/* datas das pontas */}
        <Text x={PX0} y={CHART_H - 4} style={{ fontSize: 6.5, fill: AXIS_COLOR, textAnchor: 'start' }}>
          {first.date}
        </Text>
        <Text x={PX1} y={CHART_H - 4} style={{ fontSize: 6.5, fill: AXIS_COLOR, textAnchor: 'end' }}>
          {last.date}
        </Text>
      </Svg>
    </View>
  )
}

function EvolutionSection({
  history,
  maxCharts = 4,
}: {
  history: AssessmentHistoryPoint[]
  maxCharts?: number
}) {
  if (history.length < 2) return null
  // PDF: últimos 10 pontos pra leitura limpa (no app a tela mostra todos)
  const recent = history.slice(-10)
  const charts = TREND_METRICS.map((m) => ({
    m,
    points: recent.map((p) => ({ value: p[m.key], date: p.date })),
  }))
    .filter((c) => c.points.filter((p) => p.value != null).length >= 2)
    .slice(0, maxCharts)
  if (charts.length === 0) return null
  return (
    <View style={styles.section}>
      <SectionTitle>Evolução ao longo das avaliações</SectionTitle>
      <View style={styles.evoGrid}>
        {charts.map(({ m, points }) => (
          <TrendChart key={m.key} title={m.title} unit={m.unit} color={m.color} points={points} />
        ))}
      </View>
      <Text style={[styles.muted, { fontSize: 8 }]}>
        de {recent[0].date} a {recent[recent.length - 1].date} · {recent.length} avaliações
        {history.length > recent.length ? ` (de ${history.length} no total)` : ''}
      </Text>
    </View>
  )
}

function CircumferenceEvolution({ rows }: { rows: SubjectCircumference[] }) {
  const series = buildCircSeries(rows, 12, 10)
  if (series.length === 0) return null
  return (
    <View style={styles.section} wrap={series.length > 2}>
      <SectionTitle>Evolução das circunferências (cm)</SectionTitle>
      <View style={styles.evoGrid}>
        {series.map((s) => (
          <TrendChart key={s.label} title={s.label} unit=" cm" color={palette.plum} points={s.points} />
        ))}
      </View>
    </View>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  )
}

function AssessmentDoc({ data }: { data: AssessmentPdfData }) {
  const { assessment, skinfolds, circumferences } = data
  const r = assessment.results as AssessmentResultSnapshot | null

  const info: InfoItem[] = [
    { label: 'Avaliado', value: data.subjectName, wide: true },
    { label: 'Data', value: fmtDate(assessment.assessed_at) ?? '—' },
    { label: 'Protocolo', value: protocolLabel(assessment.protocol_id) },
    { label: 'Peso', value: `${assessment.weight_kg} kg` },
    { label: 'Altura', value: `${assessment.height_cm} cm` },
  ]

  return (
    <Document>
      <Page size="A4" style={pdfTheme.page}>
        <ReportHeader
          logoUrl={data.logoUrl}
          orgName={data.orgName}
          title="Relatório de Avaliação Física"
          subtitle={fmtDate(assessment.assessed_at)}
        />

        <InfoCard items={info} />

        {r ? (
          <View style={styles.section}>
            <SectionTitle>Resultado</SectionTitle>
            <View style={styles.statsRow}>
              <Stat label="% Gordura" value={`${r.bodyFatPct.toFixed(1)}%`} />
              {r.bodyDensity != null ? (
                <Stat label="Densidade" value={r.bodyDensity.toFixed(4)} />
              ) : null}
              <Stat label="Massa gorda" value={`${r.fatMassKg.toFixed(1)} kg`} />
              <Stat label="Massa magra" value={`${r.leanMassKg.toFixed(1)} kg`} />
            </View>
            {r.conversions ? (
              <Text style={styles.muted}>
                Siri {r.conversions.siri.toFixed(1)}% · Brozek {r.conversions.brozek.toFixed(1)}%
                (principal: Siri)
              </Text>
            ) : null}
          </View>
        ) : null}

        {r ? (
          <View style={styles.section}>
            <SectionTitle>Composição corporal</SectionTitle>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ marginRight: 16 }}>
                <Donut lean={r.leanMassKg} fat={r.fatMassKg} />
              </View>
              <View>
                <Legend color={LEAN} text={`Massa magra: ${r.leanMassKg.toFixed(1)} kg`} />
                <Legend color={FAT} text={`Massa gorda: ${r.fatMassKg.toFixed(1)} kg`} />
                <Text style={{ marginTop: 5 }}>
                  Gordura: {r.bodyFatPct.toFixed(1)}% (
                  {classifyBodyFat(r.inputs.sex, r.bodyFatPct).label})
                </Text>
                <Text>
                  IMC: {computeBmi(assessment.weight_kg, assessment.height_cm).toFixed(1)} (
                  {bmiCategory(computeBmi(assessment.weight_kg, assessment.height_cm)).label})
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {data.history ? <EvolutionSection history={data.history} /> : null}

        {data.circumferenceHistory ? (
          <CircumferenceEvolution rows={data.circumferenceHistory} />
        ) : null}

        {skinfolds.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle>Dobras cutâneas (mm)</SectionTitle>
            {skinfolds.map((s) => {
              const vals = [s.reading_1, s.reading_2, s.reading_3].filter(
                (v): v is number => v != null
              )
              const mean = vals.reduce((a, b) => a + b, 0) / vals.length
              return (
                <View key={s.id} style={styles.row}>
                  <Text style={styles.muted}>
                    {SKINFOLD_LABELS[s.site as SkinfoldSite] ?? s.site}
                  </Text>
                  <Text>
                    {vals.join(' / ')} (méd {mean.toFixed(1)})
                  </Text>
                </View>
              )
            })}
          </View>
        ) : null}

        {circumferences.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle>Circunferências (cm)</SectionTitle>
            {circumferences.map((c) => (
              <View key={c.id} style={styles.row}>
                <Text style={styles.muted}>{circumferenceLabel(c.site)}</Text>
                <Text>{c.value_cm}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {assessment.medications ? (
          <View style={styles.section}>
            <SectionTitle>Medicamentos em uso</SectionTitle>
            <Text>{assessment.medications}</Text>
          </View>
        ) : null}

        {assessment.notes ? (
          <View style={styles.section}>
            <SectionTitle>Observações</SectionTitle>
            <Text>{assessment.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.reproNote}>
          Resultado reproduzível a partir das medidas registradas. Documento de uso profissional.
        </Text>

        <ReportFooter note="Calculado pelo motor Avalix" />
      </Page>
    </Document>
  )
}

export async function generateAssessmentPdf(data: AssessmentPdfData): Promise<Blob> {
  return pdf(<AssessmentDoc data={data} />).toBlob()
}

// =====================================================================
// PDF de evolução (P6, v2.0): relatório standalone do período — resumo
// "de → para → Δ" + os mesmos cartões de tendência do PDF de avaliação.
// Entregável de renovação de ciclo; reusa TrendChart/tema (mesmo chunk).
// =====================================================================

export type EvolutionPdfData = {
  orgName: string
  subjectName: string
  logoUrl?: string | null
  history: AssessmentHistoryPoint[]
  circumferenceHistory: SubjectCircumference[]
}

type SummaryRow = { label: string; unit: string; from: number; to: number }

// primeiro e último valor válido de cada métrica no período (puro/testável)
export function evolutionSummaryRows(history: AssessmentHistoryPoint[]): SummaryRow[] {
  const out: SummaryRow[] = []
  for (const m of TREND_METRICS) {
    const valid = history.map((p) => p[m.key]).filter((v): v is number => v != null)
    if (valid.length < 2) continue
    out.push({ label: m.title, unit: m.unit, from: valid[0], to: valid[valid.length - 1] })
  }
  return out
}

const summaryStyles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    borderBottomWidth: 0.8,
    borderBottomColor: palette.hairline,
    paddingBottom: 3,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 2.5,
    borderBottomWidth: 0.5,
    borderBottomColor: palette.hairline,
  },
  colLabel: { width: '40%', color: palette.muted },
  colNum: { width: '20%', textAlign: 'right' },
  colHead: { fontSize: 8, color: palette.muted },
  delta: { fontFamily: 'Helvetica-Bold' },
})

function EvolutionSummary({ history }: { history: AssessmentHistoryPoint[] }) {
  const rows = evolutionSummaryRows(history)
  if (rows.length === 0) return null
  return (
    <View style={styles.section}>
      <SectionTitle>Resumo do período</SectionTitle>
      <View style={summaryStyles.head}>
        <Text style={[summaryStyles.colLabel, summaryStyles.colHead]}>Métrica</Text>
        <Text style={[summaryStyles.colNum, summaryStyles.colHead]}>Início</Text>
        <Text style={[summaryStyles.colNum, summaryStyles.colHead]}>Atual</Text>
        <Text style={[summaryStyles.colNum, summaryStyles.colHead]}>Variação</Text>
      </View>
      {rows.map((r) => {
        const delta = r.to - r.from
        return (
          <View key={r.label} style={summaryStyles.row}>
            <Text style={summaryStyles.colLabel}>{r.label}</Text>
            <Text style={summaryStyles.colNum}>{fmtNum(r.from)}{r.unit}</Text>
            <Text style={summaryStyles.colNum}>{fmtNum(r.to)}{r.unit}</Text>
            <Text style={[summaryStyles.colNum, summaryStyles.delta]}>
              {delta > 0 ? '+' : ''}{fmtNum(delta)}{r.unit}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function EvolutionDoc({ data }: { data: EvolutionPdfData }) {
  const first = data.history[0]
  const last = data.history[data.history.length - 1]
  const info: InfoItem[] = [
    { label: 'Avaliado', value: data.subjectName, wide: true },
    { label: 'Período', value: first && last ? `${first.date} a ${last.date}` : '—' },
    { label: 'Avaliações', value: String(data.history.length) },
  ]
  return (
    <Document>
      <Page size="A4" style={pdfTheme.page}>
        <ReportHeader
          logoUrl={data.logoUrl}
          orgName={data.orgName}
          title="Relatório de Evolução"
          subtitle={first && last ? `${first.date} a ${last.date}` : undefined}
        />
        <InfoCard items={info} />
        <EvolutionSummary history={data.history} />
        <EvolutionSection history={data.history} maxCharts={5} />
        <CircumferenceEvolution rows={data.circumferenceHistory} />
        <Text style={styles.reproNote}>
          Valores calculados a partir das avaliações registradas no período. Documento de uso
          profissional.
        </Text>
        <ReportFooter note="Calculado pelo motor Avalix" />
      </Page>
    </Document>
  )
}

export async function generateEvolutionPdf(data: EvolutionPdfData): Promise<Blob> {
  return pdf(<EvolutionDoc data={data} />).toBlob()
}
