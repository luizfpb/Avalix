import { Document, Page, Text, View, StyleSheet, Svg, Path, Polyline, Image, pdf } from '@react-pdf/renderer'
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

const LEAN = '#8b5cf6'
const FAT = '#d4537e'

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
  page: { padding: 36, fontSize: 10, color: '#1a1a1a', fontFamily: 'Helvetica' },
  // plaqueta da marca: campo roxo com o wordmark claro (não letras claras sobre
  // branco). Black Ops One não é registrada no PDF; usamos Helvetica-Bold
  // espaçada dentro da plaqueta, mantendo a cor da marca.
  plate: {
    backgroundColor: '#2A0E52',
    color: '#ECE3FA',
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  plateText: { fontSize: 12, fontFamily: 'Helvetica-Bold', letterSpacing: 2, color: '#ECE3FA' },
  logo: { height: 40, maxWidth: 200, objectFit: 'contain', alignSelf: 'flex-start', marginBottom: 10 },
  org: { fontSize: 9, color: '#666' },
  h1: { fontSize: 16, marginTop: 2, marginBottom: 12, color: '#2A0E52' },
  meta: { marginBottom: 14, lineHeight: 1.4 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  stat: { width: '25%', marginBottom: 6 },
  statLabel: { fontSize: 8, color: '#666' },
  statValue: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  muted: { color: '#666' },
  footer: { marginTop: 24, fontSize: 8, color: '#888', lineHeight: 1.4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2, marginRight: 5 },
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
      <Text style={styles.sectionTitle}>Evolução da % de gordura</Text>
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

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
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

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {data.logoUrl ? (
          <Image src={data.logoUrl} style={styles.logo} />
        ) : (
          <View style={styles.plate}>
            <Text style={styles.plateText}>AVALIX</Text>
          </View>
        )}
        <Text style={styles.org}>{data.orgName}</Text>
        <Text style={styles.h1}>Relatório de Avaliação Física</Text>

        <View style={styles.meta}>
          <Text>Avaliado: {data.subjectName}</Text>
          <Text>Data: {fmtDate(assessment.assessed_at)}</Text>
          <Text>Protocolo: {protocolLabel(assessment.protocol_id)}</Text>
          <Text>
            Peso: {assessment.weight_kg} kg · Altura: {assessment.height_cm} cm
          </Text>
        </View>

        {r ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Resultado</Text>
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
            <Text style={styles.sectionTitle}>Composição corporal</Text>
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
            <Text style={styles.sectionTitle}>Dobras cutâneas (mm)</Text>
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
            <Text style={styles.sectionTitle}>Circunferências (cm)</Text>
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
            <Text style={styles.sectionTitle}>Medicamentos em uso</Text>
            <Text>{assessment.medications}</Text>
          </View>
        ) : null}

        {assessment.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Observações</Text>
            <Text>{assessment.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          Gerado pelo Avalix{r ? ` · motor de cálculo ${r.engineVersion}` : ''}. Resultado
          reproduzível a partir das medidas registradas. Documento de uso profissional.
        </Text>
      </Page>
    </Document>
  )
}

export async function generateAssessmentPdf(data: AssessmentPdfData): Promise<Blob> {
  return pdf(<AssessmentDoc data={data} />).toBlob()
}
