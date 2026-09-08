import { Circle, Document, Line, Page, Path, Svg, View } from '@react-pdf/renderer'
import { Footer, h, num, sample as d, Txt } from './shared.mjs'

// Clareza: papel #FFFFFF, tinta #212334, violeta #6250A1, névoa #F4F2FA,
// magenta #AC577B, verde #2B796A. Manrope para títulos, dados e leitura;
// Newsreader aparece apenas na nota assinada. Grade modular de dois ritmos:
// uma leitura ampla da composição, seguida por tabelas compactas de aferição.
// Assinatura: composição corporal como um instrumento circular legível,
// com a proporção real ligada diretamente às duas massas estimadas.
const c = { ink: '#212334', purple: '#6250A1', pale: '#F4F2FA', line: '#E4E4EE', muted: '#646579', pink: '#AC577B', white: '#FFFFFF', green: '#2B796A' }
const row = { flexDirection: 'row' }
const bold = { fontWeight: 700 }
const small = { fontSize: 7.5, color: c.muted }
const box = { borderRadius: 12, backgroundColor: c.pale, padding: 16 }
const text = (value, style = {}, key = value) => h(Txt, { key, style }, value)

function Heading({ kind, title, subtitle }) {
  return h(View, { style: { marginBottom: 17 } },
    h(View, { style: { ...row, justifyContent: 'space-between', marginBottom: 21, alignItems: 'center' } },
      text(d.org, { fontSize: 10, ...bold }), text('AVALIAÇÃO & MOVIMENTO', { fontSize: 6.5, letterSpacing: 1.2, color: c.purple })),
    text(kind, { fontSize: 7, letterSpacing: 1.5, color: c.purple, ...bold, marginBottom: 4 }),
    text(title, { fontSize: 31, ...bold, letterSpacing: -1.1, lineHeight: 1.16 }),
    text(subtitle, { ...small, marginTop: 6 }))
}
function Identity({ workout = false }) {
  return h(View, { style: { ...row, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: c.line, paddingBottom: 13, marginBottom: 16 } },
    text(d.subject, { fontSize: 17, ...bold, letterSpacing: -0.4 }),
    text(workout ? '07/09/2026 · 8 semanas' : `${d.age} · ${d.height} · ${d.date}`, { ...small }))
}
function Section({ title, detail }) {
  return h(View, { style: { ...row, justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 } },
    text(title, { fontSize: 11, ...bold }), detail && text(detail, small))
}
function Table({ headers, rows, widths, dense = false, tight = false }) {
  return h(View, null,
    h(View, { style: { ...row, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: c.line } }, headers.map((v, i) => text(v, { fontSize: 7, color: c.muted, width: widths[i], textAlign: i ? 'right' : 'left' }))),
    ...rows.map((r, k) => h(View, { key: k, wrap: false, style: { ...row, paddingVertical: dense ? (tight ? 3 : 4) : 6, borderBottomWidth: 0.5, borderBottomColor: c.line } }, r.map((v, i) => text(v, { fontSize: dense ? 7.7 : 8.2, width: widths[i], textAlign: i ? 'right' : 'left', ...(i ? bold : {}) }, i)))))
}
function Note({ title, content }) {
  return h(View, { style: { borderLeftWidth: 2, borderLeftColor: c.purple, paddingLeft: 10, marginTop: 14 } },
    text(title, { fontSize: 8, ...bold, color: c.purple, marginBottom: 3 }), text(content, { fontSize: 7.5, color: c.muted, lineHeight: 1.5 }))
}
function Composition() {
  return h(View, { style: { ...box, ...row, height: 166, marginBottom: 12, padding: 18, alignItems: 'center' } },
    h(View, { style: { width: 166, height: 132, position: 'relative' } },
      h(Svg, { width: 148, height: 132, viewBox: '0 0 148 132' },
        h(Circle, { cx: 68, cy: 66, r: 50, stroke: c.purple, strokeWidth: 12, fill: 'none' }),
        h(Circle, { cx: 68, cy: 66, r: 50, stroke: c.pink, strokeWidth: 12, fill: 'none', strokeDasharray: '75.40 314.16', transform: 'rotate(-90 68 66)' })),
      h(View, { style: { position: 'absolute', top: 39, left: 14, width: 109, alignItems: 'center' } },
        text('24,0%', { fontSize: 25, ...bold, letterSpacing: -0.9 }), text('gordura corporal', { fontSize: 7, color: c.muted }))),
    h(View, { style: { flex: 1 } },
      text('Sua composição corporal', { fontSize: 12, ...bold, marginBottom: 13 }),
      ...[[c.purple, 'Massa magra', '49,2', '76,0%'], [c.pink, 'Massa gorda', '15,6', '24,0%']].map(([color, name, v, pct]) =>
        h(View, { key: name, style: { ...row, alignItems: 'center', marginBottom: 10 } },
          h(View, { style: { width: 5, height: 26, borderRadius: 3, backgroundColor: color, marginRight: 9 } }),
          h(View, { style: { flex: 1 } }, text(name, { ...small, color }), text(pct, { fontSize: 7, color: c.muted })),
          text(v, { fontSize: 23, ...bold, letterSpacing: -0.6 }), text(' kg', { fontSize: 8, color: c.muted, marginTop: 8 }))),
      text('Estimativas a partir de dobras cutâneas', { fontSize: 6.7, color: c.muted })))
}
function Metrics() {
  return h(View, { style: { ...row, gap: 10, marginBottom: 22 } },
    ...[['Peso corporal', '64,8', 'kg'], ['IMC', '23,0', 'kg/m²'], ['Altura', '168', 'cm']].map(([label, value, unit]) =>
      h(View, { key: label, style: { flex: 1, borderWidth: 0.7, borderColor: c.line, borderRadius: 10, padding: 11 } },
        text(label, small), h(View, { style: { ...row, alignItems: 'baseline', marginTop: 3 } }, text(value, { fontSize: 21, ...bold, letterSpacing: -0.5 }), text(` ${unit}`, small)))))
}
function Assessment() {
  return h(Page, { size: 'A4', style: { padding: 34, paddingBottom: 70, color: c.ink, backgroundColor: c.white } },
    h(Heading, { kind: 'AVALIAÇÃO FÍSICA', title: 'Seu corpo, em perspectiva.', subtitle: `${d.protocol} · Conversão de ${d.conversion}` }),
    h(Identity), h(Composition), h(Metrics),
    h(View, { style: { ...row, gap: 24 } },
      h(View, { style: { flex: 1 } }, h(Section, { title: 'Circunferências', detail: 'cm' }),
        h(Table, { headers: ['Região', 'Atual'], rows: d.circumferences.map(r => [r[0], r[2]]), widths: ['76%', '24%'], dense: true })),
      h(View, { style: { flex: 1 } }, h(Section, { title: 'Dobras cutâneas', detail: 'média · mm' }),
        h(Table, { headers: ['Ponto de coleta', 'Valor'], rows: d.skinfolds, widths: ['76%', '24%'], dense: true }),
        text('Valores ilustrativos de aferição.', { fontSize: 6.5, color: c.muted, marginTop: 6 }))),
    h(Note, { title: 'Observações da profissional', content: d.notes }),
    text(d.method, { fontSize: 7, lineHeight: 1.5, color: c.muted, marginTop: 13 }),
    h(Footer, { page: 1, concept: 'Clareza' }))
}
function Chart({ metric, width = 240, height = 107, color = c.purple, domain }) {
  const values = metric.values
  const lo = domain[0], hi = domain[1]
  const l = 29, r = width - 15, t = 14, b = height - 23
  const xs = values.map((_, i) => l + i * (r - l) / 3)
  const ys = values.map(v => b - (v - lo) / (hi - lo) * (b - t))
  const path = xs.map((x, i) => `${i ? 'L' : 'M'} ${x} ${ys[i]}`).join(' ')
  return h(View, { style: { position: 'relative', width, height } },
    h(Svg, { width, height, viewBox: `0 0 ${width} ${height}` },
      ...[t, (t + b) / 2, b].map((y, i) => h(Line, { key: `grid-${i}`, x1: l, x2: r, y1: y, y2: y, stroke: c.line, strokeWidth: 0.6 })),
      h(Path, { d: path, stroke: color, strokeWidth: 2, fill: 'none' }),
      ...xs.map((x, i) => h(Circle, { key: `point-${i}`, cx: x, cy: ys[i], r: 3.2, fill: color, stroke: c.white, strokeWidth: 1.2 }))),
    ...[hi, (hi + lo) / 2, lo].map((v, i) => text(num(v), { position: 'absolute', top: [t - 5, (t + b) / 2 - 5, b - 5][i], left: 0, width: 24, fontSize: 6.5, color: c.muted, textAlign: 'right' })),
    ...xs.map((x, i) => text(d.dates[i], { position: 'absolute', left: x - 13, top: b + 7, width: 29, fontSize: 6.4, color: c.muted, textAlign: 'center' })))
}
function Evolution() {
  return h(Page, { size: 'A4', style: { padding: 34, paddingBottom: 70, color: c.ink } },
    h(Heading, { kind: 'RELATÓRIO DE EVOLUÇÃO', title: 'Cada medida conta.', subtitle: `${d.period} · 4 avaliações · Mesmo protocolo` }), h(Identity),
    h(View, { style: { ...row, gap: 10, marginBottom: 12 } },
      ...d.history.map(m => h(View, { key: m.label, style: { flex: 1, ...box, padding: 11 } },
        text(m.label, { fontSize: 7, color: c.muted }), text(m.delta, { fontSize: 18, ...bold, color: c.purple, letterSpacing: -0.5, marginTop: 5 }),
        text(`${num(m.values[0])} a ${num(m.values[3])} ${m.unit}`, { fontSize: 7, marginTop: 4, color: c.muted })))),
    h(View, { style: { ...row, flexWrap: 'wrap', columnGap: 17, rowGap: 10, marginBottom: 12 } },
      ...d.history.map((m, i) => h(View, { key: m.label, style: { width: 255 } },
        h(Section, { title: m.label, detail: m.unit }), h(Chart, { metric: m, width: 253, height: 78, color: i === 1 ? c.pink : c.purple, domain: [[62, 70], [20, 32], [47, 52], [70, 82]][i] })))),
    h(Section, { title: 'Medidas ao longo do período', detail: 'cm' }),
    h(Table, { headers: ['Circunferência', '05/06', '04/09', 'Variação'], rows: d.circumferences, widths: ['49%', '17%', '17%', '17%'], dense: true, tight: true }),
    h(Note, { title: 'Como ler esta evolução', content: `${d.consistency} Composição corporal estimada; este relatório não constitui diagnóstico.` }),
    h(Footer, { page: 2, concept: 'Clareza' }))
}
function ExerciseRow({ e, index }) {
  return h(View, { wrap: false, style: { ...row, paddingVertical: 8, paddingHorizontal: 9, backgroundColor: e.group ? c.pale : c.white, borderLeftWidth: e.group ? 2 : 0, borderLeftColor: c.purple, paddingLeft: e.group ? 7 : 9, borderBottomWidth: 0.5, borderBottomColor: c.line } },
    text(String(index + 1).padStart(2, '0'), { width: 24, fontSize: 7.8, color: c.muted, paddingTop: 1 }),
    h(View, { style: { flex: 1, paddingRight: 8 } }, text(e.name, { fontSize: 9, ...bold }),
      text([e.tempo && `Cadência ${e.tempo}`, e.note].filter(Boolean).join(' · '), { fontSize: 6.6, color: c.muted, marginTop: 2 })),
    ...[[e.sets, 35], [e.reps, 50], [e.rir, 29], [e.rest, 40]].map(([v, w], i) => text(v, { width: w, textAlign: 'center', fontSize: 8.5, ...(i < 2 ? bold : {}), paddingTop: 1 })))
}
function Workout() {
  return h(Page, { size: 'A4', style: { padding: 34, paddingBottom: 70, color: c.ink } },
    h(Heading, { kind: 'PLANO DE TREINO', title: 'Seu próximo movimento.', subtitle: d.workoutName }), h(Identity, { workout: true }),
    h(View, { style: { ...row, alignItems: 'center', marginBottom: 18 } },
      h(View, { style: { flex: 1 } }, text('Sua sequência semanal', { fontSize: 10, ...bold }), text('4 sessões · Siga a ordem das divisões', { ...small, marginTop: 3 })),
      ...d.schedule.map((letter, i) => h(View, { key: i, style: { marginLeft: 7, alignItems: 'center' } }, text(`${i + 1}ª sessão`, { fontSize: 6, color: c.muted, marginBottom: 4 }),
        h(View, { style: { width: 35, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: i === 0 ? c.purple : c.pale } }, text(letter, { fontSize: 14, ...bold, color: i === 0 ? c.white : c.purple }))))),
    h(View, { style: { ...row, alignItems: 'center', marginBottom: 10 } },
      h(View, { style: { backgroundColor: c.purple, borderRadius: 9, width: 37, height: 37, alignItems: 'center', justifyContent: 'center', marginRight: 10 } }, text('A', { fontSize: 21, color: c.white, ...bold })),
      h(View, null, text(d.dayName, { fontSize: 14, ...bold }), text('Prescrição-base · 5 exercícios', small))),
    h(View, { style: { ...row, backgroundColor: c.pale, borderRadius: 5, paddingVertical: 6, paddingHorizontal: 9 } },
      text('EXERCÍCIO', { flex: 1, fontSize: 6.5, color: c.muted, letterSpacing: 0.5 }),
      ...[['SÉRIES', 35], ['REPS', 50], ['RIR', 29], ['PAUSA', 40]].map(([v, w]) => text(v, { width: w, fontSize: 6, color: c.muted, textAlign: 'center' }))),
    ...d.exercises.flatMap((e, index) => [
      ...(index === 1 ? [h(View, { key: 'bi-set', style: { backgroundColor: c.pale, borderLeftWidth: 2, borderLeftColor: c.purple, paddingVertical: 5, paddingHorizontal: 9 } }, text('BI-SET · Alterne os exercícios 02 e 03; descanse após o par.', { fontSize: 7, color: c.purple, ...bold }))] : []),
      h(ExerciseRow, { key: e.name, e, index })]),
    h(View, { style: { marginTop: 18 } }, h(Section, { title: 'O que muda a cada semana', detail: '8 semanas' }),
      ...d.weeks.map(([week, name, desc]) => h(View, { key: week, wrap: false, style: { ...row, paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: c.line } },
        text(week, { width: 33, fontSize: 9, color: c.purple, ...bold }),
        text(name, { width: 99, fontSize: 8, ...bold }), text(desc, { flex: 1, fontSize: 7.5, color: c.muted })))),
    h(Note, { title: 'Para consultar durante o treino', content: d.workoutNote }),
    text('Amostra da divisão A. As divisões B e C seguem o mesmo sistema visual.', { fontSize: 7, color: c.muted, marginTop: 10 }),
    h(Footer, { page: 3, concept: 'Clareza' }))
}
export function ClarezaDocument() {
  return h(Document, { title: 'Avalix · Opção 1 · Clareza', author: 'Avalix', subject: 'Estudo visual com dados fictícios' }, h(Assessment), h(Evolution), h(Workout))
}
