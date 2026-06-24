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

const PLUM = '#2A0E52'

// cor da zona de volume no PDF (hex; sem CSS var aqui)
const ZONE_HEX: Record<LandmarkZone, string> = {
  below: '#d97706',
  effective: '#b9a3f0',
  optimal: '#8b5cf6',
  high: '#d4537e',
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
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: '#1a1a1a', fontFamily: 'Helvetica' },
  plate: {
    backgroundColor: PLUM,
    color: '#ECE3FA',
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  plateText: { fontSize: 12, fontFamily: 'Helvetica-Bold', letterSpacing: 2, color: '#ECE3FA' },
  org: { fontSize: 9, color: '#666' },
  h1: { fontSize: 16, marginTop: 2, marginBottom: 12, color: PLUM },
  meta: { marginBottom: 14, lineHeight: 1.4 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  dayTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: PLUM, marginBottom: 4, marginTop: 6 },
  exRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  exName: { flex: 1, paddingRight: 8 },
  exPrescription: { fontFamily: 'Helvetica-Bold' },
  exMeta: { fontSize: 8, color: '#666', marginBottom: 3 },
  muted: { color: '#666' },
  // barras de volume (com faixa MAV e teto MRV)
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  barLabel: { width: 92, fontSize: 8 },
  barTrack: { position: 'relative', width: 270, height: 7, backgroundColor: '#eee', borderRadius: 2 },
  barBand: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#efe9fb' },
  barFill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 2 },
  barMrv: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#9a8fb0' },
  barValue: { width: 18, textAlign: 'right', fontSize: 8, fontFamily: 'Helvetica-Bold' },
  barZone: { width: 64, textAlign: 'right', fontSize: 7, color: '#666' },
  method: { fontSize: 8, color: '#666', marginTop: 6, lineHeight: 1.4 },
  weekRow: { paddingVertical: 1 },
  footer: { marginTop: 20, fontSize: 8, color: '#888', lineHeight: 1.4 },
})

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

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
      <Text style={styles.sectionTitle}>
        Volume semanal por grupo muscular (semana {snapshot.typicalWeek})
      </Text>
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
      <Text style={styles.sectionTitle}>Organização por semana</Text>
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

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.plate}>
          <Text style={styles.plateText}>AVALIX</Text>
        </View>
        <Text style={styles.org}>{data.orgName}</Text>
        <Text style={styles.h1}>Plano de Treino</Text>

        <View style={styles.meta}>
          <Text>Avaliado: {data.subjectName}</Text>
          <Text>Plano: {plan.name}</Text>
          <Text>Objetivo: {goalLabel(plan.goal)}</Text>
          <Text>
            Mesociclo: {plan.weeks} {plan.weeks === 1 ? 'semana' : 'semanas'}
            {startsOn ? ` · início ${startsOn}` : ''}
          </Text>
        </View>

        {snapshot ? <VolumeChart snapshot={snapshot} /> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Divisões</Text>
          {orderedDays.map((day) => (
            <DayBlock key={day.id} day={day} exercises={exercises} names={exerciseNames} />
          ))}
        </View>

        <WeeksSection data={data} />

        {plan.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Observações</Text>
            <Text>{plan.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          Gerado pelo Avalix
          {snapshot ? ` · motor de volume ${snapshot.engineVersion}` : ''}. Plano reproduzível a
          partir do snapshot registrado. Documento de uso profissional.
        </Text>
      </Page>
    </Document>
  )
}

export async function generateWorkoutPdf(data: WorkoutPdfData): Promise<Blob> {
  return pdf(<WorkoutDoc data={data} />).toBlob()
}
