import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'
import type {
  AssessmentRow,
  CircumferenceReadingRow,
  SkinfoldReadingRow,
} from '../assessment/api'
import type { AssessmentResultSnapshot } from '../assessment/result'
import { protocolLabel } from '../assessment/protocols'
import { SKINFOLD_LABELS, CIRCUMFERENCE_LABELS } from '../assessment/sites'
import type { SkinfoldSite, CircumferenceSite } from '../assessment/protocols'

export type AssessmentPdfData = {
  orgName: string
  subjectName: string
  assessment: AssessmentRow
  skinfolds: SkinfoldReadingRow[]
  circumferences: CircumferenceReadingRow[]
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
})

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
        <View style={styles.plate}>
          <Text style={styles.plateText}>BODYTRACK</Text>
        </View>
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
                <Text style={styles.muted}>
                  {CIRCUMFERENCE_LABELS[c.site as CircumferenceSite] ?? c.site}
                </Text>
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
          Gerado pelo BodyTrack{r ? ` · motor de cálculo ${r.engineVersion}` : ''}. Resultado
          reproduzível a partir das medidas registradas. Documento de uso profissional.
        </Text>
      </Page>
    </Document>
  )
}

export async function generateAssessmentPdf(data: AssessmentPdfData): Promise<Blob> {
  return pdf(<AssessmentDoc data={data} />).toBlob()
}
