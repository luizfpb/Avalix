import { Document, Page, View, StyleSheet, pdf } from '@react-pdf/renderer'
// Text saneado: a fonte padrão é WinAnsi e trocaria glifo em silêncio para
// qualquer caractere fora do CP1252 digitado pelo profissional. Ver pdfText.tsx.
import { Text } from './pdfText'
import type {
  WorkoutDayRow,
  WorkoutExerciseRow,
  WorkoutPlanRow,
  WorkoutWeekOverrideRow,
  WorkoutWeekRow,
} from '../workout/api'
import { weekSessionLabels } from '../workout/progress'
import { groupHint, groupLabel, techniqueLabel, toRowBlocks } from '../workout/groups'
import { registerReportFonts } from './pdfFonts'
import { LIMITE_BLOCO_ATOMICO, estimateTextHeight } from './pdfLayout'
import { goalLabel } from '../workout/volume'
import {
  InfoCard,
  MethodNote,
  ReportFooter,
  ReportHeader,
  ReportRunningHeader,
  SectionTitle,
  fmtDate,
  palette,
  pdfTheme,
  type InfoItem,
} from './pdfTheme'

export type WorkoutPdfData = {
  orgName: string
  subjectName: string
  // profissional responsavel, impresso no rodape de todas as paginas
  evaluatorName?: string | null
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
  section: { marginBottom: 18 },
  intro: { fontSize: 7.5, color: palette.muted, marginBottom: 9, lineHeight: 1.45 },
  schedule: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  scheduleCopy: { flexGrow: 1, flexBasis: 165, paddingRight: 12 },
  scheduleTitle: { fontSize: 10, fontWeight: 700 },
  scheduleDetail: { fontSize: 7.5, color: palette.muted, marginTop: 3 },
  sessions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 340, gap: 7 },
  session: { alignItems: 'center', width: 35 },
  sessionLabel: { fontSize: 6, color: palette.muted, marginBottom: 4 },
  sessionBadge: { width: 35, minHeight: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, padding: 4 },
  sessionFirst: { backgroundColor: palette.violet },
  sessionLetter: { fontSize: 14, fontWeight: 700, color: palette.violet },
  sessionLetterFirst: { color: palette.paper },

  // ---- Divisão: cartão com cabeçalho (letra + nome) e tabela de exercícios ----
  dayCard: {
    marginBottom: 20,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  dayBadge: {
    minWidth: 37,
    minHeight: 37,
    padding: 5,
    borderRadius: 9,
    backgroundColor: palette.violet,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  dayBadgeText: { fontSize: 21, fontFamily: 'Manrope', fontWeight: 700, color: palette.paper },
  dayName: { fontSize: 14, fontFamily: 'Manrope', fontWeight: 700, color: palette.ink, lineHeight: 1.25 },
  daySub: { fontSize: 7.5, color: palette.muted, marginTop: 1 },

  // cabeçalho da tabela
  thead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 5,
  },
  th: {
    fontSize: 6,
    color: palette.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderBottomWidth: 0.5,
    borderBottomColor: palette.hairline,
  },
  trLast: { borderBottomWidth: 0 },
  tdNum: { fontSize: 7.8, color: palette.muted, paddingTop: 1 },
  tdName: { fontSize: 9, fontWeight: 700, color: palette.ink, lineHeight: 1.35 },
  tdNameSub: { fontSize: 7, color: palette.muted, marginTop: 2, lineHeight: 1.45 },
  tdStrong: { fontSize: 8.5, fontFamily: 'Manrope', fontWeight: 700, color: palette.ink, paddingTop: 1 },
  tdCell: { fontSize: 8.5, color: palette.ink, paddingTop: 1 },

  // ---- Bloco (super-série / circuito) ----
  // Faixa acima dos membros, com a instrução de execução junto: a ficha
  // impressa é lida na academia por quem não sabe o jargão, e "Bi-set" sozinho
  // não diz o que fazer entre um exercício e outro.
  // A faixa e os membros dividem uma barra lateral contínua: sem ela dava para
  // ver onde o bloco começava, mas não onde ele terminava — e "quantos
  // exercícios entram na super-série" é justamente o que a ficha precisa dizer.
  // O padding esquerdo desconta a barra para as colunas não saírem do prumo.
  groupBand: {
    backgroundColor: palette.surface,
    paddingVertical: 5,
    paddingRight: 9,
    paddingLeft: 7,
    borderLeftWidth: 2,
    borderLeftColor: palette.violet,
  },
  groupBandName: {
    fontSize: 7,
    fontFamily: 'Manrope', fontWeight: 700,
    color: palette.violet,
    lineHeight: 1.4,
  },
  // Fundo e barra lateral delimitam os membros do bloco de ponta a ponta.
  trGroup: {
    backgroundColor: palette.surface,
    paddingLeft: 7,
    borderLeftWidth: 2,
    borderLeftColor: palette.violet,
  },

  // colunas da tabela de exercícios
  colNum: { width: 24 },
  colName: { flex: 1, paddingRight: 8 },
  colSets: { width: 35, textAlign: 'center' },
  colReps: { width: 50, textAlign: 'center' },
  colRir: { width: 29, textAlign: 'center' },
  colRest: { width: 46, textAlign: 'center' },

  // ---- Organização por semana ----
  weekRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: palette.hairline,
  },
  weekNum: { width: 44, paddingRight: 6, fontSize: 9, fontWeight: 700, color: palette.violet },
  weekHead: { width: 116, paddingRight: 14 },
  weekLabel: { fontSize: 8, fontWeight: 700, color: palette.ink, lineHeight: 1.4 },
  weekContinuation: { fontSize: 6.5, color: palette.muted, marginTop: 3 },
  weekBody: { flex: 1 },
  deloadPill: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: palette.surface,
    color: palette.violet,
    fontSize: 6.5,
    fontFamily: 'Manrope', fontWeight: 700,
    paddingVertical: 1.5,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  // "sem alteração": a semana existe e segue a prescrição base. Dizer isso é
  // informação — a ausência de linha deixaria dúvida se faltou preencher.
  // Sem fontStyle italic: só Manrope 400/700 normal são registradas em
  // pdfFonts, e pedir um itálico inexistente derruba a geração inteira
  // ("Could not resolve font for Manrope, fontStyle italic").
  weekSame: { fontSize: 7.5, lineHeight: 1.45, color: palette.muted },
  // Uma alteração: quem muda em negrito, seguido pelo ajuste prescrito.
  weekChange: { marginBottom: 5 },
  weekChangeLabel: { fontSize: 7.5, fontWeight: 700, color: palette.ink, lineHeight: 1.4 },
  weekChangeDesc: { fontSize: 7.5, color: palette.muted, lineHeight: 1.45 },

  // ---- Observações (callout) ----
  notesBox: {
    borderLeftWidth: 2,
    borderLeftColor: palette.violet,
    paddingLeft: 10,
  },
  notesText: { fontSize: 8, lineHeight: 1.5, color: palette.muted },
})

// inteiro sem casas; fracionado com 1 casa (séries fracionadas: 2.5, 13)
function fmtSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// Cadência compartilhada por TODOS os exercícios do dia, se houver. Sobe para o
// cabeçalho da divisão em vez de ser repetida embaixo de cada linha: numa
// divisão de seis exercícios com a mesma cadência, a repetição não informava
// nada e era a sujeira mais visível da tabela. Num dia de um exercício só não
// há o que economizar, então continua inline.
function commonTempo(rows: WorkoutExerciseRow[]): string | null {
  const first = rows[0]?.tempo
  if (!first || rows.length < 2) return null
  return rows.every((r) => r.tempo === first) ? first : null
}

// cadência e nota do exercício viram uma sublinha discreta. `hoisted` é a
// cadência já anunciada no cabeçalho do dia — essa não se repete.
function exerciseSub(ex: WorkoutExerciseRow, hoisted: string | null): string {
  const parts: string[] = []
  const tecnica = techniqueLabel(ex.technique)
  if (tecnica) parts.push(tecnica)
  if (ex.tempo && ex.tempo !== hoisted) parts.push(`cadência ${ex.tempo}`)
  if (ex.notes) parts.push(ex.notes)
  return parts.join(' · ')
}

// A estimativa deixa folga para a fonte e o cabeçalho de continuação. Nenhum
// contêiner cujo conteúdo pode superar uma folha recebe wrap={false} à força.
const LIMITE_CARTAO_ATOMICO = 440
const LARGURA_NOME_EXERCICIO = 595 - 34 * 2 - 9 * 2 - 24 - 35 - 50 - 29 - 46 - 8

export function estimateWorkoutExerciseHeight(
  ex: WorkoutExerciseRow,
  name: string,
  tempo: string | null = null
): number {
  const sub = exerciseSub(ex, tempo)
  const nameHeight = estimateTextHeight({ text: name, fontSize: 9, lineHeight: 1.35, width: LARGURA_NOME_EXERCICIO })
  const detailHeight = sub
    ? 2 + estimateTextHeight({ text: sub, fontSize: 7, lineHeight: 1.45, width: LARGURA_NOME_EXERCICIO })
    : 0
  const repsHeight = estimateTextHeight({ text: ex.reps ?? '—', fontSize: 8.5, lineHeight: 1.4, width: 50 })
  return 18 + Math.max(nameHeight + detailHeight, repsHeight)
}

// O mesmo cálculo governa linha, grupo e divisão. Contar só exercícios
// subestimava nomes compridos e observações com muitas linhas.
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
  const tempo = commonTempo(rows)
  const name = day.name || `Treino ${day.label}`
  const blocks = toRowBlocks(rows)
  const rowHeight = (ex: WorkoutExerciseRow) => estimateWorkoutExerciseHeight(ex, names[ex.exercise_id] ?? 'Exercício', tempo)
  const headerHeight = 26 + estimateTextHeight({ text: name, fontSize: 14, lineHeight: 1.25, width: 470 })
  const parte = headerHeight + 35 + rows.reduce((h, ex) => h + rowHeight(ex), 0) + blocks.filter((b) => b.kind).length * 28 > LIMITE_CARTAO_ATOMICO

  return (
    <View style={styles.dayCard} wrap={parte}>
      <View style={styles.dayHeader} wrap={headerHeight > LIMITE_CARTAO_ATOMICO} minPresenceAhead={48}>
        <View style={styles.dayBadge}>
          <Text style={styles.dayBadgeText}>{day.label}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.dayName}>{name}</Text>
          {/* "Treino A" saiu daqui: o selo à esquerda e o nome logo acima já
              dizem isso duas vezes. Sobra a contagem e a cadência da divisão. */}
          <Text style={styles.daySub}>
            Prescrição-base · {rows.length} {rows.length === 1 ? 'exercício' : 'exercícios'}
            {tempo ? ` · cadência ${tempo} em todos` : ''}
          </Text>
        </View>
      </View>

      {/* O rótulo da divisão vai junto na coluna do exercício: na continuação
          de um cartão que partiu, o selo "A" ficou na página anterior. */}
      <View style={styles.thead} fixed={parte}>
        <Text style={[styles.th, styles.colNum]} />
        <Text style={[styles.th, styles.colName]}>Exercício · Treino {day.label}</Text>
        <Text style={[styles.th, styles.colSets]}>Séries</Text>
        <Text style={[styles.th, styles.colReps]}>Reps</Text>
        <Text style={[styles.th, styles.colRir]}>RIR</Text>
        <Text style={[styles.th, styles.colRest]}>Pausa</Text>
      </View>

      {blocks.map((block) => {
        const linhas = block.items.map((ex, j) => {
          const i = block.start + j
          const sub = exerciseSub(ex, tempo)
          return (
            // Linhas usuais ficam juntas; texto livre maior que uma folha
            // precisa poder continuar, preservando o conteúdo completo.
            <View
              key={ex.id}
              wrap={rowHeight(ex) > LIMITE_CARTAO_ATOMICO}
              style={[
                styles.tr,
                ...(block.kind != null ? [styles.trGroup] : []),
              ]}
            >
              <Text style={[styles.tdNum, styles.colNum]}>{String(i + 1).padStart(2, '0')}</Text>
              <View style={styles.colName}>
                <Text style={styles.tdName}>{names[ex.exercise_id] ?? 'Exercício'}</Text>
                {sub ? <Text style={styles.tdNameSub}>{sub}</Text> : null}
              </View>
              <Text style={[styles.tdStrong, styles.colSets]}>{fmtSets(ex.sets)}</Text>
              {/* sem faixa prescrita (aquecimento, mobilidade, até a falha): o
                  travessão é a resposta certa, não uma célula vazia */}
              <Text style={[styles.tdStrong, styles.colReps]}>{ex.reps ?? '—'}</Text>
              <Text style={[styles.tdCell, styles.colRir]}>
                {ex.rir != null ? fmtSets(ex.rir) : '—'}
              </Text>
              <Text style={[styles.tdCell, styles.colRest]}>
                {ex.rest_seconds != null ? `${ex.rest_seconds} s` : '—'}
              </Text>
            </View>
          )
        })
        if (block.kind == null) return linhas
        // Faixas fixed aninhadas em tabelas fixed corrompem a paginação do
        // renderer. Grupos extensos são segmentados entre exercícios, com a
        // mesma instrução e a indicação de continuação em cada segmento.
        const starts = [0]
        let height = 28
        block.items.forEach((ex, i) => {
          const nextHeight = rowHeight(ex)
          if (i > starts[starts.length - 1] && height + nextHeight > 340) {
            starts.push(i)
            height = 28
          }
          height += nextHeight
        })
        return starts.map((start, segment) => {
          const end = starts[segment + 1] ?? block.items.length
          const segmentHeight = 28 + block.items.slice(start, end).reduce((h, ex) => h + rowHeight(ex), 0)
          return (
            <View key={`${block.key}-${start}`} wrap={segmentHeight > LIMITE_CARTAO_ATOMICO}>
              <View style={styles.groupBand} minPresenceAhead={32}>
                <Text style={styles.groupBandName}>
                  {groupLabel(block.kind!, block.items.length)}{segment > 0 ? ' · continuação' : ''} · {groupHint(block.kind!, block.items.length)}
                </Text>
              </View>
              {linhas.slice(start, end)}
            </View>
          )
        })
      })}
    </View>
  )
}

// O que este override muda EM RELAÇÃO À PRESCRIÇÃO BASE do exercício — só os
// campos diferentes. Antes imprimia-se o override inteiro, incluindo os campos
// que repetiam a tabela acima; string vazia = override que não altera nada.
type OverrideChanges = { skipped?: true; sets?: number; reps?: string; rir?: number; rest?: number; notes?: string }

function effectiveOverrideChanges(o: WorkoutWeekOverrideRow, base: WorkoutExerciseRow | undefined): OverrideChanges {
  if (o.is_skipped) return { skipped: true }
  const changes: OverrideChanges = {}
  if (o.sets != null && o.sets !== base?.sets) changes.sets = o.sets
  if (o.reps != null && o.reps !== base?.reps) changes.reps = o.reps
  if (o.rir != null && o.rir !== base?.rir) changes.rir = o.rir
  if (o.rest_seconds != null && o.rest_seconds !== base?.rest_seconds) {
    changes.rest = o.rest_seconds
  }
  if (o.notes && o.notes !== base?.notes) changes.notes = o.notes
  return changes
}

function overrideDiff(o: WorkoutWeekOverrideRow, base: WorkoutExerciseRow | undefined): string {
  const changes = effectiveOverrideChanges(o, base)
  if (changes.skipped) return 'não executar'
  const parts: string[] = []
  if (changes.sets != null) parts.push(`${fmtSets(changes.sets)} séries`)
  if (changes.reps != null) parts.push(`${changes.reps} reps`)
  if (changes.rir != null) parts.push(`RIR ${fmtSets(changes.rir)}`)
  if (changes.rest != null) parts.push(`${changes.rest}s de descanso`)
  if (changes.notes) parts.push(changes.notes)
  return parts.join(' · ')
}

export type WeekChangeGroup = { label: string; desc: string }

// Agrupa os overrides de UMA semana por alteração idêntica, para que a mesma
// mudança aplicada a vários exercícios vire uma linha só.
//
// É a correção do trecho mais confuso do documento. Um mesociclo de 8 semanas
// com override em 6 exercícios imprimia 48 linhas quase iguais — duas páginas
// repetindo "5 séries · 6-10 reps · RIR 1 · 120s" — e o profissional tinha de
// caçar no meio disso o que de fato mudava. Agrupado e diferenciado contra a
// base, vira uma linha por semana.
//
// O rótulo do grupo sobe de nível quando dá: um grupo que cobre o plano
// inteiro é "Todos os exercícios"; um que cobre exatamente uma divisão é
// "Treino A · todos os exercícios"; fora isso, os nomes mesmo.
export function weekChangeGroups(
  overrides: WorkoutWeekOverrideRow[],
  exercises: WorkoutExerciseRow[],
  days: WorkoutDayRow[],
  exerciseNames: Record<string, string>
): WeekChangeGroup[] {
  const baseById = new Map(exercises.map((e) => [e.id, e]))
  const perDay = new Map<string, number>()
  for (const e of exercises) perDay.set(e.day_id, (perDay.get(e.day_id) ?? 0) + 1)
  const dayLabel = new Map(days.map((d) => [d.id, d.label]))
  const multiDay = days.length > 1
  const nameCounts = new Map<string, number>()
  const rowNumbers = new Map<string, string>()
  for (const dayId of perDay.keys()) {
    exercises.filter((ex) => ex.day_id === dayId).sort((a, b) => a.position - b.position).forEach((ex, index) => {
      const nameKey = JSON.stringify([dayId, exerciseNames[ex.exercise_id] ?? 'Exercício'])
      nameCounts.set(nameKey, (nameCounts.get(nameKey) ?? 0) + 1)
      rowNumbers.set(ex.id, String(index + 1).padStart(2, '0'))
    })
  }

  // desc -> exercícios que sofreram exatamente essa alteração
  const byDesc = new Map<string, WorkoutExerciseRow[]>()
  const order: string[] = []
  for (const o of overrides) {
    const base = baseById.get(o.workout_exercise_id)
    const desc = overrideDiff(o, base)
    if (!desc) continue // override que não altera nada: não é notícia
    if (!byDesc.has(desc)) {
      byDesc.set(desc, [])
      order.push(desc)
    }
    if (base) byDesc.get(desc)!.push(base)
  }

  return order.map((desc) => {
    const group = byDesc.get(desc)!
    const dayIds = new Set(group.map((e) => e.day_id))
    let label: string
    if (group.length === exercises.length && exercises.length > 1) {
      label = 'Todos os exercícios'
      // "todos os exercícios" só compensa a partir de dois: numa divisão de um
      // exercício só, o atalho esconde o nome e não economiza nada.
    } else if (
      dayIds.size === 1 &&
      group.length > 1 &&
      group.length === perDay.get(group[0].day_id)
    ) {
      label = `Treino ${dayLabel.get(group[0].day_id) ?? '?'} · todos os exercícios`
    } else {
      label = group
        .map((e) => {
          const nome = exerciseNames[e.exercise_id] ?? 'Exercício'
          const repeated = (nameCounts.get(JSON.stringify([e.day_id, nome])) ?? 0) > 1
          const identified = repeated ? `${rowNumbers.get(e.id)} · ${nome}` : nome
          return multiDay ? `${dayLabel.get(e.day_id) ?? '?'} · ${identified}` : identified
        })
        .join(', ')
    }
    return { label, desc }
  })
}

export type WeekPrescriptionRange = {
  first: number
  last: number
  label: string | null
  isDeload: boolean
  notes: string | null
  groups: WeekChangeGroup[]
}

// Só semanas consecutivas com a mesma prescrição E o mesmo contexto podem
// compartilhar uma linha. A nota da semana faz parte desse contexto.
export function weekPrescriptionRanges(
  data: Pick<WorkoutPdfData, 'weeks' | 'overrides' | 'exercises' | 'days' | 'exerciseNames'>
): WeekPrescriptionRange[] {
  const { weeks, overrides, exercises, days, exerciseNames } = data
  const weekMeta = new Map(weeks.map((w) => [w.week_number, w]))
  const baseById = new Map(exercises.map((ex) => [ex.id, ex]))
  const allWeeks = [...new Set([...weeks.map((w) => w.week_number), ...overrides.map((o) => o.week_number)])].sort(
    (a, b) => a - b
  )
  const ranges: WeekPrescriptionRange[] = []
  let previousChangesKey = ''
  for (const n of allWeeks) {
    const meta = weekMeta.get(n)
    const weekOverrides = overrides.filter((o) => o.week_number === n)
    // Nomes são apresentação, não identidade: duas linhas do plano podem
    // apontar para o mesmo exercício do catálogo e ter o mesmo nome impresso.
    const changesKey = JSON.stringify(weekOverrides.flatMap((override) => {
      const changes = effectiveOverrideChanges(override, baseById.get(override.workout_exercise_id))
      return Object.keys(changes).length ? [[override.workout_exercise_id, JSON.stringify(changes)]] : []
    }).sort(([leftId, leftChange], [rightId, rightChange]) => leftId.localeCompare(rightId) || leftChange.localeCompare(rightChange)))
    const next = {
      first: n,
      last: n,
      label: meta?.label || null,
      isDeload: meta?.is_deload ?? false,
      notes: meta?.notes || null,
      groups: weekChangeGroups(weekOverrides, exercises, days, exerciseNames),
    }
    const previous = ranges[ranges.length - 1]
    if (previous && previous.last + 1 === n && previous.label === next.label && previous.isDeload === next.isDeload && previous.notes === next.notes && previousChangesKey === changesKey) {
      previous.last = n
    } else {
      ranges.push(next)
    }
    previousChangesKey = changesKey
  }
  return ranges
}

function estimateWeekChangeHeight(group: WeekChangeGroup): number {
  return 5 + estimateTextHeight({ text: group.label, fontSize: 7.5, lineHeight: 1.4, width: 367 })
    + estimateTextHeight({ text: group.desc, fontSize: 7.5, lineHeight: 1.45, width: 367 })
}

function weekSegments(groups: WeekChangeGroup[], notes: string | null) {
  const notesHeight = notes ? estimateTextHeight({ text: notes, fontSize: 7.5, lineHeight: 1.45, width: 367 }) : 0
  const total = groups.reduce((height, group) => height + estimateWeekChangeHeight(group), notesHeight)
  if (total <= 500) return [{ groups, notes }]

  // Segmentos delimitados entre alterações mantêm a referência da semana em
  // cada continuação. Não usamos fixed dentro da linha flexível: a repetição
  // de elementos aninhados interfere no cálculo de altura do renderer.
  const segments: { groups: WeekChangeGroup[]; notes: string | null }[] = []
  let current: WeekChangeGroup[] = []
  let height = 0
  for (const group of groups) {
    const next = estimateWeekChangeHeight(group)
    if (current.length && height + next > 500) {
      segments.push({ groups: current, notes: null })
      current = []
      height = 0
    }
    current.push(group)
    height += next
  }
  if (current.length && notesHeight + height > 500) {
    segments.push({ groups: current, notes: null })
    current = []
  }
  segments.push({ groups: current, notes })
  return segments
}

function WeeksSection({ data }: { data: WorkoutPdfData }) {
  const ranges = weekPrescriptionRanges(data)
  if (!ranges.length) return null
  return (
    <View style={styles.section}>
      <SectionTitle detail={`${data.plan.weeks} ${data.plan.weeks === 1 ? 'semana' : 'semanas'}`}>O que muda a cada semana</SectionTitle>
      <Text style={styles.intro}>
        Ajustes em relação à prescrição-base. Nas demais situações, siga a tabela da divisão.
      </Text>
      {ranges.flatMap(({ first, last, label, isDeload, notes: weekNotes, groups: weekGroups }) => weekSegments(weekGroups, weekNotes).map(({ notes, groups }, segment) => {
        const bodyHeight = groups.reduce((h, g) => h + estimateWeekChangeHeight(g), 0)
          + (notes ? estimateTextHeight({ text: notes, fontSize: 7.5, lineHeight: 1.45, width: 367 }) : 0)
        const labelHeight = estimateTextHeight({ text: label ?? '', fontSize: 8, lineHeight: 1.4, width: 102 })
        const split = 30 + Math.max(bodyHeight, labelHeight) > LIMITE_BLOCO_ATOMICO
        return (
          <View key={`${first}-${segment}`} wrap={split} style={styles.weekRow}>
            <Text style={styles.weekNum}>{first === last ? first : `${first}–${last}`}</Text>
            <View style={styles.weekHead}>
              <Text style={styles.weekLabel}>{label || (first === last ? 'Semana' : 'Semanas')}</Text>
              {segment > 0 ? <Text style={styles.weekContinuation}>continuação</Text> : null}
              {isDeload ? <Text style={styles.deloadPill}>Deload</Text> : null}
            </View>
            <View style={styles.weekBody}>
              {weekGroups.length === 0 ? <Text style={styles.weekSame}>Seguir a prescrição-base.</Text> : null}
              {groups.map((g, i) => (
                <View key={i} style={styles.weekChange} wrap={estimateWeekChangeHeight(g) > LIMITE_CARTAO_ATOMICO}>
                  <Text style={styles.weekChangeLabel}>{g.label}</Text>
                  <Text style={styles.weekChangeDesc}>{g.desc}</Text>
                </View>
              ))}
              {notes ? <Text style={styles.weekSame}>{notes}</Text> : null}
            </View>
          </View>
        )
      }))}
    </View>
  )
}

// Largura útil do texto dentro da caixa de observações, em pontos: a folha A4
// (595) menos margens de 34, recuo de 10 e a linha violeta de 2.
const NOTES_LARGURA = 595 - 34 * 2 - 10 - 2

// Altura estimada do bloco "Observações" (título + caixa), em pontos.
// Grosseira de propósito — serve só para decidir se o bloco cabe inteiro numa
// folha, e LIMITE_BLOCO_ATOMICO tem folga de sobra para o erro da estimativa.
export function estimateNotesHeight(notes: string): number {
  const TITULO = 21 // faixa da SectionTitle + margem inferior
  const CAIXA = 8
  return (
    TITULO +
    CAIXA +
    estimateTextHeight({ text: notes, fontSize: 8, lineHeight: 1.5, width: NOTES_LARGURA })
  )
}

// Texto livre do profissional. Uma observação que cabe numa folha não parte:
// cortada no meio entre duas páginas era o defeito mais visível do documento,
// e é justamente o trecho que o aluno precisa ler inteiro de uma vez.
//
// O bloco inteiro (título + caixa) é que fica atômico — deixar só a caixa
// indivisível ainda permitia o título "Observações" órfão no pé da página.
function NotesSection({ notes }: { notes: string }) {
  // Acima do limite volta a quebrar: wrap={false} em bloco maior que a folha
  // não impede a quebra, TRANSBORDA sobreposto e ilegível.
  const parte = estimateNotesHeight(notes) > LIMITE_BLOCO_ATOMICO

  return (
    // Não forçar break no bloco longo: após tabelas com várias continuações,
    // a combinação de break e borda dividida produzia dimensões negativas no
    // renderer. O fluxo normal preserva o texto e usa o espaço disponível.
    <View style={styles.section} wrap={parte}>
      <SectionTitle>Observações</SectionTitle>
      <View style={styles.notesBox}>
        <Text style={styles.notesText}>{notes}</Text>
      </View>
    </View>
  )
}

function WorkoutDoc({ data }: { data: WorkoutPdfData }) {
  const { plan, days, exercises, exerciseNames } = data
  const orderedDays = days.slice().sort((a, b) => a.position - b.position)
  const startsOn = fmtDate(plan.starts_on)
  const schedule =
    weekSessionLabels(plan.weekly_schedule, orderedDays.map((d) => d.label))

  const sourceText = data.source
    ? [
        data.source.assessmentDate
          ? `avaliação ${fmtDate(data.source.assessmentDate)}${
              data.source.bodyFatPct != null ? ` · ${data.source.bodyFatPct.toFixed(1).replace('.', ',')}% gordura` : ''
            }`
          : '',
        data.source.postureDate ? `postura ${fmtDate(data.source.postureDate)}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const info: InfoItem[] = [
    { label: 'Avaliado', value: data.subjectName },
    { label: 'Objetivo', value: goalLabel(plan.goal) },
    {
      label: 'Mesociclo',
      value: `${plan.weeks} ${plan.weeks === 1 ? 'semana' : 'semanas'}${
        startsOn ? ` · início ${startsOn}` : ''
      }`,
    },
    ...(sourceText ? [{ label: 'Base da prescrição', value: sourceText, wide: true }] : []),
  ]

  return (
    <Document title={`Plano de treino · ${data.subjectName}`} author={data.orgName} subject={plan.name}>
      <Page size="A4" style={pdfTheme.page}>
        <ReportRunningHeader title="Plano de treino" subject={data.subjectName} />
        <ReportHeader logoUrl={data.logoUrl} orgName={data.orgName} kicker="Plano de treino" title="Seu próximo movimento." subtitle={plan.name} />
        <InfoCard items={info} />

        {schedule.length > 0 ? (
          <View style={styles.schedule} wrap={false}>
            <View style={styles.scheduleCopy}>
              <Text style={styles.scheduleTitle}>Sua sequência semanal</Text>
              <Text style={styles.scheduleDetail}>
                {schedule.length} {schedule.length === 1 ? 'sessão' : 'sessões'} · Siga a ordem das divisões
              </Text>
            </View>
            <View style={styles.sessions}>
              {schedule.map((label, i) => (
                <View key={`${i}-${label}`} style={styles.session}>
                  <Text style={styles.sessionLabel}>{i + 1}ª sessão</Text>
                  <View style={[styles.sessionBadge, ...(i === 0 ? [styles.sessionFirst] : [])]}>
                    <Text style={[styles.sessionLetter, ...(i === 0 ? [styles.sessionLetterFirst] : [])]}>{label}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          {orderedDays.map((day) => (
            <DayCard key={day.id} day={day} exercises={exercises} names={exerciseNames} />
          ))}
        </View>

        <WeeksSection data={data} />

        {plan.notes ? <NotesSection notes={plan.notes} /> : null}

        <MethodNote>
          Prescrição de exercício elaborada por profissional de Educação Física para este aluno;
          não é transferível a terceiros e
          não constitui diagnóstico ou orientação médica. Interrompa em caso de dor, tontura ou
          mal-estar e comunique o profissional responsável.
        </MethodNote>

        {/* Sem apêndice de volume: o PDF é o documento do ALUNO — vai para o
            WhatsApp dele e para a academia. Séries por grupo muscular contra
            MEV/MAV/MRV é ferramenta de quem prescreve, e o profissional já a
            tem ao vivo no VolumeLandmarkPanel, no builder e no detalhe do
            plano, onde ela serve para decidir. No papel do aluno era jargão
            que ele não usa e uma folha a mais para imprimir. */}

        <ReportFooter note="Montado no Avalix" evaluator={data.evaluatorName} />
      </Page>
    </Document>
  )
}

export async function generateWorkoutPdf(data: WorkoutPdfData): Promise<Blob> {
  registerReportFonts()
  return pdf(<WorkoutDoc data={data} />).toBlob()
}
