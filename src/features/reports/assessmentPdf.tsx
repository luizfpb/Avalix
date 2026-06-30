import { Document, Page, Text, View, StyleSheet, Svg, Path, Polyline, pdf } from '@react-pdf/renderer'
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
import { donutSlices, linePath } from './charts'
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

// agrupa as circunferências por ponto: uma série (alinhada às datas) por site
// com >=2 medidas, ordenadas por nº de medidas. Limita a maxSites pra não
// inflar o PDF. Puro — espelha o buildCircData da tela de evolução.
function buildCircSeries(
  rows: SubjectCircumference[],
  maxSites: number
): { site: string; values: (number | null)[] }[] {
  const dates = [...new Set(rows.map((r) => r.assessedAt))].sort()
  const byDateSite = new Map<string, number>()
  const count = new Map<string, number>()
  for (const r of rows) {
    byDateSite.set(`${r.assessedAt}|${r.site}`, r.valueCm)
    count.set(r.site, (count.get(r.site) ?? 0) + 1)
  }
  return [...count.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxSites)
    .map(([site]) => ({
      site,
      values: dates.map((d) => byDateSite.get(`${d}|${site}`) ?? null),
    }))
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
  trendCard: { width: '48%', marginBottom: 8 },
  trendTitle: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: palette.plum, marginBottom: 2 },
  trendCaption: { fontSize: 7.5, color: palette.muted, marginTop: 1 },
})

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

// minigráfico de uma métrica ao longo do tempo. Só desenha com >=2 pontos
// válidos (a linha pula buracos: avaliação sem composição não tem %gordura/massas).
function MiniTrend({
  title,
  unit,
  color,
  values,
}: {
  title: string
  unit: string
  color: string
  values: (number | null)[]
}) {
  const valid = values.filter((v): v is number => v != null)
  if (valid.length < 2) return null
  const w = 226
  const h = 46
  const l = linePath(values, w, h, 3, 6)
  const first = valid[0]
  const last = valid[valid.length - 1]
  return (
    <View style={styles.trendCard}>
      <Text style={styles.trendTitle}>{title}</Text>
      <Svg width={w} height={h}>
        <Polyline points={l.points} fill="none" stroke={color} strokeWidth={1.5} />
      </Svg>
      <Text style={styles.trendCaption}>
        {first.toFixed(1)}
        {unit} → {last.toFixed(1)}
        {unit} · faixa {l.min.toFixed(1)}–{l.max.toFixed(1)}
      </Text>
    </View>
  )
}

function EvolutionSection({ history }: { history: AssessmentHistoryPoint[] }) {
  if (history.length < 2) return null
  const charts = TREND_METRICS.map((m) => ({ m, values: history.map((p) => p[m.key]) })).filter(
    ({ values }) => values.filter((v) => v != null).length >= 2
  )
  if (charts.length === 0) return null
  return (
    <View style={styles.section}>
      <SectionTitle>Evolução ao longo das avaliações</SectionTitle>
      <View style={styles.evoGrid}>
        {charts.map(({ m, values }) => (
          <MiniTrend key={m.key} title={m.title} unit={m.unit} color={m.color} values={values} />
        ))}
      </View>
      <Text style={styles.muted}>
        {history[0].date} → {history[history.length - 1].date} · {history.length} avaliações
      </Text>
    </View>
  )
}

function CircumferenceEvolution({ rows }: { rows: SubjectCircumference[] }) {
  const series = buildCircSeries(rows, 6)
  if (series.length === 0) return null
  return (
    <View style={styles.section}>
      <SectionTitle>Evolução das circunferências (cm)</SectionTitle>
      <View style={styles.evoGrid}>
        {series.map((s) => (
          <MiniTrend
            key={s.site}
            title={circumferenceLabel(s.site)}
            unit=" cm"
            color={palette.plum}
            values={s.values}
          />
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

        <ReportFooter
          note={`Gerado pelo Avalix${r ? ` · motor de cálculo ${r.engineVersion}` : ''}`}
        />
      </Page>
    </Document>
  )
}

export async function generateAssessmentPdf(data: AssessmentPdfData): Promise<Blob> {
  return pdf(<AssessmentDoc data={data} />).toBlob()
}
