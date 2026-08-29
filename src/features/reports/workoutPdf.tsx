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
  SectionTitle,
  fmtDate,
  palette,
  pdfTheme,
  type InfoItem,
} from './pdfTheme'

const PLUM = palette.plum

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
  dayBadgeText: { fontSize: 12.5, fontFamily: 'Manrope', fontWeight: 700, color: '#ffffff' },
  dayName: { fontSize: 11, fontFamily: 'Manrope', fontWeight: 700, color: PLUM },
  daySub: { fontSize: 7.5, color: palette.muted, marginTop: 1 },

  // cabeçalho da tabela
  thead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2F4',
    paddingVertical: 4,
    paddingHorizontal: 11,
    borderBottomWidth: 0.6,
    borderBottomColor: palette.hairline,
  },
  th: {
    fontSize: 6.5,
    fontFamily: 'Manrope', fontWeight: 700,
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
  trAlt: { backgroundColor: '#F7F9FA' },
  trLast: { borderBottomWidth: 0 },
  tdNum: { fontSize: 8.5, color: palette.muted },
  tdName: { fontSize: 9.5, color: palette.ink },
  tdNameSub: { fontSize: 7, color: palette.muted, marginTop: 1.5, lineHeight: 1.35 },
  tdStrong: { fontSize: 10, fontFamily: 'Manrope', fontWeight: 700, color: PLUM },
  tdCell: { fontSize: 8.5, color: '#46515D' },

  // ---- Bloco (super-série / circuito) ----
  // Faixa acima dos membros, com a instrução de execução junto: a ficha
  // impressa é lida na academia por quem não sabe o jargão, e "Bi-set" sozinho
  // não diz o que fazer entre um exercício e outro.
  // A faixa e os membros dividem uma barra lateral contínua: sem ela dava para
  // ver onde o bloco começava, mas não onde ele terminava — e "quantos
  // exercícios entram na super-série" é justamente o que a ficha precisa dizer.
  // O padding esquerdo desconta a barra para as colunas não saírem do prumo.
  groupBand: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#EDE7F7',
    paddingVertical: 3,
    paddingRight: 11,
    paddingLeft: 8.5,
    borderLeftWidth: 2.5,
    borderLeftColor: palette.violet,
    borderBottomWidth: 0.5,
    borderBottomColor: palette.hairline,
  },
  groupBandName: {
    fontSize: 6.5,
    fontFamily: 'Manrope', fontWeight: 700,
    color: palette.violet,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  groupBandHint: { fontSize: 6.5, color: palette.muted, marginLeft: 6 },
  // membro do bloco não entra na zebra: fundo próprio e a mesma barra lateral
  // da faixa é o que delimita o bloco de ponta a ponta
  trGroup: {
    backgroundColor: '#F7F4FC',
    paddingLeft: 8.5,
    borderLeftWidth: 2.5,
    borderLeftColor: palette.violet,
  },

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
  weekNum: { fontSize: 9.5, fontFamily: 'Manrope', fontWeight: 700, color: PLUM },
  weekLabel: { fontSize: 9, color: palette.muted, marginLeft: 5 },
  deloadPill: {
    marginLeft: 7,
    backgroundColor: '#EEEAF6',
    color: palette.violet,
    fontSize: 6.5,
    fontFamily: 'Manrope', fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingVertical: 1.5,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  // "sem alteração": a semana existe e segue a prescrição base. Dizer isso é
  // informação — a ausência de linha deixaria dúvida se faltou preencher.
  // Sem fontStyle italic: só Manrope 400/700 normal são registradas em
  // pdfFonts, e pedir um itálico inexistente derruba a geração inteira
  // ("Could not resolve font for Manrope, fontStyle italic").
  weekSame: { fontSize: 8, color: '#8A939D', marginLeft: 7 },
  // Uma alteração: quem muda (plum, com peso) e o que muda (cinza). Separar os
  // dois em linhas próprias é o que faz a coluna ser varrível de cima a baixo.
  weekChange: { marginTop: 4, marginLeft: 3, borderLeftWidth: 1.6, borderLeftColor: '#D9D1EA', paddingLeft: 7 },
  weekChangeLabel: { fontSize: 8, fontFamily: 'Manrope', fontWeight: 700, color: PLUM, lineHeight: 1.35 },
  weekChangeDesc: { fontSize: 8, color: palette.muted, lineHeight: 1.4 },

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

  reproNote: { fontSize: 8, color: palette.muted, marginTop: 10, lineHeight: 1.4 },
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

// Acima disto o cartão deixa de ser atômico. A folha A4 com as margens de
// pdfTheme.page tem 760 pt úteis (842 - 34 - 48); 440 é pouco mais da metade —
// o maior buraco que se aceita no pé de uma página para manter uma divisão
// inteira, e com folga larga para o erro da estimativa não estourar a folha.
const LIMITE_CARTAO_ATOMICO = 440

// Altura estimada do cartão da divisão, em pontos. Grosseira de propósito —
// serve só para decidir se a divisão cabe inteira numa folha, e o limite acima
// tem folga de sobra para o erro da estimativa.
function estimateDayCardHeight(rows: WorkoutExerciseRow[], tempo: string | null): number {
  const CABECALHO = 42
  const THEAD = 16
  const LINHA = 22
  const SUBLINHA = 11
  const FAIXA_BLOCO = 14
  const bordas = 12
  const blocos = toRowBlocks(rows).filter((b) => b.kind != null).length
  return (
    CABECALHO +
    THEAD +
    bordas +
    blocos * FAIXA_BLOCO +
    rows.reduce((h, ex) => h + LINHA + (exerciseSub(ex, tempo) ? SUBLINHA : 0), 0)
  )
}

// Uma divisão (Treino A/B/C) como cartão: cabeçalho com a letra num selo e o
// nome, seguido da tabela de exercícios (nº, exercício, séries, reps, RIR,
// descanso) com zebra pra leitura.
//
// A altura depende do número de exercícios, e é ela que decide se o cartão
// quebra ou não — ver o comentário dentro da função. Fica registrado o que NÃO
// funciona no @react-pdf, para ninguém tentar de novo:
//
// - wrap={false} em cartão maior que a folha não impede a quebra: transborda
//   sobreposto e ilegível, sem aviso nenhum.
// - minPresenceAhead num container que quebra exige espaço para o elemento
//   INTEIRO mais a margem, não para o começo dele. Posto no cartão, empurrava
//   uma divisão de seis exercícios para a página seguinte com meia folha vazia.
// - minPresenceAhead é ignorado em elemento `fixed`.
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
  // Uma divisão que cabe numa folha é indivisível: quem leva a ficha para a
  // academia quer o treino do dia inteiro numa página, e um cartão atômico não
  // pode nem partir a tabela nem deixar cabeçalho órfão. O preço é um espaço em
  // branco no pé da página anterior, limitado à altura do cartão — por isso o
  // teto de LIMITE_CARTAO_ATOMICO.
  //
  // Acima desse limite (divisão muito longa) o cartão volta a quebrar. Aí o
  // cabeçalho de coluna precisa ser `fixed` para reaparecer na continuação:
  // sem ele as linhas que sobravam caíam na folha seguinte como quatro números
  // sem rótulo nenhum. E `fixed` só entra NESSE caso porque ele desenha na
  // origem do cartão em toda página que o cartão ocupa — inclusive numa em que
  // o cartão começa e não cabe nenhuma linha, o que imprimia uma faixa de
  // cabeçalho vazia no pé da página.
  //
  // wrap={false} nunca em cartão maior que a folha: aí ele não "não parte", ele
  // TRANSBORDA sobreposto, que é o jeito mais fácil de gerar um PDF ilegível.
  const parte = estimateDayCardHeight(rows, tempo) > LIMITE_CARTAO_ATOMICO

  return (
    <View style={styles.dayCard} wrap={parte}>
      <View style={styles.dayHeader} wrap={false}>
        <View style={styles.dayBadge}>
          <Text style={styles.dayBadgeText}>{day.label}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.dayName}>{day.name ? day.name : `Treino ${day.label}`}</Text>
          {/* "Treino A" saiu daqui: o selo à esquerda e o nome logo acima já
              dizem isso duas vezes. Sobra a contagem e a cadência da divisão. */}
          <Text style={styles.daySub}>
            {rows.length} {rows.length === 1 ? 'exercício' : 'exercícios'}
            {tempo ? ` · cadência ${tempo} em todos` : ''}
          </Text>
        </View>
      </View>

      {/* O rótulo da divisão vai junto na coluna do exercício: na continuação
          de um cartão que partiu, o selo "A" ficou na página anterior. */}
      <View style={styles.thead} fixed={parte}>
        <Text style={[styles.th, styles.colNum]}>#</Text>
        <Text style={[styles.th, styles.colName]}>Exercício · Treino {day.label}</Text>
        <Text style={[styles.th, styles.colSets]}>Séries</Text>
        <Text style={[styles.th, styles.colReps]}>Reps</Text>
        <Text style={[styles.th, styles.colRir]}>RIR</Text>
        <Text style={[styles.th, styles.colRest]}>Descanso</Text>
      </View>

      {toRowBlocks(rows).map((block) => {
        const linhas = block.items.map((ex, j) => {
          const i = block.start + j
          const sub = exerciseSub(ex, tempo)
          const last = i === rows.length - 1
          return (
            // A linha em si nunca parte: com o cartão podendo quebrar entre
            // páginas, sem isto um exercício ficava com o nome numa folha e as
            // séries/reps na outra.
            <View
              key={ex.id}
              wrap={false}
              style={[
                styles.tr,
                ...(block.kind != null ? [styles.trGroup] : i % 2 === 1 ? [styles.trAlt] : []),
                ...(last ? [styles.trLast] : []),
              ]}
            >
              <Text style={[styles.tdNum, styles.colNum]}>{i + 1}</Text>
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
                {ex.rest_seconds != null ? `${ex.rest_seconds}s` : '—'}
              </Text>
            </View>
          )
        })
        if (block.kind == null) return linhas
        // O bloco não parte entre páginas: uma super-série com a faixa numa
        // folha e o segundo exercício na outra não é executável a partir da
        // ficha. São dois a quatro exercícios, então nunca estoura a folha.
        return (
          <View key={block.key} wrap={false}>
            <View style={styles.groupBand}>
              <Text style={styles.groupBandName}>{groupLabel(block.kind, block.items.length)}</Text>
              <Text style={styles.groupBandHint}>{groupHint(block.kind, block.items.length)}</Text>
            </View>
            {linhas}
          </View>
        )
      })}
    </View>
  )
}

// O que este override muda EM RELAÇÃO À PRESCRIÇÃO BASE do exercício — só os
// campos diferentes. Antes imprimia-se o override inteiro, incluindo os campos
// que repetiam a tabela acima; string vazia = override que não altera nada.
function overrideDiff(o: WorkoutWeekOverrideRow, base: WorkoutExerciseRow | undefined): string {
  if (o.is_skipped) return 'não executar'
  const parts: string[] = []
  if (o.sets != null && o.sets !== base?.sets) parts.push(`${fmtSets(o.sets)} séries`)
  if (o.reps != null && o.reps !== base?.reps) parts.push(`${o.reps} reps`)
  if (o.rir != null && o.rir !== base?.rir) parts.push(`RIR ${fmtSets(o.rir)}`)
  if (o.rest_seconds != null && o.rest_seconds !== base?.rest_seconds) {
    parts.push(`${o.rest_seconds}s de descanso`)
  }
  if (o.notes && o.notes !== base?.notes) parts.push(o.notes)
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
          return multiDay ? `${dayLabel.get(e.day_id) ?? '?'} · ${nome}` : nome
        })
        .join(', ')
    }
    return { label, desc }
  })
}

function WeeksSection({ data }: { data: WorkoutPdfData }) {
  const { weeks, overrides, exercises, days, exerciseNames } = data
  if (weeks.length === 0 && overrides.length === 0) return null

  const weekMeta = new Map(weeks.map((w) => [w.week_number, w]))
  const weeksWithOverrides = [...new Set(overrides.map((o) => o.week_number))].sort((a, b) => a - b)
  const allWeeks = [...new Set([...weeks.map((w) => w.week_number), ...weeksWithOverrides])].sort(
    (a, b) => a - b
  )

  const rows = allWeeks.map((n) => ({
    n,
    meta: weekMeta.get(n),
    groups: weekChangeGroups(
      overrides.filter((o) => o.week_number === n),
      exercises,
      days,
      exerciseNames
    ),
  }))

  // Altura proporcional a semanas x alterações: o bloco pode passar de uma
  // página. Antes, wrap={false} fazia ele transbordar sobreposto — o caso mais
  // fácil de reproduzir de PDF corrompido. Cada semana continua inteira.
  return (
    <View style={styles.section}>
      <SectionTitle>Organização por semana</SectionTitle>
      <Text style={styles.intro}>
        Só o que muda em relação à prescrição das divisões acima. Semana sem alteração segue a
        tabela do treino como está.
      </Text>
      <View style={styles.weekWrap}>
        {rows.map(({ n, meta, groups }, idx) => (
          <View
            key={n}
            wrap={false}
            style={[styles.weekRow, ...(idx === rows.length - 1 ? [styles.trLast] : [])]}
          >
            <View style={styles.weekHead}>
              <Text style={styles.weekNum}>Semana {n}</Text>
              {meta?.label ? <Text style={styles.weekLabel}>{meta.label}</Text> : null}
              {meta?.is_deload ? <Text style={styles.deloadPill}>Deload</Text> : null}
              {groups.length === 0 ? (
                <Text style={styles.weekSame}>sem alteração</Text>
              ) : null}
            </View>
            {groups.map((g, i) => (
              <View key={i} style={styles.weekChange}>
                <Text style={styles.weekChangeLabel}>{g.label}</Text>
                <Text style={styles.weekChangeDesc}>{g.desc}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

// Largura útil do texto dentro da caixa de observações, em pontos: a folha A4
// (595) menos as margens da página (36 de cada lado), o padding da caixa (12 de
// cada lado) e o fio da borda esquerda (3).
const NOTES_LARGURA = 595 - 36 * 2 - 12 * 2 - 3

// Altura estimada do bloco "Observações" (título + caixa), em pontos.
// Grosseira de propósito — serve só para decidir se o bloco cabe inteiro numa
// folha, e LIMITE_BLOCO_ATOMICO tem folga de sobra para o erro da estimativa.
export function estimateNotesHeight(notes: string): number {
  const TITULO = 21 // faixa da SectionTitle + margem inferior
  const CAIXA = 20 // padding vertical da caixa (9 + 9) + folga da borda
  return (
    TITULO +
    CAIXA +
    estimateTextHeight({ text: notes, fontSize: 9.5, lineHeight: 1.5, width: NOTES_LARGURA })
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
    // A observação que não cabe numa folha começa numa folha limpa (break) e
    // gasta a página inteira antes de partir — assim ela parte no máximo uma
    // vez, e no meio do texto, nunca logo abaixo do título.
    //
    // minPresenceAhead NÃO resolve esse caso, e a tentativa anterior de usá-lo
    // aqui era pior que nada: o shouldBreak do @react-pdf/layout só o consulta
    // quando o bloco CABE inteiro na sobra da página; num bloco que precisa
    // partir ele é ignorado, e o que saía impresso era o título "Observações"
    // sozinho no pé da folha com um talo vazio da caixa embaixo.
    <View style={styles.section} wrap={parte} break={parte}>
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
        {/* Sem subtítulo: era o nome do plano, que o cartão logo abaixo já
            traz no campo "Plano". Repetido a três centímetros de distância não
            ajudava a ler nada. */}
        <ReportHeader logoUrl={data.logoUrl} orgName={data.orgName} title="Plano de Treino" />

        <InfoCard items={info} />

        {/* O treino em primeiro lugar — cada divisão num cartão com tabela. */}
        <View style={styles.section}>
          <SectionTitle>Divisões do treino</SectionTitle>
          {orderedDays.map((day) => (
            <DayCard key={day.id} day={day} exercises={exercises} names={exerciseNames} />
          ))}
        </View>

        <WeeksSection data={data} />

        {plan.notes ? <NotesSection notes={plan.notes} /> : null}

        <MethodNote>
          Plano reproduzível a partir do snapshot registrado. Prescrição de exercício elaborada
          por profissional de Educação Física para este aluno; não é transferível a terceiros e
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
