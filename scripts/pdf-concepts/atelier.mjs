import { Circle, Document, Line, Page, Path, Svg, Text, View } from '@react-pdf/renderer'
import { Footer, h, num, sample, Txt } from './shared.mjs'

// Atelier: gelo #FCFBFE, lilás #F1EDF6, plum #3F284B, magenta #9C4779,
// tinta #26202C e cinza #786F80. Newsreader para títulos e valores; Manrope
// para leitura e dados. Margens funcionais, colunas assimétricas e respiro.
// Assinatura: o dado ganha a escala de um retrato editorial, com notas marginais
// que explicam método e leitura. A numeração aparece apenas na ordem do treino.
const C = { paper: '#FCFBFE', lilac: '#F1EDF6', plum: '#3F284B', accent: '#9C4779', ink: '#26202C', muted: '#786F80', line: '#E2DCE9', white: '#FFFFFF' }
const serif = (text, size = 26, style = {}) => h(Text, { style: { fontFamily: 'Newsreader', fontWeight: 400, fontSize: size, lineHeight: 1.05, color: C.plum, ...style } }, text)
const body = (text, style = {}) => h(Txt, { style: { color: C.ink, ...style } }, text)
const label = (text, style = {}) => body(text, { fontSize: 7.3, fontWeight: 700, letterSpacing: 0.75, color: C.muted, ...style })
const row = (children, style = {}) => h(View, { style: { flexDirection: 'row', ...style } }, ...children)
const col = (children, style = {}) => h(View, { style }, ...children)

function Heading({ title, kind, subtitle, compact = false }) {
  return col([
    row([
      body(sample.org, { fontSize: 10, fontWeight: 700, color: C.plum }),
      label(kind, { fontSize: 6.6 }),
    ], { justifyContent: 'space-between', alignItems: 'center', marginBottom: compact ? 20 : 28 }),
    serif(title, compact ? 33 : 37),
    row([
      body(sample.subject, { fontSize: 10, fontWeight: 700, color: C.plum }),
      body(subtitle, { fontSize: 8, color: C.muted }),
    ], { justifyContent: 'space-between', marginTop: 9, alignItems: 'center' }),
  ], { marginBottom: compact ? 18 : 23 })
}

function Sheet({ children, page }) {
  return h(Page, { size: 'A4', wrap: false, style: { minHeight: 841.89, maxHeight: 841.89, backgroundColor: C.paper, paddingTop: 34, paddingHorizontal: 36, paddingBottom: 78, fontFamily: 'Manrope' } },
    ...children, h(Footer, { page, concept: '03 · Atelier', color: C.muted, line: C.line }))
}

function Circumferences() {
  return col([
    serif('Circunferências', 23),
    row([label('REGIÃO', { width: 158 }), label('ATUAL', { width: 61, textAlign: 'right' }), label('CM', { width: 41, textAlign: 'right' })], { marginTop: 13, marginBottom: 7 }),
    ...sample.circumferences.map(([name, , current], i) => row([
      body(name, { width: 158, fontSize: 8.5 }),
      body(current, { width: 61, textAlign: 'right', fontSize: 10, fontWeight: 700, color: C.plum }),
      body('cm', { width: 41, textAlign: 'right', fontSize: 7.5, color: C.muted }),
    ], { minHeight: 23, alignItems: 'center', backgroundColor: i % 2 === 0 ? C.lilac : C.paper, paddingHorizontal: 9, marginHorizontal: -9 })),
  ], { width: 260 })
}

function Skinfolds() {
  return col([
    serif('Dobras cutâneas', 23),
    row([label('PONTO', { flex: 1 }), label('MM', { textAlign: 'right' })], { marginTop: 13, marginBottom: 7 }),
    ...sample.skinfolds.map(([name, value]) => row([
      body(name, { fontSize: 8.5 }),
      body(value, { fontSize: 10, color: C.plum }),
    ], { justifyContent: 'space-between', height: 23, alignItems: 'center' })),
  ], { width: 199 })
}

function Assessment() {
  return h(Sheet, { page: 1 }, [
    h(Heading, { key: 'heading', title: 'Avaliação física', kind: 'ACOMPANHAMENTO INDIVIDUAL', subtitle: `${sample.date}  ·  ${sample.age}  ·  ${sample.height}` }),
    row([
      col([
        label('COMPOSIÇÃO CORPORAL', { color: C.plum, fontSize: 7 }),
        row([serif(sample.fat, 65), serif('%', 27, { marginTop: 27, marginLeft: 5 })], { marginTop: 10, alignItems: 'flex-start' }),
        body('Gordura corporal estimada', { fontSize: 8, color: C.plum, marginTop: 2 }),
      ], { width: 239 }),
      col([
        ...[
          ['Peso corporal', sample.weight, 'kg'],
          ['Massa magra', sample.lean, 'kg'],
          ['Massa gorda', sample.fatMass, 'kg'],
        ].map(([name, value, unit], i) => row([
          body(name, { fontSize: 8, color: C.plum, width: 91 }),
          serif(value, 27, { width: 80, textAlign: 'right' }),
          body(unit, { fontSize: 8, color: C.muted, marginLeft: 6, marginTop: 5 }),
        ], { alignItems: 'center', marginBottom: i === 2 ? 0 : 11 })),
        row([label('IMC', { fontSize: 7 }), body(`${sample.bmi} kg/m²`, { fontSize: 8, color: C.plum })], { justifyContent: 'space-between', marginTop: 12 }),
      ], { flex: 1, marginLeft: 22 }),
    ], { backgroundColor: C.lilac, paddingHorizontal: 22, paddingVertical: 20, minHeight: 166 }),
    row([
      label('MÉTODO', { width: 92 }),
      body(`${sample.protocol}  ·  Conversão de ${sample.conversion}`, { fontSize: 8, color: C.muted }),
    ], { marginTop: 12, marginBottom: 28 }),
    row([h(Circumferences, { key: 'circumferences' }), h(Skinfolds, { key: 'skinfolds' })], { justifyContent: 'space-between' }),
    row([
      serif('Notas do\nacompanhamento', 18, { width: 139 }),
      body(sample.notes, { width: 352, fontSize: 9, lineHeight: 1.55 }),
    ], { justifyContent: 'space-between', marginTop: 24 }),
    body(sample.method, { fontSize: 7.2, color: C.muted, lineHeight: 1.5, marginTop: 21 }),
  ])
}

function FatChart() {
  const width = 343
  const height = 177
  const values = sample.history[1].values
  const chartY = value => 19 + ((32 - value) / 12) * 126
  const points = values.map((v, i) => [39 + i * 89, chartY(v)])
  const line = points.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ')
  return col([
    h(Svg, { width, height, viewBox: `0 0 ${width} ${height}` },
      h(Path, { d: `${line} L 306 145 L 39 145 Z`, fill: C.lilac }),
      ...[20, 24, 28, 32].flatMap(value => [
        h(Line, { key: `grid-${value}`, x1: 39, y1: chartY(value), x2: 306, y2: chartY(value), stroke: C.line, strokeWidth: 0.5 }),
        h(Text, { key: `tick-${value}`, x: 27, y: chartY(value) + 2.5, fill: C.muted, style: { fontFamily: 'Manrope', fontSize: 7 }, textAnchor: 'end' }, `${value}%`),
      ]),
      h(Path, { d: line, fill: 'none', stroke: C.accent, strokeWidth: 2.2 }),
      ...points.flatMap(([x, y], i) => [
        h(Circle, { key: `circle-${i}`, cx: x, cy: y, r: 3.3, fill: C.accent, stroke: C.paper, strokeWidth: 1.5 }),
        h(Text, { key: `value-${i}`, x, y: y - 12, fill: C.plum, style: { fontFamily: 'Manrope', fontWeight: 700, fontSize: 9 }, textAnchor: 'middle' }, `${num(values[i])}%`),
        h(Text, { key: `date-${i}`, x, y: 165, fill: C.muted, style: { fontFamily: 'Manrope', fontSize: 8 }, textAnchor: 'middle' }, sample.dates[i]),
      ])),
  ], { width })
}

function Evolution() {
  const widths = [143, 66, 66, 66, 66, 116.28]
  return h(Sheet, { page: 2 }, [
    h(Heading, { key: 'heading', title: 'Evolução em perspectiva', kind: 'HISTÓRICO DE MEDIDAS', subtitle: sample.period }),
    row([
      col([
        label('GORDURA CORPORAL'),
        serif('−4,0', 52, { color: C.accent, marginTop: 20 }),
        body('pontos percentuais', { fontSize: 8.5, color: C.plum }),
        body('28,0% para 24,0%', { fontSize: 9, fontWeight: 700, color: C.plum, marginTop: 15 }),
        body('Da primeira à última\navaliação do período.', { fontSize: 8, color: C.muted, lineHeight: 1.5, marginTop: 7 }),
      ], { width: 153 }),
      h(FatChart, { key: 'chart' }),
    ], { justifyContent: 'space-between', marginTop: 6, marginBottom: 26 }),
    row([
      label('LEITURA DA SÉRIE', { width: 139 }),
      body(sample.consistency, { width: 356, fontSize: 8.2, color: C.muted, lineHeight: 1.5 }),
    ], { justifyContent: 'space-between', marginBottom: 27 }),
    serif('Cada medida, ao longo do tempo', 24),
    row([
      label('INDICADOR', { width: widths[0], flexShrink: 0 }),
      ...sample.dates.map((date, i) => label(date, { width: widths[i + 1], flexShrink: 0, textAlign: 'right' })),
      label('VARIAÇÃO', { width: widths[5], flexShrink: 0, textAlign: 'right' }),
    ], { width: 523.28, flexShrink: 0, marginTop: 17, marginBottom: 10 }),
    ...sample.history.map((metric, i) => row([
      col([body(metric.label, { fontSize: 9, fontWeight: 700, color: C.plum }), body(metric.unit, { fontSize: 7.2, color: C.muted, marginTop: 3 })], { width: widths[0], flexShrink: 0 }),
      ...metric.values.map((value, j) => body(num(value), { width: widths[j + 1], flexShrink: 0, fontSize: 10, fontWeight: j === 3 ? 700 : 400, textAlign: 'right', color: C.plum })),
      serif(metric.delta, 17, { width: widths[5], flexShrink: 0, textAlign: 'right', color: C.accent }),
    ], { width: 543.28, flexShrink: 0, height: 46, alignItems: 'center', backgroundColor: i % 2 === 0 ? C.lilac : C.paper, paddingHorizontal: 10, marginHorizontal: -10 })),
    row([
      serif('O contexto\nacompanha o dado.', 22, { width: 165 }),
      col([
        body(sample.notes, { fontSize: 9, lineHeight: 1.6 }),
        body(sample.method, { fontSize: 7.2, color: C.muted, marginTop: 12, lineHeight: 1.5 }),
      ], { width: 330 }),
    ], { justifyContent: 'space-between', marginTop: 32 }),
  ])
}

const workoutWidths = [248.28, 38, 57, 38, 62, 80]
function Exercise({ exercise, index }) {
  return row([
    row([
      serif(String(index + 1), 19, { color: exercise.group ? C.accent : C.muted, width: 23, marginTop: 1 }),
      col([
        body(exercise.name, { fontSize: 9.2, fontWeight: 700, color: C.plum }),
        ...(exercise.note ? [body(exercise.note, { fontSize: 7.2, color: C.muted, lineHeight: 1.4, marginTop: 3 })] : []),
      ], { width: workoutWidths[0] - 34 }),
    ], { width: workoutWidths[0] }),
    ...[exercise.sets, exercise.reps, exercise.rir, exercise.rest, exercise.tempo || '—'].map((value, i) => body(value, { width: workoutWidths[i + 1], textAlign: 'center', fontSize: 8.6, color: C.plum, paddingTop: 3 })),
  ], { paddingVertical: exercise.group ? 10 : 10, minHeight: exercise.note ? 53 : 37, alignItems: 'flex-start' })
}

function Workout() {
  return h(Sheet, { page: 3 }, [
    h(Heading, { key: 'heading', title: 'Seu plano de treino', kind: 'PRESCRIÇÃO INDIVIDUAL', subtitle: sample.date, compact: true }),
    row([
      col([serif(sample.workoutName, 23), body(sample.workoutMeta, { fontSize: 8, color: C.muted, marginTop: 6 })], { width: 365 }),
      col([
        label('ORDEM DAS SESSÕES', { fontSize: 6.7, textAlign: 'right', marginBottom: 6 }),
        row(sample.schedule.flatMap((day, i) => [
          ...(i ? [body('·', { color: C.muted, fontSize: 13, marginHorizontal: 8 })] : []),
          serif(day, 22, { color: C.accent }),
        ]), { justifyContent: 'flex-end' }),
      ], { width: 149 }),
    ], { marginBottom: 20 }),
    row([
      serif(sample.day, 47, { width: 58, color: C.accent }),
      col([label('DIVISÃO'), serif(sample.dayName, 24, { marginTop: 4 })], { paddingTop: 3 }),
      body('Prescrição-base\nSemanas 1–2', { marginLeft: 'auto', fontSize: 7.8, color: C.muted, textAlign: 'right', lineHeight: 1.5, paddingTop: 8 }),
    ], { marginBottom: 12 }),
    row(['EXERCÍCIO', 'SÉRIES', 'REPS', 'RIR', 'PAUSA', 'CADÊNCIA'].map((text, i) => label(text, { width: workoutWidths[i], textAlign: i ? 'center' : 'left', fontSize: 6.7, letterSpacing: 0.4 })), { paddingVertical: 8, borderBottomWidth: 0.7, borderBottomColor: C.line }),
    h(Exercise, { key: 'ex-1', exercise: sample.exercises[0], index: 0 }),
    col([
      row([
        body('BI-SET · EXERCÍCIOS 2–3', { fontWeight: 700, fontSize: 7, color: C.accent, width: 162 }),
        body('Em sequência, sem pausa entre eles. Descansar 60 s ao final.', { fontSize: 7, color: C.plum, flex: 1 }),
      ], { backgroundColor: C.lilac, paddingVertical: 7, paddingLeft: 9, paddingRight: 5 }),
      h(Exercise, { key: 'ex-2', exercise: sample.exercises[1], index: 1 }),
      h(Exercise, { key: 'ex-3', exercise: sample.exercises[2], index: 2 }),
    ], { borderLeftWidth: 2, borderLeftColor: C.accent, marginLeft: -11, paddingLeft: 9 }),
    h(Exercise, { key: 'ex-4', exercise: sample.exercises[3], index: 3 }),
    h(Exercise, { key: 'ex-5', exercise: sample.exercises[4], index: 4 }),
    row([
      serif('Ao longo\ndas semanas', 23, { width: 135 }),
      col(sample.weeks.map(([weeks, phase, instruction], i) => row([
        serif(weeks, 23, { width: 42, color: C.accent }),
        col([body(phase, { fontSize: 8, fontWeight: 700, color: C.plum }), body(instruction, { fontSize: 7.4, lineHeight: 1.4, color: C.muted, marginTop: 2 })], { width: 322 }),
      ], { marginBottom: i === 3 ? 0 : 9 })), { width: 371 }),
    ], { marginTop: 17, paddingTop: 15, borderTopWidth: 0.7, borderTopColor: C.line, justifyContent: 'space-between' }),
    body(sample.workoutNote, { marginTop: 14, color: C.muted, fontSize: 7.2, lineHeight: 1.5 }),
  ])
}

export function AtelierDocument() {
  return h(Document, { title: 'Avalix · Atelier · Proposta visual 03', author: 'Avalix', subject: 'Estudo visual com dados fictícios: avaliação física, evolução e treino', language: 'pt-BR' },
    h(Assessment), h(Evolution), h(Workout))
}
