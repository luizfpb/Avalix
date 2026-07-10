import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'
import type {
  WorkoutDayRow,
  WorkoutExerciseRow,
  WorkoutPlanRow,
  WorkoutWeekOverrideRow,
  WorkoutWeekRow,
} from '../workout/api'
import type { VolumeSnapshot, LandmarkZone } from '../workout/volume'
import {
  MUSCLE_LABELS,
  MUSCLE_ORDER,
  VOLUME_METHOD_NOTE,
  VOLUME_LANDMARKS_NOTE,
  ZONE_LABELS,
  goalLabel,
  landmarkBar,
} from '../workout/volume'
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

const PLUM = palette.plum

// cor da zona de volume no PDF (hex; sem CSS var aqui)
const ZONE_HEX: Record<LandmarkZone, string> = {
  below: '#d97706',
  effective: '#7c93b8',
  optimal: palette.violet,
  high: '#b06fd0',
  above: '#dc2626',
}
// ordem de exibição da legenda de zonas
const ZONE_ORDER: LandmarkZone[] = ['below', 'effective', 'optimal', 'high', 'above']

export type WorkoutPdfData = {
  orgName: string
  subjectName: string
  plan: WorkoutPlanRow
  days: WorkoutDayRow[]
  exercises: WorkoutExerciseRow[]
  weeks: WorkoutWeekRow[]
  overrides: WorkoutWeekOverrideRow[]
  // exercise_id -> nome (montado na página a partir do catálogo)
  exerciseNames: Record<string, string>
  // avaliação/postura de origem (a ponte avaliação->prescrição), se vinculadas
  source?: {
    assessmentDate?: string | null
    bodyFatPct?: number | null
    postureDate?: string | null
  }
  // logo da org como data URL (branding); ausente = plaqueta AVALIX
  logoUrl?: string | null
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  intro: { fontSize: 8.5, color: palette.muted, marginBottom: 9, lineHeight: 1.45 },

  // ---- Divisão: cartão com cabeçalho (letra + nome) e tabela de exercícios ----
  dayCard: {
    marginBottom: 11,
    borderWidth: 0.8,
    borderColor: palette.hairline,
    borderRadius: 7,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderBottomWidth: 0.8,
    borderBottomColor: palette.hairline,
  },
  dayBadge: {
    width: 23,
    height: 23,
    borderRadius: 6,
    backgroundColor: palette.violet,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  dayBadgeText: { fontSize: 12.5, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  dayName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: PLUM },
  daySub: { fontSize: 7.5, color: palette.muted, marginTop: 1 },

  // cabeçalho da tabela
  thead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0ebfa',
    paddingVertical: 4,
    paddingHorizontal: 11,
    borderBottomWidth: 0.6,
    borderBottomColor: '#ddd4f0',
  },
  th: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: palette.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderBottomWidth: 0.5,
    borderBottomColor: palette.hairline,
  },
  trAlt: { backgroundColor: '#f8f6fd' },
  trLast: { borderBottomWidth: 0 },
  tdNum: { fontSize: 8.5, color: palette.muted },
  tdName: { fontSize: 9.5, color: palette.ink },
  tdNameSub: { fontSize: 7, color: palette.muted, marginTop: 1.5, lineHeight: 1.35 },
  tdStrong: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: PLUM },
  tdCell: { fontSize: 8.5, color: '#4a4a4a' },

  // colunas da tabela de exercícios
  colNum: { width: 20, textAlign: 'center' },
  colName: { flex: 1, paddingRight: 8 },
  colSets: { width: 40, textAlign: 'center' },
  colReps: { width: 58, textAlign: 'center' },
  colRir: { width: 38, textAlign: 'center' },
  colRest: { width: 62, textAlign: 'center' },

  // ---- Organização por semana ----
  weekWrap: { borderWidth: 0.8, borderColor: palette.hairline, borderRadius: 7 },
  weekRow: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderBottomWidth: 0.5,
    borderBottomColor: palette.hairline,
  },
  weekHead: { flexDirection: 'row', alignItems: 'center' },
  weekNum: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: PLUM },
  weekLabel: { fontSize: 9, color: palette.muted, marginLeft: 5 },
  deloadPill: {
    marginLeft: 7,
    backgroundColor: '#efe9fb',
    color: palette.violet,
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingVertical: 1.5,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  weekOverride: { fontSize: 8, color: palette.muted, marginTop: 3, marginLeft: 3, lineHeight: 1.4 },

  // ---- Observações (callout) ----
  notesBox: {
    backgroundColor: palette.surface,
    borderLeftWidth: 3,
    borderLeftColor: palette.violet,
    borderRadius: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  notesText: { fontSize: 9.5, lineHeight: 1.5, color: palette.ink },

  // ---- Volume (apêndice) ----
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 13, marginBottom: 3 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2, marginRight: 4 },
  legendText: { fontSize: 7.5, color: palette.muted },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  barLabel: { width: 104, fontSize: 8, color: palette.ink },
  barTrack: {
    position: 'relative',
    width: 252,
    height: 8,
    backgroundColor: '#ece7f5',
    borderRadius: 4,
  },
  barBand: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#ddd0f7' },
  barFill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 4 },
  barMrv: { position: 'absolute', top: -1.5, bottom: -1.5, width: 1.2, backgroundColor: '#6b5e86' },
  barValue: { width: 24, textAlign: 'right', fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: PLUM },
  barZone: { width: 84, textAlign: 'right', fontSize: 7, color: palette.muted },
  method: { fontSize: 7.5, color: palette.muted, marginTop: 8, lineHeight: 1.45 },

  reproNote: { fontSize: 8, color: palette.muted, marginTop: 10, lineHeight: 1.4 },
})

// inteiro sem casas; fracionado com 1 casa (séries fracionadas: 2.5, 13)
function fmtSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// cadência e nota do exercício, quando houver, viram uma sublinha discreta
function exerciseSub(ex: WorkoutExerciseRow): string {
  const parts: string[] = []
  if (ex.tempo) parts.push(`cadência ${ex.tempo}`)
  if (ex.notes) parts.push(ex.notes)
  return parts.join(' · ')
}

// Uma divisão (Treino A/B/C) como cartão: cabeçalho com a letra num selo e o
// nome, seguido da tabela de exercícios (nº, exercício, séries, reps, RIR,
// descanso) com zebra pra leitura. wrap={false}: a divisão não parte no meio.
function DayCard({
  day,
  exercises,
  names,
}: {
  day: WorkoutDayRow
  exercises: WorkoutExerciseRow[]
  names: Record<string, string>
}) {
  const rows = exercises
    .filter((e) => e.day_id === day.id)
    .slice()
    .sort((a, b) => a.position - b.position)

  return (
    <View style={styles.dayCard} wrap={false}>
      <View style={styles.dayHeader}>
        <View style={styles.dayBadge}>
          <Text style={styles.dayBadgeText}>{day.label}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.dayName}>{day.name ? day.name : `Treino ${day.label}`}</Text>
          <Text style={styles.daySub}>
            Treino {day.label} · {rows.length} {rows.length === 1 ? 'exercício' : 'exercícios'}
          </Text>
        </View>
      </View>

      <View style={styles.thead}>
        <Text style={[styles.th, styles.colNum]}>#</Text>
        <Text style={[styles.th, styles.colName]}>Exercício</Text>
        <Text style={[styles.th, styles.colSets]}>Séries</Text>
        <Text style={[styles.th, styles.colReps]}>Reps</Text>
        <Text style={[styles.th, styles.colRir]}>RIR</Text>
        <Text style={[styles.th, styles.colRest]}>Descanso</Text>
      </View>

      {rows.map((ex, i) => {
        const sub = exerciseSub(ex)
        const last = i === rows.length - 1
        return (
          <View
            key={ex.id}
            style={[styles.tr, ...(i % 2 === 1 ? [styles.trAlt] : []), ...(last ? [styles.trLast] : [])]}
          >
            <Text style={[styles.tdNum, styles.colNum]}>{i + 1}</Text>
            <View style={styles.colName}>
              <Text style={styles.tdName}>{names[ex.exercise_id] ?? 'Exercício'}</Text>
              {sub ? <Text style={styles.tdNameSub}>{sub}</Text> : null}
            </View>
            <Text style={[styles.tdStrong, styles.colSets]}>{fmtSets(ex.sets)}</Text>
            <Text style={[styles.tdStrong, styles.colReps]}>{ex.reps}</Text>
            <Text style={[styles.tdCell, styles.colRir]}>
              {ex.rir != null ? fmtSets(ex.rir) : '—'}
            </Text>
            <Text style={[styles.tdCell, styles.colRest]}>
              {ex.rest_seconds != null ? `${ex.rest_seconds}s` : '—'}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function overrideDesc(o: WorkoutWeekOverrideRow): string {
  if (o.is_skipped) return 'não executar'
  const parts: string[] = []
  if (o.sets != null) parts.push(`${o.sets} séries`)
  if (o.reps != null) parts.push(`${o.reps} reps`)
  if (o.rir != null) parts.push(`RIR ${fmtSets(o.rir)}`)
  if (o.rest_seconds != null) parts.push(`${o.rest_seconds}s`)
  return parts.length ? parts.join(' · ') : 'ajuste'
}

function WeeksSection({ data }: { data: WorkoutPdfData }) {
  const { weeks, overrides, exercises, exerciseNames } = data
  if (weeks.length === 0 && overrides.length === 0) return null

  // workout_exercise_id -> nome do exercício, pros overrides
  const exNameById = new Map(
    exercises.map((e) => [e.id, exerciseNames[e.exercise_id] ?? 'Exercício'])
  )
  const weekLabel = new Map(weeks.map((w) => [w.week_number, w]))
  const weeksWithOverrides = [...new Set(overrides.map((o) => o.week_number))].sort((a, b) => a - b)
  const allWeeks = [...new Set([...weeks.map((w) => w.week_number), ...weeksWithOverrides])].sort(
    (a, b) => a - b
  )

  return (
    <View style={styles.section} wrap={false}>
      <SectionTitle>Organização por semana</SectionTitle>
      <View style={styles.weekWrap}>
        {allWeeks.map((n, idx) => {
          const meta = weekLabel.get(n)
          const ovs = overrides.filter((o) => o.week_number === n)
          const last = idx === allWeeks.length - 1
          return (
            <View key={n} style={[styles.weekRow, ...(last ? [styles.trLast] : [])]}>
              <View style={styles.weekHead}>
                <Text style={styles.weekNum}>Semana {n}</Text>
                {meta?.label ? <Text style={styles.weekLabel}>{meta.label}</Text> : null}
                {meta?.is_deload ? <Text style={styles.deloadPill}>Deload</Text> : null}
              </View>
              {ovs.map((o) => (
                <Text key={o.id} style={styles.weekOverride}>
                  · {exNameById.get(o.workout_exercise_id) ?? 'Exercício'}: {overrideDesc(o)}
                </Text>
              ))}
            </View>
          )
        })}
      </View>
    </View>
  )
}

// Apêndice de volume, na última folha (break): barras por grupo muscular contra
// a faixa recomendada (MAV) e o teto (MRV), com legenda das zonas.
function VolumeAppendix({ snapshot }: { snapshot: VolumeSnapshot }) {
  const items = MUSCLE_ORDER.map((m) => ({
    muscle: m,
    label: MUSCLE_LABELS[m],
    value: snapshot.typicalByMuscle[m] ?? 0,
  })).filter((it) => it.value > 0)
  if (items.length === 0) return null

  return (
    <View style={styles.section} break>
      <SectionTitle>Volume semanal por grupo muscular</SectionTitle>
      <Text style={styles.intro}>
        Séries semanais somadas por grupo (contagem fracionada: primário 1,0 · secundário 0,5), na
        semana {snapshot.typicalWeek}. A faixa clara marca o volume recomendado (MAV) e o traço, o
        teto (MRV).
      </Text>

      <View style={styles.legendRow}>
        {ZONE_ORDER.map((z) => (
          <View key={z} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: ZONE_HEX[z] }]} />
            <Text style={styles.legendText}>{ZONE_LABELS[z]}</Text>
          </View>
        ))}
      </View>

      {items.map((it) => {
        const bar = landmarkBar(it.muscle, it.value)
        const color = bar.zone ? ZONE_HEX[bar.zone] : '#b9a3f0'
        return (
          <View key={it.muscle} style={styles.barRow}>
            <Text style={styles.barLabel}>{it.label}</Text>
            <View style={styles.barTrack}>
              {bar.zone ? (
                <View
                  style={[
                    styles.barBand,
                    {
                      left: `${bar.mavLowPct * 100}%`,
                      width: `${Math.max(0, bar.mavHighPct - bar.mavLowPct) * 100}%`,
                    },
                  ]}
                />
              ) : null}
              <View style={[styles.barFill, { width: `${bar.fillPct * 100}%`, backgroundColor: color }]} />
              {bar.zone && bar.mrvPct < 1 ? (
                <View style={[styles.barMrv, { left: `${bar.mrvPct * 100}%` }]} />
              ) : null}
            </View>
            <Text style={styles.barValue}>{fmtSets(it.value)}</Text>
            <Text style={styles.barZone}>{bar.zone ? ZONE_LABELS[bar.zone] : 'sem ref.'}</Text>
          </View>
        )
      })}
      <Text style={styles.method}>{VOLUME_METHOD_NOTE}</Text>
      <Text style={styles.method}>{VOLUME_LANDMARKS_NOTE}</Text>
    </View>
  )
}

function WorkoutDoc({ data }: { data: WorkoutPdfData }) {
  const { plan, days, exercises, exerciseNames } = data
  const snapshot = plan.volume as VolumeSnapshot | null
  const orderedDays = days.slice().sort((a, b) => a.position - b.position)
  const startsOn = fmtDate(plan.starts_on)
  const schedule =
    plan.weekly_schedule.length > 0 ? plan.weekly_schedule : orderedDays.map((d) => d.label)

  const sourceText = data.source
    ? [
        data.source.assessmentDate
          ? `avaliação ${fmtDate(data.source.assessmentDate)}${
              data.source.bodyFatPct != null ? ` · ${data.source.bodyFatPct.toFixed(1)}% gordura` : ''
            }`
          : '',
        data.source.postureDate ? `postura ${fmtDate(data.source.postureDate)}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const info: InfoItem[] = [
    { label: 'Avaliado', value: data.subjectName },
    { label: 'Plano', value: plan.name },
    { label: 'Objetivo', value: goalLabel(plan.goal) },
    {
      label: 'Mesociclo',
      value: `${plan.weeks} ${plan.weeks === 1 ? 'semana' : 'semanas'}${
        startsOn ? ` · início ${startsOn}` : ''
      }`,
    },
    ...(schedule.length > 0
      ? [{ label: 'Sequência semanal', value: schedule.join(' · '), wide: true }]
      : []),
    ...(sourceText ? [{ label: 'Base da prescrição', value: sourceText, wide: true }] : []),
  ]

  return (
    <Document>
      <Page size="A4" style={pdfTheme.page}>
        <ReportHeader
          logoUrl={data.logoUrl}
          orgName={data.orgName}
          title="Plano de Treino"
          subtitle={plan.name}
        />

        <InfoCard items={info} />

        {/* O treino em primeiro lugar — cada divisão num cartão com tabela. */}
        <View style={styles.section}>
          <SectionTitle>Divisões do treino</SectionTitle>
          {orderedDays.map((day) => (
            <DayCard key={day.id} day={day} exercises={exercises} names={exerciseNames} />
          ))}
        </View>

        <WeeksSection data={data} />

        {plan.notes ? (
          <View style={styles.section} wrap={false}>
            <SectionTitle>Observações</SectionTitle>
            <View style={styles.notesBox}>
              <Text style={styles.notesText}>{plan.notes}</Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.reproNote}>
          Plano reproduzível a partir do snapshot registrado. Documento de uso profissional.
        </Text>

        {/* Gráfico de volume como apêndice na última folha (não na frente do treino). */}
        {snapshot ? <VolumeAppendix snapshot={snapshot} /> : null}

        <ReportFooter note="Montado no Avalix" />
      </Page>
    </Document>
  )
}

export async function generateWorkoutPdf(data: WorkoutPdfData): Promise<Blob> {
  return pdf(<WorkoutDoc data={data} />).toBlob()
}
