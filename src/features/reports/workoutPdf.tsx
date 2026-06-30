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
  effective: '#b9a3f0',
  optimal: palette.violet,
  high: palette.magenta,
  above: '#dc2626',
}

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
  section: { marginBottom: 14 },
  dayTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: PLUM, marginBottom: 4, marginTop: 6 },
  exRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  exName: { flex: 1, paddingRight: 8 },
  exPrescription: { fontFamily: 'Helvetica-Bold', color: PLUM },
  exMeta: { fontSize: 8, color: palette.muted, marginBottom: 3 },
  muted: { color: palette.muted },
  // barras de volume (com faixa MAV e teto MRV)
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  barLabel: { width: 92, fontSize: 8 },
  barTrack: { position: 'relative', width: 270, height: 7, backgroundColor: '#eee', borderRadius: 2 },
  barBand: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#efe9fb' },
  barFill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 2 },
  barMrv: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#9a8fb0' },
  barValue: { width: 18, textAlign: 'right', fontSize: 8, fontFamily: 'Helvetica-Bold' },
  barZone: { width: 64, textAlign: 'right', fontSize: 7, color: palette.muted },
  method: { fontSize: 8, color: palette.muted, marginTop: 6, lineHeight: 1.4 },
  weekRow: { paddingVertical: 1 },
  reproNote: { fontSize: 8, color: palette.muted, marginTop: 6, lineHeight: 1.4 },
})

// inteiro sem casas; fracionado com 1 casa (séries fracionadas: 2.5, 13)
function fmtSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function VolumeChart({ snapshot }: { snapshot: VolumeSnapshot }) {
  const items = MUSCLE_ORDER.map((m) => ({
    muscle: m,
    label: MUSCLE_LABELS[m],
    value: snapshot.typicalByMuscle[m] ?? 0,
  })).filter((it) => it.value > 0)
  if (items.length === 0) return null

  return (
    <View style={styles.section}>
      <SectionTitle>
        Volume semanal por grupo muscular (semana {snapshot.typicalWeek})
      </SectionTitle>
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

function exerciseLine(ex: WorkoutExerciseRow): string {
  const parts: string[] = []
  if (ex.rir != null) parts.push(`RIR ${fmtSets(ex.rir)}`)
  if (ex.rest_seconds != null) parts.push(`${ex.rest_seconds}s descanso`)
  if (ex.tempo) parts.push(`cadência ${ex.tempo}`)
  return parts.join(' · ')
}

function DayBlock({
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
    <View wrap={false}>
      <Text style={styles.dayTitle}>
        Treino {day.label}
        {day.name ? ` — ${day.name}` : ''}
      </Text>
      {rows.map((ex, i) => {
        const meta = exerciseLine(ex)
        return (
          <View key={ex.id}>
            <View style={styles.exRow}>
              <Text style={styles.exName}>
                {i + 1}. {names[ex.exercise_id] ?? 'Exercício'}
              </Text>
              <Text style={styles.exPrescription}>
                {ex.sets}×{ex.reps}
              </Text>
            </View>
            {meta ? <Text style={styles.exMeta}>{meta}</Text> : null}
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
      {allWeeks.map((n) => {
        const meta = weekLabel.get(n)
        const ovs = overrides.filter((o) => o.week_number === n)
        return (
          <View key={n} style={styles.weekRow}>
            <Text>
              Semana {n}
              {meta?.label ? ` — ${meta.label}` : ''}
              {meta?.is_deload ? ' (deload)' : ''}
            </Text>
            {ovs.map((o) => (
              <Text key={o.id} style={styles.exMeta}>
                · {exNameById.get(o.workout_exercise_id) ?? 'Exercício'}: {overrideDesc(o)}
              </Text>
            ))}
          </View>
        )
      })}
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

        {snapshot ? <VolumeChart snapshot={snapshot} /> : null}

        <View style={styles.section}>
          <SectionTitle>Divisões</SectionTitle>
          {orderedDays.map((day) => (
            <DayBlock key={day.id} day={day} exercises={exercises} names={exerciseNames} />
          ))}
        </View>

        <WeeksSection data={data} />

        {plan.notes ? (
          <View style={styles.section}>
            <SectionTitle>Observações</SectionTitle>
            <Text>{plan.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.reproNote}>
          Plano reproduzível a partir do snapshot registrado. Documento de uso profissional.
        </Text>

        <ReportFooter note="Montado no Avalix" />
      </Page>
    </Document>
  )
}

export async function generateWorkoutPdf(data: WorkoutPdfData): Promise<Blob> {
  return pdf(<WorkoutDoc data={data} />).toBlob()
}
