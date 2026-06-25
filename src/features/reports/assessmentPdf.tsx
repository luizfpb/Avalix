import { Document, Page, Text, View, StyleSheet, Svg, Path, Polyline, pdf } from '@react-pdf/renderer'
import type {
  AssessmentRow,
  CircumferenceReadingRow,
  SkinfoldReadingRow,
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

export type AssessmentPdfData = {
  orgName: string
  subjectName: string
  // logo da org como data URL (branding); ausente = plaqueta AVALIX
  logoUrl?: string | null
  assessment: AssessmentRow
  skinfolds: SkinfoldReadingRow[]
  circumferences: CircumferenceReadingRow[]
  // histórico cronológico (opcional) para a evolução
  history?: { date: string; bodyFatPct: number | null }[]
}

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

function Evolution({ history }: { history: { date: string; bodyFatPct: number | null }[] }) {
  const w = 240
  const h = 56
  const l = linePath(
    history.map((p) => p.bodyFatPct),
    w,
    h,
    2,
    6
  )
  return (
    <View style={styles.section}>
      <SectionTitle>Evolução da % de gordura</SectionTitle>
      <Svg width={w} height={h}>
        <Polyline points={l.points} fill="none" stroke={LEAN} strokeWidth={1.5} />
      </Svg>
      <Text style={styles.muted}>
        {history[0].date} → {history[history.length - 1].date} · {l.min.toFixed(1)}%–
        {l.max.toFixed(1)}%
      </Text>
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

        {data.history && data.history.length >= 2 ? <Evolution history={data.history} /> : null}

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
