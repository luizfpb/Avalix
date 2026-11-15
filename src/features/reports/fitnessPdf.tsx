import { Document, Page, StyleSheet, View, pdf } from '@react-pdf/renderer'
import { Text } from './pdfText'
import { registerReportFonts } from './pdfFonts'
import {
  InfoCard,
  MethodNote,
  ReportFooter,
  ReportHeader,
  ReportRunningHeader,
  SectionTitle,
  fmtDate,
  issueNote,
  palette,
  pdfTheme,
  type InfoItem,
} from './pdfTheme'
import { computeFitness, formatResultValue, type FitnessResult } from '../fitness/engine'
import type { Previous } from '../fitness/history'
import { parseMeasures, TEST_LABELS, type FitnessTestKey } from '../fitness/measures'
import type { Sex } from '../assessment/protocols'

export type FitnessPdfData = {
  orgName: string
  subjectName: string
  subjectLabel?: string
  evaluatorName?: string | null
  logoUrl?: string | null
  sex: Sex
  ageYears: number | null
  testedAt: string
  measures: unknown
  notes?: string | null
  previous?: Partial<Record<FitnessTestKey, Previous>>
}

const CARDIO_KEYS = new Set<FitnessTestKey>(['cooper', 'rockport', 'queens'])

const s = StyleSheet.create({
  groupBlock: {
    marginBottom: 0,
  },
  cardsStack: {
    gap: 5,
  },
  card: {
    borderWidth: 0.6,
    borderColor: palette.hairline,
    borderRadius: 6,
    paddingVertical: 6.5,
    paddingHorizontal: 11,
    backgroundColor: palette.paper,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardTitleCol: {
    flex: 1,
    gap: 1.5,
  },
  testLabel: {
    fontSize: 9.5,
    fontWeight: 600,
    color: palette.ink,
  },
  rawSummary: {
    fontSize: 8,
    color: palette.muted,
  },
  valueCol: {
    alignItems: 'flex-end',
    gap: 1,
  },
  valueCaption: {
    fontSize: 7.5,
    color: palette.muted,
  },
  valueText: {
    fontSize: 11.5,
    fontWeight: 600,
    color: palette.ink,
  },
  cardBottom: {
    marginTop: 5,
    paddingTop: 4.5,
    borderTopWidth: 0.6,
    borderTopColor: palette.hairline,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  meterRow: {
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
  },
  meterPill: {
    width: 11,
    height: 4,
    borderRadius: 2,
  },
  ratingLabel: {
    fontSize: 8.5,
    fontWeight: 600,
  },
  ratingNote: {
    fontSize: 8,
    color: palette.muted,
  },
  deltaText: {
    fontSize: 8,
    color: palette.muted,
  },
  notesBox: {
    padding: 8,
    borderRadius: 6,
    borderWidth: 0.6,
    borderColor: palette.hairline,
    backgroundColor: palette.surface,
  },
  notesText: {
    fontSize: 9,
    color: palette.ink,
    lineHeight: 1.45,
  },
})

function ratingColor(level: number, levels: number): string {
  if (level >= levels - 2) return palette.green
  if (level >= Math.floor(levels / 2)) return palette.ink
  return palette.amber
}

function formatDelta(curr: FitnessResult, prev: Previous): string {
  const digits = curr.key === 'push_ups' || curr.key === 'sit_ups' ? 0 : 1
  const diff = curr.value - prev.value
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : ''
  const txt = Math.abs(diff).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return `${sign}${txt} ${curr.unit}`
}

function ResultCard({
  result,
  prev,
}: {
  result: FitnessResult
  prev?: Previous
}) {
  const color = result.rating ? ratingColor(result.rating.level, result.rating.levels) : palette.muted
  return (
    <View style={s.card} wrap={false}>
      <View style={s.cardTop}>
        <View style={s.cardTitleCol}>
          <Text style={s.testLabel}>{TEST_LABELS[result.key]}</Text>
          {result.detail.length > 0 ? (
            <Text style={s.rawSummary}>{result.detail.join(' · ')}</Text>
          ) : null}
        </View>
        <View style={s.valueCol}>
          <Text style={s.valueText}>{formatResultValue(result)}</Text>
          <Text style={s.valueCaption}>{result.valueLabel}</Text>
        </View>
      </View>

      <View style={s.cardBottom}>
        <View style={s.ratingRow}>
          {result.rating ? (
            <>
              <View style={s.meterRow}>
                {Array.from({ length: result.rating.levels }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      s.meterPill,
                      {
                        backgroundColor:
                          i <= result.rating!.level ? color : palette.hairline,
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={[s.ratingLabel, { color }]}>{result.rating.label}</Text>
            </>
          ) : (
            <Text style={s.ratingNote}>Sem classificação normativa</Text>
          )}
        </View>
        {prev ? (
          <Text style={s.deltaText}>
            {formatDelta(result, prev)} desde {fmtDate(prev.testedAt) ?? prev.testedAt}
            {prev.ratingLabel && prev.ratingLabel !== result.rating?.label
              ? ` (era ${prev.ratingLabel})`
              : ''}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function FitnessReportDocument({ data }: { data: FitnessPdfData }) {
  const subjectLabel = data.subjectLabel ?? 'Avaliado'
  const results =
    data.ageYears != null
      ? computeFitness(parseMeasures(data.measures), data.sex, data.ageYears)
      : []

  const cardio = results.filter((r) => CARDIO_KEYS.has(r.key))
  const neuro = results.filter((r) => !CARDIO_KEYS.has(r.key))
  const sources = [...new Set(results.map((r) => r.rating?.source).filter((x): x is string => !!x))]
  const warnings = results.flatMap((r) =>
    r.notes.map((msg, i) => ({
      code: `${r.key}:${i}`,
      message: `${TEST_LABELS[r.key]}: ${msg}`,
    }))
  )

  const dateText = fmtDate(data.testedAt) ?? data.testedAt
  const infoItems: InfoItem[] = [
    { label: subjectLabel, value: data.subjectName || '—' },
    { label: 'Data da coleta', value: dateText },
    {
      label: 'Sexo',
      value: data.sex === 'F' ? 'Feminino' : 'Masculino',
    },
    {
      label: 'Idade na coleta',
      value: data.ageYears != null ? `${data.ageYears} anos` : 'Não informada',
    },
  ]

  return (
    <Document
      title={`Testes físicos — ${data.subjectName}`}
      author={data.orgName}
    >
      <Page size="A4" style={pdfTheme.page}>
        <ReportRunningHeader
          title="Testes físicos"
          subject={data.subjectName}
        />

        <ReportHeader
          logoUrl={data.logoUrl}
          orgName={data.orgName}
          title="Testes físicos"
          subtitle={`Coleta de ${dateText}`}
        />

        <InfoCard items={infoItems} />

        {cardio.length > 0 ? (
          <View style={s.groupBlock}>
            <SectionTitle detail="VO2máx estimado · referência brasileira (Herdy & Caixeta, 2016)">
              Aptidão cardiorrespiratória
            </SectionTitle>
            <View style={s.cardsStack}>
              {cardio.map((r) => (
                <ResultCard
                  key={r.key}
                  result={r}
                  prev={data.previous?.[r.key]}
                />
              ))}
            </View>
          </View>
        ) : null}

        {neuro.length > 0 ? (
          <View style={s.groupBlock}>
            <SectionTitle detail="Força, resistência muscular e flexibilidade">
              Testes neuromotores
            </SectionTitle>
            <View style={s.cardsStack}>
              {neuro.map((r) => (
                <ResultCard
                  key={r.key}
                  result={r}
                  prev={data.previous?.[r.key]}
                />
              ))}
            </View>
          </View>
        ) : null}

        {data.notes?.trim() ? (
          <View style={s.groupBlock} wrap={false}>
            <SectionTitle>Observações</SectionTitle>
            <View style={s.notesBox}>
              <Text style={s.notesText}>{data.notes.trim()}</Text>
            </View>
          </View>
        ) : null}

        <MethodNote warnings={warnings}>
          VO2máx estimado por equação de campo, não medido por ergoespirometria.
          {sources.length > 0 ? ` Classificação: ${sources.join('; ')}.` : ''}{' '}
          A evolução individual deve ser acompanhada comparando sempre o mesmo protocolo e condições
          semelhantes de coleta.
        </MethodNote>

        <ReportFooter
          note={issueNote()}
          evaluator={data.evaluatorName}
        />
      </Page>
    </Document>
  )
}

export async function generateFitnessPdf(data: FitnessPdfData): Promise<Blob> {
  registerReportFonts()
  return pdf(<FitnessReportDocument data={data} />).toBlob()
}
