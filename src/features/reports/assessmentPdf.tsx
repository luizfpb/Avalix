import {
  Circle,
  Document,
  Line,
  Page,
  Path,
  Polyline,
  Svg,
  StyleSheet,
  View,
  pdf,
} from '@react-pdf/renderer'
// Text saneado: a fonte padrão é WinAnsi e trocaria glifo em silêncio para
// qualquer caractere fora do CP1252 digitado pelo profissional. Ver pdfText.tsx.
// Vale também dentro de <Svg> (rótulos de escala), que é onde este documento
// mais usa Text — o render de fumaça cobre esse caminho.
import { Text } from './pdfText'
import type {
  AssessmentRow,
  CircumferenceReadingRow,
  SkinfoldReadingRow,
  SubjectCircumference,
} from '../assessment/api'
import type { AssessmentResultSnapshot } from '../assessment/result'
import type { ResultWarning } from '../assessment/protocols'
import { protocolLabel } from '../assessment/protocols'
import { comparabilidadeDeProtocolos, METRICAS_DEPENDENTES_DO_PROTOCOLO } from '../assessment/comparability'
import { registerReportFonts } from './pdfFonts'
import { LIMITE_BLOCO_ATOMICO, estimateTextHeight } from './pdfLayout'
import { SKINFOLD_LABELS, circumferenceLabel } from '../assessment/sites'
import { sortAssessmentsChronologically } from '../assessment/timeline'
import type { SkinfoldSite } from '../assessment/protocols'
import { computeBmi, bmiCategory } from '../assessment/bmi'
import { classifyBodyFat } from '../assessment/bodyFat'
import { axisDomain, donutSlices } from './charts'
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

const LEAN = palette.violet
const FAT = palette.magenta

// um ponto do histórico cronológico do avaliado (uma avaliação). peso/IMC
// existem sempre; %gordura/massas só quando houve protocolo de composição.
export type AssessmentHistoryPoint = {
  date: string
  /** protocolo da avaliação; a série mistura métodos quando ele varia */
  protocolId?: string | null
  assessedAt?: string
  warnings?: ResultWarning[]
  weightKg: number | null
  bmi: number | null
  bodyFatPct: number | null
  leanMassKg: number | null
  fatMassKg: number | null
}

// O relatório da série conserva as ressalvas de CADA coleta, com sua data.
// A nota genérica de método não substitui um aviso específico do snapshot.
export function historyWarnings(history: AssessmentHistoryPoint[]): { code: string; message: string }[] {
  return history.flatMap((point, index) => (point.warnings ?? []).map((warning) => ({
    code: `${index}:${warning.code}`,
    message: `${fmtDate(point.assessedAt ?? point.date)} · ${protocolLabel(point.protocolId ?? null)}: ${warning.message}`,
  })))
}

export type AssessmentPdfData = {
  orgName: string
  subjectName: string
  // profissional responsavel, impresso no rodape de todas as paginas
  evaluatorName?: string | null
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

type TrendPoint = { value: number | null; date: string }

// Números e unidades seguem a leitura brasileira também nos eixos dos gráficos.
function fmtNum(n: number): string {
  return (Number.isInteger(n) ? String(n) : n.toFixed(1)).replace('.', ',')
}

const fixed = (n: number, digits = 1) => n.toFixed(digits).replace('.', ',')

// ISO (aaaa-mm-dd) -> dd/mm pro eixo do gráfico
function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}` : iso
}

// Grupos de circunferências plotados no PDF, em ordem de prioridade (tronco
// central → membros inferiores → superiores → resto). Bilateral (D/E) entra
// como MÉDIA dos lados medidos, pra um gráfico por região em vez de dois. As
// chaves batem com o CIRCUMFERENCE_CATALOG.
const CIRC_TREND_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Cintura', keys: ['waist'] },
  { label: 'Abdômen', keys: ['abdomen'] },
  { label: 'Quadril', keys: ['hip'] },
  { label: 'Coxa proximal', keys: ['thigh_proximal_r', 'thigh_proximal_l'] },
  { label: 'Coxa medial', keys: ['thigh_mid_r', 'thigh_mid_l'] },
  { label: 'Coxa distal', keys: ['thigh_distal_r', 'thigh_distal_l'] },
  { label: 'Panturrilha', keys: ['calf_r', 'calf_l'] },
  { label: 'Braço contraído', keys: ['arm_flexed_r', 'arm_flexed_l'] },
  { label: 'Braço relaxado', keys: ['arm_relaxed_r', 'arm_relaxed_l'] },
  { label: 'Antebraço', keys: ['forearm_r', 'forearm_l'] },
  { label: 'Tórax', keys: ['chest'] },
  { label: 'Pescoço', keys: ['neck'] },
  { label: 'Ombro', keys: ['shoulder'] },
]

// Séries de evolução das circunferências pro PDF. Cobre tronco E membros
// (coxas/panturrilha, braços/antebraço) por prioridade; bilateral vira média
// dos lados medidos. Janela aos últimos maxPoints registros e limita a
// maxCharts gráficos. Sites fora do catálogo (customizados) entram no fim,
// por nº de medidas, pra não sumir. Puro/testável.
export function buildCircSeries(
  rows: SubjectCircumference[],
  maxCharts: number,
  maxPoints: number
): { label: string; points: TrendPoint[] }[] {
  const assessmentsById = new Map<
    string,
    { id: string; assessed_at: string; created_at: string }
  >()
  for (const row of rows) {
    assessmentsById.set(row.assessmentId, {
      id: row.assessmentId,
      assessed_at: row.assessedAt,
      created_at: row.assessmentCreatedAt,
    })
  }
  const assessments = sortAssessmentsChronologically([...assessmentsById.values()]).slice(
    -maxPoints
  )
  const assessmentIds = new Set(assessments.map((assessment) => assessment.id))
  const byAssessmentSite = new Map<string, number>()
  const seen = new Set<string>()
  for (const r of rows) {
    if (!assessmentIds.has(r.assessmentId)) continue
    byAssessmentSite.set(`${r.assessmentId}|${r.site}`, r.valueCm)
    seen.add(r.site)
  }

  // média dos lados medidos numa avaliação, pra um conjunto de chaves
  const meanAt = (assessmentId: string, keys: string[]): number | null => {
    const vals = keys
      .map((k) => byAssessmentSite.get(`${assessmentId}|${k}`))
      .filter((v): v is number => v != null)
    if (vals.length === 0) return null
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
  }

  const out: { label: string; points: TrendPoint[] }[] = []
  const consumed = new Set<string>()
  for (const g of CIRC_TREND_GROUPS) {
    if (out.length >= maxCharts) return out
    if (!g.keys.some((k) => seen.has(k))) continue
    g.keys.forEach((k) => consumed.add(k))
    const points = assessments.map((assessment) => ({
      value: meanAt(assessment.id, g.keys),
      date: shortDate(assessment.assessed_at),
    }))
    if (points.filter((p) => p.value != null).length >= 2) out.push({ label: g.label, points })
  }

  // sobrou espaço? sites medidos fora do catálogo (customizados), por nº de medidas
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (assessmentIds.has(r.assessmentId) && !consumed.has(r.site)) {
      counts.set(r.site, (counts.get(r.site) ?? 0) + 1)
    }
  }
  for (const [site] of [...counts.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1])) {
    if (out.length >= maxCharts) break
    const points = assessments.map((assessment) => ({
      value: byAssessmentSite.get(`${assessment.id}|${site}`) ?? null,
      date: shortDate(assessment.assessed_at),
    }))
    out.push({ label: circumferenceLabel(site), points })
  }
  return out
}

// métricas plotadas na evolução, na ordem de exibição. key bate com o ponto.
//
// minSpan: janela visual mínima na unidade da métrica (axisDomain em
// charts.ts), no ritmo do estudo Clareza. Não é limite clínico nem intervalo
// de confiança. Dá contexto à variação e evita que uma mudança pequena
// ocupe toda a altura do gráfico; os valores e a escala continuam explícitos.
//
// deltaUnit: a unidade da DIFERENÇA nem sempre é a unidade do valor. De 22% para
// 18% de gordura a variação é de quatro PONTOS PERCENTUAIS; escrito "−4%" o
// número lê como redução relativa de 4% (que daria 21,1%), e o laudo passa a
// afirmar outra coisa. Onde a unidade da diferença é a mesma do valor (kg, cm)
// o campo é omitido.
type TrendKey = 'bodyFatPct' | 'weightKg' | 'bmi' | 'leanMassKg' | 'fatMassKg'
const TREND_METRICS: {
  key: TrendKey
  title: string
  unit: string
  deltaUnit?: string
  color: string
  minSpan: number
}[] = [
  { key: 'bodyFatPct', title: '% de gordura', unit: '%', deltaUnit: ' p.p.', color: FAT, minSpan: 12 },
  { key: 'weightKg', title: 'Peso', unit: ' kg', color: palette.violet, minSpan: 8 },
  { key: 'bmi', title: 'IMC', unit: '', color: palette.violet, minSpan: 2 },
  { key: 'leanMassKg', title: 'Massa magra', unit: ' kg', color: LEAN, minSpan: 5 },
  { key: 'fatMassKg', title: 'Massa gorda', unit: ' kg', color: FAT, minSpan: 5 },
]

// A mesma janela mínima em todas as regiões facilita comparar a amplitude.
const CIRC_MIN_SPAN = 12

const styles = StyleSheet.create({
  // O espaçamento faz parte da caixa: marginBottom fora da altura dispara
  // shouldBreak quando só a margem ultrapassa a folha e empurra a seção toda.
  section: { paddingBottom: 17 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  stat: { flex: 1, borderWidth: 0.7, borderColor: palette.hairline, borderRadius: 10, padding: 11 },
  statLabel: { fontSize: 7.5, color: palette.muted, marginBottom: 4 },
  statValue: { fontSize: 21, fontFamily: 'Manrope', fontWeight: 700, color: palette.ink, letterSpacing: -0.6, lineHeight: 1.2 },
  statUnit: { fontSize: 7.5, color: palette.muted, fontWeight: 400, letterSpacing: 0 },
  statDetail: { fontSize: 7, color: palette.muted, marginTop: 3 },
  composition: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderRadius: 12, padding: 18, marginBottom: 10 },
  donut: { width: 146, height: 124, position: 'relative', marginRight: 20 },
  donutCenter: { position: 'absolute', top: 37, left: 7, width: 110, alignItems: 'center' },
  donutValue: { fontSize: 24, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1.2 },
  donutLabel: { fontSize: 6.8, color: palette.muted },
  compositionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 11, lineHeight: 1.3 },
  massRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  massSwatch: { width: 4, height: 25, borderRadius: 2, marginRight: 9 },
  massLabel: { fontSize: 8 },
  massShare: { fontSize: 7, color: palette.muted },
  massValue: { fontSize: 23, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.2 },
  compositionNote: { fontSize: 7, color: palette.muted, lineHeight: 1.45 },
  resultDetails: { fontSize: 7.5, color: palette.muted, lineHeight: 1.45, marginBottom: 12 },
  measuresColumns: { flexDirection: 'row', gap: 22 },
  measuresColumn: { flex: 1 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 0.8, borderBottomColor: palette.hairline, paddingBottom: 5 },
  tableHeadText: { fontSize: 7, color: palette.muted },
  row: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: palette.hairline,
    fontSize: 8,
  },
  cellLabel: { flex: 1, paddingRight: 9 },
  cellValue: { textAlign: 'right', fontWeight: 700 },
  muted: { color: palette.muted },
  reproNote: { fontSize: 7.5, color: palette.muted, marginBottom: 10, lineHeight: 1.5 },
  evoRow: { flexDirection: 'row', gap: 19, marginBottom: 12 },
  trendCard: { width: 254 },
  trendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 3,
  },
  trendTitle: { fontSize: 10, fontFamily: 'Manrope', fontWeight: 700, color: palette.ink },
  trendDelta: { fontSize: 8, fontFamily: 'Manrope', fontWeight: 700 },
  trendUnit: { fontSize: 7, color: palette.muted, marginBottom: 3 },
  freeText: { borderLeftWidth: 2, borderLeftColor: palette.violet, paddingLeft: 10, marginBottom: 16 },
  freeTextTitle: { fontSize: 8.5, fontWeight: 700, color: palette.violet, marginBottom: 4 },
  freeTextBody: { fontSize: 8.5, lineHeight: 1.5 },
})

// dimensões e margens internas do gráfico (espaço pra escala, rótulos e datas)
const CHART_W = 254
const CHART_H = 82
const PX0 = 34 // gutter esquerdo (escala y)
const PX1 = 212 // borda direita do plot (deixa margem à direita pro valor atual)
const PY0 = 13 // topo (espaço pro rótulo de valor sobre o ponto)
const PY1 = 62 // base do plot (acima da linha de datas)
const AXIS_COLOR = palette.muted
const GRID_COLOR = palette.hairline

function Donut({ lean, fat, bodyFatPct }: { lean: number; fat: number; bodyFatPct: number }) {
  const slices = donutSlices([lean, fat], 62, 62, 56, 44)
  const colors = [LEAN, FAT]
  return (
    <View style={styles.donut}>
      <Svg width={124} height={124} viewBox="0 0 124 124">
        {slices.map((s, i) => (
          <Path key={i} d={s.d} fill={colors[i] ?? LEAN} />
        ))}
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={styles.donutValue}>{fixed(bodyFatPct)}%</Text>
        <Text style={styles.donutLabel}>gordura corporal</Text>
      </View>
    </View>
  )
}

function MassValue({ color, label, mass, share }: { color: string; label: string; mass: number; share: number }) {
  return (
    <View style={styles.massRow}>
      <View style={[styles.massSwatch, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.massLabel, { color }]}>{label}</Text>
        <Text style={styles.massShare}>{fixed(share)}%</Text>
      </View>
      <Text style={styles.massValue}>{fixed(mass)}<Text style={styles.statUnit}> kg</Text></Text>
    </View>
  )
}

// Cartão de evolução de uma métrica: linha com pontos marcados, valor inicial
// e final sobre os pontos, variação (Δ) no cabeçalho, linhas de referência
// mín/máx com a escala, e datas das pontas. Só desenha com >=2 pontos válidos
// (a linha pula buracos: avaliação sem composição não tem %gordura/massas).
function TrendChart({
  title,
  unit,
  deltaUnit,
  color,
  points,
  minSpan,
}: {
  title: string
  unit: string
  /** unidade da DIFERENÇA, quando não é a mesma do valor (ver TREND_METRICS) */
  deltaUnit?: string
  color: string
  points: TrendPoint[]
  // menor janela do eixo Y, na unidade da métrica: impede que uma variação
  // dentro do erro de medida seja desenhada como uma curva dramática
  minSpan: number
}) {
  const valid = points
    .map((p, i) => ({ value: p.value, date: p.date, i }))
    .filter((p): p is { value: number; date: string; i: number } => p.value != null)
  if (valid.length < 2) return null

  const nums = valid.map((p) => p.value)
  const { min, max } = axisDomain(nums, minSpan)
  const span = max - min || 1
  const n = points.length
  const xOf = (i: number) => (n <= 1 ? (PX0 + PX1) / 2 : PX0 + (i / (n - 1)) * (PX1 - PX0))
  const yOf = (v: number) => PY1 - ((v - min) / span) * (PY1 - PY0)

  const coords = valid.map((p) => ({ x: xOf(p.i), y: yOf(p.value), value: p.value, date: p.date }))
  const polyPoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const first = coords[0]
  const last = coords[coords.length - 1]
  const delta = last.value - first.value
  const deltaTxt = `${delta > 0 ? '+' : ''}${fmtNum(delta)}${deltaUnit ?? unit}`
  // 3 referências: máximo (topo), meio e mínimo (base), com a escala à esquerda
  const grid = [
    { v: max, y: PY0 },
    { v: (max + min) / 2, y: (PY0 + PY1) / 2 },
    { v: min, y: PY1 },
  ]

  return (
    <View style={styles.trendCard} wrap={false}>
      <View style={styles.trendHeader}>
        <Text style={styles.trendTitle}>{title === '% de gordura' ? 'Gordura corporal' : title === 'Peso' ? 'Peso corporal' : title}</Text>
        <Text style={[styles.trendDelta, { color }]}>{deltaTxt}</Text>
      </View>
      <Text style={styles.trendUnit}>{unit.trim() || 'kg/m²'}</Text>
      <Svg width={CHART_W} height={CHART_H}>
        {/* linhas de referência + escala (máx / meio / mín) */}
        {grid.map((g, i) => (
          <Line key={`g${i}`} x1={PX0} y1={g.y} x2={PX1} y2={g.y} stroke={GRID_COLOR} strokeWidth={0.6} />
        ))}
        {grid.map((g, i) => (
          <Text
            key={`s${i}`}
            x={PX0 - 4}
            y={g.y + 2.4}
            style={{ fontSize: 7, fill: AXIS_COLOR, textAnchor: 'end' }}
          >
            {fmtNum(g.v)}
          </Text>
        ))}
        {/* linha + pontos */}
        <Polyline points={polyPoints} fill="none" stroke={color} strokeWidth={1.8} />
        {coords.map((c, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 3.4 : 2.8} fill={color} stroke={palette.paper} strokeWidth={1} />
        ))}
        {/* Valor inicial, pequeno, acima do 1º ponto. Só aparece quando o eixo
            ainda não escreveu esse mesmo número: quando o ponto inicial é o
            mínimo ou o máximo da escala (variação pequena, como massa magra
            65,5 -> 65,6), os dois rótulos caíam na mesma altura e ficavam
            sobrepostos. Repetir um número que o eixo já mostra não informa
            nada e suja o gráfico. */}
        {fmtNum(first.value) !== fmtNum(max) && fmtNum(first.value) !== fmtNum(min) ? (
          <Text
            x={first.x + 4}
            y={first.y - 5}
            style={{ fontSize: 7.5, fill: AXIS_COLOR, textAnchor: 'start' }}
          >
            {fmtNum(first.value)}
          </Text>
        ) : null}
        {/* valor atual: em destaque, FORA do plot, ao lado do último ponto */}
        <Text
          x={PX1 + 6}
          y={last.y + 2.5}
          style={{ fontSize: 10, fontFamily: 'Manrope', fontWeight: 700, fill: palette.ink, textAnchor: 'start' }}
        >
          {fmtNum(last.value)}
        </Text>
        {/* Até cinco datas cabem; séries densas mantêm as pontas e o meio. */}
        {coords.filter((_, i) => coords.length <= 5 || i === 0 || i === Math.floor((coords.length - 1) / 2) || i === coords.length - 1).map((c, i) => (
          <Text key={`date-${i}`} x={c.x} y={CHART_H - 4} style={{ fontSize: 6.5, fill: AXIS_COLOR, textAnchor: 'middle' }}>
            {shortDate(c.date).slice(0, 5)}
          </Text>
        ))}
      </Svg>
    </View>
  )
}

function EvolutionSection({
  history,
  maxCharts = 5,
}: {
  history: AssessmentHistoryPoint[]
  maxCharts?: number
}) {
  if (history.length < 2) return null
  // PDF: últimos 10 pontos pra leitura limpa (no app a tela mostra todos)
  const recent = history.slice(-10)
  const charts = TREND_METRICS.map((m) => ({
    m,
    points: recent.map((p) => ({ value: p[m.key], date: p.date })),
  }))
    .filter((c) => c.points.filter((p) => p.value != null).length >= 2)
    .slice(0, maxCharts)
  if (charts.length === 0) return null
  // Mesma regra da tela de comparação e do prompt de parecer: com protocolos
  // diferentes na série, parte da variação de %gordura e das massas é troca de
  // método. O laudo tem de dizer isso onde desenha a curva.
  const comparabilidade = comparabilidadeDeProtocolos(recent.map((p) => p.protocolId))
  const chartRows = Array.from({ length: Math.ceil(charts.length / 2) }, (_, i) => (
    <View key={i} style={styles.evoRow} wrap={false}>
      {charts.slice(i * 2, i * 2 + 2).map(({ m, points }) => (
        <TrendChart
          key={m.key}
          title={m.title}
          unit={m.unit}
          deltaUnit={m.deltaUnit}
          color={comparabilidade.protocoloMudou && METRICAS_DEPENDENTES_DO_PROTOCOLO.has(m.key) ? palette.muted : m.color}
          points={points}
          minSpan={m.minSpan}
        />
      ))}
    </View>
  ))
  return (
    <View style={styles.section}>
      <View wrap={false}>
        <SectionTitle minPresenceAhead={0}>Evolução ao longo das avaliações</SectionTitle>
        <Text style={styles.reproNote}>
          De {recent[0].date} a {recent[recent.length - 1].date} · {recent.length} avaliações
          {history.length > recent.length ? ` (de ${history.length} no total)` : ''}
        </Text>
        {comparabilidade.aviso ? <Text style={styles.reproNote}>{comparabilidade.aviso}</Text> : null}
        {chartRows[0]}
      </View>
      {chartRows.slice(1)}
    </View>
  )
}

function CircumferenceEvolution({ rows }: { rows: SubjectCircumference[] }) {
  const series = buildCircSeries(rows, 12, 10)
  if (series.length === 0) return null
  const chartRows = Array.from({ length: Math.ceil(series.length / 2) }, (_, i) => (
    <View key={i} style={styles.evoRow} wrap={false}>
      {series.slice(i * 2, i * 2 + 2).map((s) => (
        <TrendChart key={s.label} title={s.label} unit=" cm" color={palette.violet} points={s.points} minSpan={CIRC_MIN_SPAN} />
      ))}
    </View>
  ))
  return (
    <View style={styles.section}>
      <View wrap={false}>
        <SectionTitle minPresenceAhead={0}>Evolução das circunferências (cm)</SectionTitle>
        <Text style={styles.reproNote}>Regiões bilaterais: média dos lados medidos em cada avaliação. Últimos dez registros; até doze regiões.</Text>
        {chartRows[0]}
      </View>
      {chartRows.slice(1)}
    </View>
  )
}

function Stat({ label, value, unit, detail }: { label: string; value: string; unit: string; detail?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}<Text style={styles.statUnit}> {unit}</Text></Text>
      {detail ? <Text style={styles.statDetail}>{detail}</Text> : null}
    </View>
  )
}

// Largura útil do texto solto: a folha A4 (595) menos as margens da página
// (34 de cada lado), menos o recuo da nota.
const TEXTO_LIVRE_LARGURA = 595 - 34 * 2 - 12

// Texto livre digitado pelo profissional — medicamentos e observações. Recebe o
// mesmo tratamento do PDF de treino: enquanto couber numa folha, o bloco
// (título + texto) é atômico e não parte na virada de página; acima disso ele
// começa numa folha limpa (break) e parte no meio do texto, nunca logo abaixo
// do título.
//
// minPresenceAhead não serve aqui: o shouldBreak do @react-pdf/layout só o
// consulta quando o bloco CABE inteiro na sobra da página.
//
function FreeTextSection({ title, text }: { title: string; text: string }) {
  const TITULO = 21
  const altura =
    TITULO +
    estimateTextHeight({ text, fontSize: 8.5, lineHeight: 1.5, width: TEXTO_LIVRE_LARGURA })
  const parte = altura > LIMITE_BLOCO_ATOMICO

  return (
    <View style={styles.freeText} wrap={parte} break={parte}>
      <Text style={styles.freeTextTitle} minPresenceAhead={26}>{title}</Text>
      <Text style={styles.freeTextBody} orphans={3} widows={3}>{text}</Text>
    </View>
  )
}

function SkinfoldTable({ rows }: { rows: SkinfoldReadingRow[] }) {
  return (
    <View style={styles.section}>
      <SectionTitle>Dobras cutâneas (mm)</SectionTitle>
      <View style={styles.tableHead} wrap={false} minPresenceAhead={24}>
        <Text style={[styles.tableHeadText, { width: '48%' }]}>Ponto de coleta</Text>
        <Text style={[styles.tableHeadText, { width: '35%', textAlign: 'right' }]}>Leituras</Text>
        <Text style={[styles.tableHeadText, { width: '17%', textAlign: 'right' }]}>Média</Text>
      </View>
      {rows.map((s) => {
        const values = [s.reading_1, s.reading_2, s.reading_3].filter((v): v is number => v != null)
        const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
        return (
          <View key={s.id} style={styles.row} wrap={false}>
            <Text style={{ width: '48%', paddingRight: 7 }}>{SKINFOLD_LABELS[s.site as SkinfoldSite] ?? s.site}</Text>
            <Text style={{ width: '35%', textAlign: 'right', color: palette.muted, fontSize: 7.5 }}>{values.map(fmtNum).join(' / ') || '—'}</Text>
            <Text style={[styles.cellValue, { width: '17%' }]}>{mean == null ? '—' : fixed(mean)}</Text>
          </View>
        )
      })}
    </View>
  )
}

function CircumferenceCells({ row }: { row: CircumferenceReadingRow }) {
  return (
    <View style={styles.row} wrap={false}>
      <Text style={styles.cellLabel}>{circumferenceLabel(row.site)}</Text>
      <Text style={styles.cellValue}>{fmtNum(row.value_cm)}</Text>
    </View>
  )
}

function CircumferenceTableHead() {
  return (
    <View style={styles.tableHead} wrap={false} minPresenceAhead={24}>
      <Text style={[styles.tableHeadText, { flex: 1 }]}>Região</Text>
      <Text style={styles.tableHeadText}>Atual</Text>
    </View>
  )
}

function CircumferenceTable({ rows }: { rows: CircumferenceReadingRow[] }) {
  const twoColumns = rows.length > 12 && rows.every((row) => circumferenceLabel(row.site).length <= 60)
  const half = Math.ceil(rows.length / 2)
  return (
    <View style={styles.section}>
      <SectionTitle>Circunferências (cm)</SectionTitle>
      {twoColumns ? (
        <>
          <View style={styles.measuresColumns} wrap={false} minPresenceAhead={24}>
            <View style={styles.measuresColumn}><CircumferenceTableHead /></View>
            <View style={styles.measuresColumn}><CircumferenceTableHead /></View>
          </View>
          {rows.slice(0, half).map((row, i) => (
            <View key={row.id} style={styles.measuresColumns} wrap={false}>
              <View style={styles.measuresColumn}><CircumferenceCells row={row} /></View>
              <View style={styles.measuresColumn}>{rows[i + half] ? <CircumferenceCells row={rows[i + half]} /> : null}</View>
            </View>
          ))}
        </>
      ) : (
        <>
          <CircumferenceTableHead />
          {rows.map((row) => <CircumferenceCells key={row.id} row={row} />)}
        </>
      )}
    </View>
  )
}

function AssessmentMeasures({ skinfolds, circumferences }: Pick<AssessmentPdfData, 'skinfolds' | 'circumferences'>) {
  // As duas tabelas curtas compartilham uma faixa, como na proposta aprovada.
  // Conteúdo extenso volta ao fluxo vertical para quebrar entre registros,
  // sem transformar duas colunas inteiras em um bloco maior que a folha.
  const compact = skinfolds.length > 0 && skinfolds.length <= 10 && circumferences.length > 0 && circumferences.length <= 12
    && circumferences.every((c) => circumferenceLabel(c.site).length <= 42)
  if (compact) {
    return (
      <View style={styles.measuresColumns} wrap={false}>
        <View style={styles.measuresColumn}><CircumferenceTable rows={circumferences} /></View>
        <View style={styles.measuresColumn}><SkinfoldTable rows={skinfolds} /></View>
      </View>
    )
  }
  return (
    <>
      {circumferences.length ? <CircumferenceTable rows={circumferences} /> : null}
      {skinfolds.length ? <SkinfoldTable rows={skinfolds} /> : null}
    </>
  )
}

function AssessmentDoc({ data }: { data: AssessmentPdfData }) {
  const { assessment, skinfolds, circumferences } = data
  const r = assessment.results as AssessmentResultSnapshot | null
  const bmi = computeBmi(assessment.weight_kg, assessment.height_cm)

  const info: InfoItem[] = [
    { label: 'Avaliado', value: data.subjectName, wide: true },
    { label: 'Data', value: fmtDate(assessment.assessed_at) ?? '—' },
    ...(r?.inputs.ageYears != null ? [{ label: 'Idade na avaliação', value: `${r.inputs.ageYears} anos` }] : []),
  ]

  return (
    <Document title={`Avaliação física · ${data.subjectName}`} author={data.orgName} language="pt-BR">
      <Page size="A4" style={pdfTheme.page}>
        <ReportRunningHeader title="Avaliação física" subject={data.subjectName} />
        <ReportHeader
          logoUrl={data.logoUrl}
          orgName={data.orgName}
          kicker="Avaliação física"
          title="Seu corpo, em perspectiva."
          subtitle={`${protocolLabel(assessment.protocol_id)}${r?.conversions ? ' · Conversão de Siri' : ''}`}
        />

        <InfoCard items={info} />

        {r ? (
          <View style={styles.composition} wrap={false}>
            <Donut lean={r.leanMassKg} fat={r.fatMassKg} bodyFatPct={r.bodyFatPct} />
            <View style={{ flex: 1 }}>
              <Text style={styles.compositionTitle}>Sua composição corporal</Text>
              <MassValue color={LEAN} label="Massa magra" mass={r.leanMassKg} share={100 - r.bodyFatPct} />
              <MassValue color={FAT} label="Massa gorda" mass={r.fatMassKg} share={r.bodyFatPct} />
              <Text style={styles.compositionNote}>Gordura corporal: {classifyBodyFat(r.inputs.sex, r.bodyFatPct).label}.</Text>
              <Text style={styles.compositionNote}>Estimativa pelo protocolo registrado.</Text>
            </View>
          </View>
        ) : null}

        {r && (r.bodyDensity != null || r.conversions) ? (
          <Text style={styles.resultDetails}>
            {r.bodyDensity != null ? `Densidade corporal: ${fixed(r.bodyDensity, 4)}. ` : ''}
            {r.conversions ? `Siri ${fixed(r.conversions.siri)}% · Brozek ${fixed(r.conversions.brozek)}% (principal: Siri).` : ''}
          </Text>
        ) : null}

        <View style={styles.statsRow} wrap={false}>
          <Stat label="Peso corporal" value={fmtNum(assessment.weight_kg)} unit="kg" />
          <Stat label="IMC" value={fixed(bmi)} unit="kg/m²" detail={bmiCategory(bmi).label} />
          <Stat label="Altura" value={fmtNum(assessment.height_cm)} unit="cm" />
        </View>

        {!r ? <Text style={styles.reproNote}>Esta avaliação registra peso, altura e IMC, sem estimativa de composição corporal.</Text> : null}

        <AssessmentMeasures skinfolds={skinfolds} circumferences={circumferences} />

        {assessment.medications ? (
          <FreeTextSection title="Medicamentos em uso" text={assessment.medications} />
        ) : null}

        {assessment.notes ? (
          <FreeTextSection title="Observações" text={assessment.notes} />
        ) : null}

        {data.history ? <EvolutionSection history={data.history} /> : null}

        {data.circumferenceHistory ? (
          <CircumferenceEvolution rows={data.circumferenceHistory} />
        ) : null}

        <MethodNote warnings={r?.warnings}>
          {r ? (
            `Resultado reproduzível a partir das medidas registradas (protocolo ${protocolLabel(assessment.protocol_id)}, motor ${assessment.engine_version ?? '—'}). ` +
            'Antropometria estima a composição corporal por equação de regressão e carrega erro padrão inerente ao método; os valores servem para acompanhamento da evolução, não substituem exame de imagem nem constituem diagnóstico ou orientação médica. '
          ) : (
            'Peso, altura e IMC correspondem aos dados desta avaliação. Não foi calculada uma estimativa de composição corporal. Esses indicadores servem para acompanhamento e não constituem diagnóstico ou orientação médica. '
          )}
          Em caso de sintoma, dor ou condição de saúde, procure um profissional de saúde habilitado.
        </MethodNote>

        <ReportFooter note="Calculado pelo motor Avalix" evaluator={data.evaluatorName} />
      </Page>
    </Document>
  )
}

export async function generateAssessmentPdf(data: AssessmentPdfData): Promise<Blob> {
  registerReportFonts()
  return pdf(<AssessmentDoc data={data} />).toBlob()
}

// =====================================================================
// PDF de evolução (P6, v2.0): relatório standalone do período — resumo
// "de → para → Δ" + os mesmos cartões de tendência do PDF de avaliação.
// Entregável de renovação de ciclo; reusa TrendChart/tema (mesmo chunk).
// =====================================================================

export type EvolutionPdfData = {
  orgName: string
  subjectName: string
  evaluatorName?: string | null
  logoUrl?: string | null
  history: AssessmentHistoryPoint[]
  circumferenceHistory: SubjectCircumference[]
}

type SummaryRow = { label: string; unit: string; deltaUnit: string; from: number; to: number }

// primeiro e último valor válido de cada métrica no período (puro/testável)
export function evolutionSummaryRows(history: AssessmentHistoryPoint[]): SummaryRow[] {
  const out: SummaryRow[] = []
  for (const m of TREND_METRICS) {
    const valid = history.map((p) => p[m.key]).filter((v): v is number => v != null)
    if (valid.length < 2) continue
    out.push({
      label: m.title,
      unit: m.unit,
      deltaUnit: m.deltaUnit ?? m.unit,
      from: valid[0],
      to: valid[valid.length - 1],
    })
  }
  return out
}

const summaryStyles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 8, marginBottom: 19 },
  card: { flex: 1, borderRadius: 11, backgroundColor: palette.surface, padding: 10 },
  label: { fontSize: 7, color: palette.muted, marginBottom: 5 },
  delta: { fontSize: 17, fontWeight: 700, letterSpacing: -0.5, color: palette.violet, lineHeight: 1.2 },
  detail: { fontSize: 7, color: palette.muted, marginTop: 5, lineHeight: 1.4 },
})

function EvolutionSummary({ history }: { history: AssessmentHistoryPoint[] }) {
  const rows = evolutionSummaryRows(history)
  if (rows.length === 0) return null
  const comparabilidade = comparabilidadeDeProtocolos(history.map((p) => p.protocolId))
  return (
    <View style={summaryStyles.grid} wrap={false}>
      {rows.map((r) => {
        const delta = r.to - r.from
        const metric = TREND_METRICS.find((m) => m.title === r.label)!
        const neutral = comparabilidade.protocoloMudou && METRICAS_DEPENDENTES_DO_PROTOCOLO.has(metric.key)
        return (
          <View key={r.label} style={summaryStyles.card}>
            <Text style={summaryStyles.label}>{r.label === '% de gordura' ? 'Gordura corporal' : r.label === 'Peso' ? 'Peso corporal' : r.label}</Text>
            <Text style={[summaryStyles.delta, { color: neutral ? palette.muted : palette.violet }]}>
              {delta > 0 ? '+' : ''}{fmtNum(delta)}{r.deltaUnit}
            </Text>
            <Text style={summaryStyles.detail}>{fmtNum(r.from)} a {fmtNum(r.to)}{r.unit}</Text>
          </View>
        )
      })}
    </View>
  )
}

function EvolutionDoc({ data }: { data: EvolutionPdfData }) {
  const first = data.history[0]
  const last = data.history[data.history.length - 1]
  const info: InfoItem[] = [
    { label: 'Avaliado', value: data.subjectName, wide: true },
    { label: 'Período', value: first && last ? `${first.date} a ${last.date}` : '—' },
    { label: 'Avaliações', value: String(data.history.length) },
  ]
  const comparabilidade = comparabilidadeDeProtocolos(data.history.map((p) => p.protocolId))
  return (
    <Document title={`Evolução · ${data.subjectName}`} author={data.orgName} language="pt-BR">
      <Page size="A4" style={pdfTheme.page}>
        <ReportRunningHeader title="Relatório de evolução" subject={data.subjectName} />
        <ReportHeader
          logoUrl={data.logoUrl}
          orgName={data.orgName}
          kicker="Relatório de evolução"
          title="Cada medida conta."
          subtitle="As mudanças do período, medida por medida."
        />
        <InfoCard items={info} />
        <EvolutionSummary history={data.history} />
        {comparabilidade.aviso ? <FreeTextSection title="Comparabilidade do período" text={comparabilidade.aviso} /> : null}
        <EvolutionSection history={data.history} maxCharts={5} />
        <CircumferenceEvolution rows={data.circumferenceHistory} />
        <MethodNote warnings={historyWarnings(data.history)}>
          Valores calculados a partir das avaliações registradas no período. Antropometria estima
          a composição corporal por equação de regressão e carrega erro padrão inerente ao método;
          serve para acompanhamento da evolução e não constitui diagnóstico ou orientação médica.
          Variações pequenas podem refletir a variabilidade da medida. Diferenças de percentual
          são expressas em pontos percentuais (p.p.).
        </MethodNote>
        <ReportFooter note="Calculado pelo motor Avalix" evaluator={data.evaluatorName} evaluatorLabel="Emitido por" />
      </Page>
    </Document>
  )
}

export async function generateEvolutionPdf(data: EvolutionPdfData): Promise<Blob> {
  registerReportFonts()
  return pdf(<EvolutionDoc data={data} />).toBlob()
}
