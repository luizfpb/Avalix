import { Document, Page, View, Svg, Line, Circle, Polyline } from '@react-pdf/renderer'
import { h, sample, Footer, Txt, num } from './shared.mjs'

/*
 * PULSO — estudo visual de documentos para acompanhamento físico e treino.
 * Paleta: ameixa #291539, violeta #7954DE, névoa #F3EFFA,
 * tinta #272130, cinza #746C7E e branco #FFFFFF.
 * Tipografia: Manrope 700 nos títulos e números; Manrope 400 no texto;
 * Manrope 700 em escala reduzida dá precisão aos rótulos utilitários.
 * Layout: placa superior assimétrica / trilho proporcional / tabelas brancas.
 * Assinatura: trilhos violetas representam proporção, cronologia e sequência;
 * a mesma geometria muda de função conforme o documento, sempre com dados.
 * Revisão do plano: retirados cartões arredondados e números decorativos.
 * A divisão A ocupa o trilho do treino; o período real ocupa o da evolução.
 */

const c = { plum: '#291539', violet: '#7954DE', pale: '#F3EFFA', ink: '#272130', gray: '#746C7E', white: '#FFFFFF', line: '#DDD6E7', light: '#CFC0EC', muted: '#B4A4C2' }
const PAGE = { height: 841.89, minHeight: 841.89, paddingTop: 34, paddingHorizontal: 34, paddingBottom: 77, fontFamily: 'Manrope', fontSize: 9, color: c.ink, backgroundColor: c.white }
const row = { flexDirection: 'row' }
const text = (value, style = {}) => h(Txt, { style }, value)
const label = (value, style = {}) => text(value, { fontSize: 7, fontWeight: 700, letterSpacing: 1.05, color: c.gray, ...style })

function Brand({ type }) {
  return h(View, { style: { ...row, flexShrink: 0, justifyContent: 'space-between', alignItems: 'center', marginBottom: 17 } },
    text(sample.org, { fontSize: 10, fontWeight: 700, color: c.plum }),
    label(type, { fontSize: 6.5, letterSpacing: 1.2 }))
}

function Section({ title, meta, style = {} }) {
  return h(View, { style: { ...row, justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, ...style } },
    text(title, { fontSize: 12, fontWeight: 700 }),
    meta ? label(meta, { fontSize: 6.5, letterSpacing: 0.65 }) : null)
}

function Stat({ value, unit, title, last }) {
  return h(View, { style: { width: '33.333%', paddingLeft: last ? 14 : 0, borderLeftWidth: last ? 0.6 : 0, borderLeftColor: '#685474' } },
    label(title, { color: c.light, fontSize: 6.5, letterSpacing: 0.55 }),
    h(View, { style: { ...row, alignItems: 'baseline', marginTop: 3 } },
      text(value, { fontSize: 29, fontWeight: 700, lineHeight: 1.1, color: c.white }),
      text(unit, { fontSize: 10, marginLeft: 5, color: c.light })))
}

function AssessmentHero() {
  return h(View, { style: { backgroundColor: c.plum, padding: 22, paddingTop: 22, paddingBottom: 23, marginBottom: 23 } },
    h(View, { style: { ...row, justifyContent: 'space-between', marginBottom: 24 } },
      text('Avaliação\nfísica.', { fontSize: 38, lineHeight: 1.02, fontWeight: 700, color: c.white, letterSpacing: -1.3 }),
      h(View, { style: { width: 187, paddingTop: 7 } },
        label('ACOMPANHAMENTO INDIVIDUAL', { color: c.light, fontSize: 6.1, letterSpacing: 0.55 }),
        text(sample.subject, { color: c.white, fontSize: 17, fontWeight: 700, marginTop: 7 }),
        text(`${sample.age}  ·  ${sample.height}`, { color: c.light, fontSize: 8.5, marginTop: 4 }),
        text(sample.date, { color: c.light, fontSize: 8.5, marginTop: 2 }))),
    h(View, { style: row },
      h(Stat, { value: sample.weight, unit: 'kg', title: 'PESO CORPORAL' }),
      h(Stat, { value: sample.fat, unit: '%', title: 'GORDURA ESTIMADA', last: true }),
      h(Stat, { value: sample.lean, unit: 'kg', title: 'MASSA MAGRA', last: true })))
}

function RatioTrack() {
  return h(View, { style: { marginBottom: 19 } },
    h(Section, { title: 'Composição corporal', meta: 'ESTIMATIVA · KG' }),
    h(View, { style: { ...row, height: 13, gap: 3, marginBottom: 7 } },
      h(View, { style: { width: '76%', backgroundColor: c.plum } }),
      h(View, { style: { flex: 1, backgroundColor: c.violet } })),
    h(View, { style: { ...row, justifyContent: 'space-between' } },
      h(View, { style: row }, text('Massa magra', { fontSize: 8 }), text(`${sample.lean} kg`, { fontSize: 8, fontWeight: 700, marginLeft: 8 })),
      h(View, { style: row }, text('Massa gorda', { fontSize: 8 }), text(`${sample.fatMass} kg`, { fontSize: 8, fontWeight: 700, marginLeft: 8, color: c.violet }))))
}

function MeasureColumn({ title, unit, entries, width }) {
  return h(View, { style: { width } },
    h(Section, { title, meta: unit, style: { marginBottom: 6 } }),
    ...entries.map(([name, value], index) => h(View, { key: name, style: { ...row, height: 28.5, justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 7, backgroundColor: index % 2 === 0 ? c.pale : c.white } },
      text(name, { fontSize: 8.5 }),
      text(value, { fontSize: 9.5, fontWeight: 700 }))))
}

function Note({ title, children, small = false, style = {} }) {
  return h(View, { style: { borderLeftWidth: 3, borderLeftColor: c.violet, paddingLeft: 11, ...style } },
    label(title, { fontSize: 6.5, marginBottom: 4 }),
    text(children, { fontSize: small ? 7 : 8, color: c.gray, lineHeight: 1.45 }))
}

function AssessmentPage() {
  return h(Page, { size: 'A4', style: PAGE, wrap: false },
    h(Brand, { type: 'AVALIAÇÃO FÍSICA' }),
    h(AssessmentHero),
    h(RatioTrack),
    h(View, { style: { ...row, justifyContent: 'space-between', marginBottom: 17 } },
      h(MeasureColumn, { title: 'Circunferências', unit: 'CM', width: 273, entries: sample.circumferences.map(v => [v[0], v[2]]) }),
      h(View, { style: { width: 231 } },
        h(MeasureColumn, { title: 'Dobras cutâneas', unit: 'MM', width: '100%', entries: sample.skinfolds }),
        h(View, { style: { ...row, justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6, paddingHorizontal: 7 } },
          label('IMC', { letterSpacing: 0.5 }),
          text(`${sample.bmi} kg/m²`, { fontSize: 10, fontWeight: 700 })))),
    h(Note, { title: 'OBSERVAÇÕES DO PROFISSIONAL', style: { marginBottom: 15 } }, sample.notes),
    h(View, { style: { paddingTop: 10, borderTopWidth: 0.6, borderTopColor: c.line } },
      label('MÉTODO E LEITURA', { fontSize: 6.5, marginBottom: 4 }),
      text(sample.method, { fontSize: 8, lineHeight: 1.5, color: c.gray })),
    h(Footer, { page: 1, concept: '02 · Pulso', color: c.gray, line: c.line, left: 34, right: 34 }))
}

function HistoryHero() {
  return h(View, { style: { backgroundColor: c.plum, padding: 19, marginBottom: 17, ...row, justifyContent: 'space-between' } },
    h(View, { style: { width: 302 } },
      text('Evolução\nem perspectiva.', { fontSize: 30, lineHeight: 1.06, letterSpacing: -1.1, fontWeight: 700, color: c.white }),
      text(sample.subject, { fontSize: 11, color: c.light, marginTop: 9 })),
    h(View, { style: { width: 151, borderLeftWidth: 0.6, borderLeftColor: '#685474', paddingLeft: 15, paddingTop: 3 } },
      label('PERÍODO', { color: c.light, fontSize: 6.5 }),
      text(sample.period, { fontSize: 9, color: c.white, marginTop: 7 }),
      h(View, { style: { ...row, alignItems: 'baseline', marginTop: 15 } },
        text('4', { fontSize: 31, fontWeight: 700, color: c.white, lineHeight: 1 }),
        text('avaliações', { fontSize: 8, color: c.light, marginLeft: 6 }))))
}

function HistoryChart({ metric }) {
  const width = 245
  const min = Math.min(...metric.values)
  const max = Math.max(...metric.values)
  // Domínios mínimos impedem que oscilações pequenas preencham todo o gráfico.
  const minimumSpan = { 'Peso corporal': 8, 'Gordura corporal': 12, 'Massa magra': 5, Cintura: 12 }[metric.label]
  const span = Math.max(max - min, minimumSpan)
  const domainMin = (max + min) / 2 - span / 2
  const points = metric.values.map((value, i) => ({ x: 13 + i * 72, y: 64 - ((value - domainMin) / span) * 39, value }))
  return h(View, { style: { width: 254, borderTopWidth: 2.5, borderTopColor: c.plum, paddingTop: 8, paddingBottom: 8 } },
    h(View, { style: { ...row, justifyContent: 'space-between', alignItems: 'center' } },
      label(metric.label.toUpperCase(), { fontSize: 6.5, letterSpacing: 0.4 }),
      text(metric.delta, { fontSize: 8, fontWeight: 700, color: c.violet })),
    h(View, { style: { ...row, alignItems: 'baseline', marginTop: 3 } },
      text(num(metric.values.at(-1)), { fontSize: 24, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1.1 }),
      text(metric.unit, { fontSize: 9, color: c.gray, marginLeft: 4 })),
    h(View, { style: { position: 'relative', width, height: 83, marginTop: 1 } },
      h(Svg, { width, height: 80, viewBox: `0 0 ${width} 80` },
        ...points.map((p, i) => h(Line, { key: `line-${i}`, x1: p.x, x2: p.x, y1: 12, y2: 70, stroke: c.line, strokeWidth: 0.5 })),
        h(Polyline, { points: points.map(p => `${p.x},${p.y}`).join(' '), fill: 'none', stroke: c.violet, strokeWidth: 2 }),
        ...points.map((p, i) => h(Circle, { key: `dot-${i}`, cx: p.x, cy: p.y, r: i === 3 ? 3.5 : 2.4, fill: i === 3 ? c.plum : c.violet }))),
      ...points.map((p, i) => h(View, { key: `value-${i}`, style: { position: 'absolute', left: p.x - 13, top: p.y - 14, width: 33 } }, text(num(p.value), { fontSize: 6.5, fontWeight: 700, color: c.ink }))),
      ...sample.dates.map((date, i) => h(View, { key: date, style: { position: 'absolute', top: 73, left: points[i].x - 13, width: 35 } }, text(date, { fontSize: 6, color: c.gray }))))
  )
}

function HistoryMeasures() {
  return h(View, { style: { marginTop: 13 } },
    h(Section, { title: 'Medidas no período', meta: 'CIRCUNFERÊNCIAS · CM', style: { marginBottom: 7 } }),
    h(View, { style: { ...row, backgroundColor: c.plum, paddingVertical: 5, paddingHorizontal: 8 } },
      label('MEDIDA', { width: '52%', color: c.white, fontSize: 6 }),
      label('05/06', { width: '16%', textAlign: 'right', color: c.white, fontSize: 6 }),
      label('04/09', { width: '16%', textAlign: 'right', color: c.white, fontSize: 6 }),
      label('VARIAÇÃO', { width: '16%', textAlign: 'right', color: c.white, fontSize: 6 })),
    ...sample.circumferences.map((values, i) => h(View, { key: values[0], style: { ...row, paddingVertical: 3.6, paddingHorizontal: 8, backgroundColor: i % 2 === 0 ? c.pale : c.white } },
      ...values.map((value, j) => text(value, { width: j === 0 ? '52%' : '16%', textAlign: j === 0 ? 'left' : 'right', fontSize: 7.1, fontWeight: j === 2 ? 700 : 400, color: j === 3 ? c.violet : c.ink })))),
    text('D = direita · E = esquerda', { fontSize: 6.1, color: c.gray, marginTop: 4 }))
}

function HistoryPage() {
  return h(Page, { size: 'A4', style: PAGE, wrap: false },
    h(Brand, { type: 'EVOLUÇÃO FÍSICA' }),
    h(HistoryHero),
    h(View, { style: { ...row, justifyContent: 'space-between' } },
      h(HistoryChart, { metric: sample.history[0] }),
      h(HistoryChart, { metric: sample.history[1] })),
    h(View, { style: { ...row, justifyContent: 'space-between', marginTop: 5 } },
      h(HistoryChart, { metric: sample.history[2] }),
      h(HistoryChart, { metric: sample.history[3] })),
    h(HistoryMeasures),
    h(Note, { title: 'CONTEXTO DA COMPARAÇÃO', small: true, style: { marginTop: 14 } }, sample.consistency),
    h(Footer, { page: 2, concept: '02 · Pulso', color: c.gray, line: c.line, left: 34, right: 34 }))
}

function WorkoutHero() {
  return h(View, { style: { backgroundColor: c.plum, padding: 18, paddingBottom: 14, marginBottom: 16 } },
    h(View, { style: { ...row, justifyContent: 'space-between' } },
      h(View, { style: { width: 373 } },
        label('FICHA DE TREINO', { color: c.light, fontSize: 6.5 }),
        text('Treino em foco.', { fontSize: 30, fontWeight: 700, color: c.white, letterSpacing: -1.1, marginTop: 3 }),
        text(sample.subject, { fontSize: 11, color: c.white, marginTop: 4 }),
        text(sample.workoutName, { fontSize: 9, color: c.light, marginTop: 2 })),
      h(View, { style: { width: 81, height: 89, justifyContent: 'center', alignItems: 'center', backgroundColor: c.violet } },
        label('DIVISÃO', { color: c.white, fontSize: 6, letterSpacing: 1.2 }),
        text(sample.day, { fontSize: 51, fontWeight: 700, color: c.white, lineHeight: 1.05 }))),
    h(View, { style: { marginTop: 13, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: '#685474' } },
      text(sample.workoutMeta, { fontSize: 7.5, color: c.light })))
}

function Schedule() {
  return h(View, { style: { ...row, alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 } },
    h(View, null,
      label('SEQUÊNCIA DAS SESSÕES', { fontSize: 6.4, letterSpacing: 0.65 }),
      text(sample.dayName, { fontSize: 13, fontWeight: 700, marginTop: 4 })),
    h(View, { style: { ...row, gap: 4 } },
      ...sample.schedule.map((day, i) => h(View, { key: i, style: { width: 41, alignItems: 'center' } },
        h(View, { style: { height: 24, width: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: day === 'A' ? c.plum : c.pale } }, text(day, { fontSize: 11, fontWeight: 700, color: day === 'A' ? c.white : c.gray })),
        text(`${i + 1}ª sessão`, { fontSize: 5.5, color: c.gray, marginTop: 3 }))))
  )
}

const cols = [228, 37, 63, 36, 49, 44]

function ExerciseRow({ exercise: e, index, grouped = false }) {
  return h(View, { style: { ...row, minHeight: e.note ? 45 : 32, alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: c.line, paddingVertical: 5, paddingHorizontal: 7, backgroundColor: grouped ? c.pale : c.white } },
    h(View, { style: { width: cols[0], paddingRight: 7 } },
      h(View, { style: row },
        text(`${index + 1}`.padStart(2, '0'), { fontSize: 8, fontWeight: 700, color: c.violet, width: 21 }),
        text(e.name, { fontSize: 8, fontWeight: 700, width: 198 })),
      e.note ? text(e.note, { fontSize: 6.4, color: c.gray, paddingLeft: 21, marginTop: 3, lineHeight: 1.35 }) : null),
    ...[e.sets, e.reps, e.rir, e.rest, e.tempo || '—'].map((value, i) => text(value, { width: cols[i + 1], fontSize: i === 1 ? 9 : 8, fontWeight: i < 2 ? 700 : 400, textAlign: 'center', color: c.ink })))
}

function WorkoutTable() {
  return h(View, null,
    h(View, { style: { ...row, backgroundColor: c.plum, paddingVertical: 7, paddingHorizontal: 7 } },
      ...['EXERCÍCIO', 'SÉRIES', 'REPS', 'RIR', 'PAUSA', 'CAD.'].map((title, i) => label(title, { fontSize: 5.9, letterSpacing: 0.35, width: cols[i], textAlign: i === 0 ? 'left' : 'center', color: c.white }))),
    h(ExerciseRow, { exercise: sample.exercises[0], index: 0 }),
    h(View, { style: { borderLeftWidth: 3, borderLeftColor: c.violet } },
      h(View, { style: { backgroundColor: c.pale, paddingHorizontal: 8, paddingTop: 5, paddingBottom: 4 } },
        label('BI-SET · EXERCÍCIOS 02 + 03', { fontSize: 6, letterSpacing: 0.55, color: c.violet }),
        text('Executar em sequência, sem pausa entre eles; descansar após o par.', { fontSize: 6.5, color: c.gray, marginTop: 2 })),
      h(ExerciseRow, { exercise: sample.exercises[1], index: 1, grouped: true }),
      h(ExerciseRow, { exercise: sample.exercises[2], index: 2, grouped: true })),
    h(ExerciseRow, { exercise: sample.exercises[3], index: 3 }),
    h(ExerciseRow, { exercise: sample.exercises[4], index: 4 }))
}

function WeekPlan() {
  return h(View, { style: { marginTop: 15 } },
    h(Section, { title: 'Programação por semana', meta: 'MESOCICLO · 8 SEMANAS', style: { marginBottom: 7 } }),
    ...sample.weeks.map(([week, phase, prescription], i) => h(View, { key: week, style: { ...row, minHeight: 34, borderTopWidth: 0.5, borderTopColor: c.line, paddingVertical: 6 } },
      h(View, { style: { width: 49, borderLeftWidth: 3, borderLeftColor: i % 2 === 0 ? c.violet : c.plum, paddingLeft: 8 } },
        text(week, { fontSize: 12, fontWeight: 700, lineHeight: 1.1 }),
        label('SEM.', { fontSize: 5, letterSpacing: 0.4, marginTop: 1 })),
      text(phase, { width: 99, paddingLeft: 4, fontSize: 7.5, fontWeight: 700, paddingTop: 2 }),
      text(prescription, { flex: 1, fontSize: 7.2, color: c.gray, paddingTop: 2, lineHeight: 1.35 }))))
}

function WorkoutPage() {
  return h(Page, { size: 'A4', style: PAGE, wrap: false },
    h(Brand, { type: 'PRESCRIÇÃO DE TREINO' }),
    h(WorkoutHero),
    h(Schedule),
    h(WorkoutTable),
    h(WeekPlan),
    text(sample.workoutNote, { fontSize: 6.8, color: c.gray, lineHeight: 1.45, marginTop: 10 }),
    h(Footer, { page: 3, concept: '02 · Pulso', color: c.gray, line: c.line, left: 34, right: 34 }))
}

export function PulsoDocument() {
  return h(Document, { title: 'Pulso — Proposta visual 02 | Avalix', author: 'Avalix', subject: 'Estudo visual com dados fictícios' },
    h(AssessmentPage), h(HistoryPage), h(WorkoutPage))
}
