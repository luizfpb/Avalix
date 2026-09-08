import React from 'react'
import { Font, Path, Svg, Text, View } from '@react-pdf/renderer'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const h = React.createElement
export const ROOT = fileURLToPath(new URL('../../', import.meta.url))
export function registerFonts() {
  for (const [family, files] of [
    ['Manrope', [['manrope-400.ttf', 400], ['manrope-700.ttf', 700]]],
    ['Newsreader', [['newsreader-400.ttf', 400], ['newsreader-600.ttf', 600]]],
  ]) Font.register({ family, fonts: files.map(([file, fontWeight]) => ({ src: `${ROOT}/public/fonts/${file}`, fontWeight })) })
  Font.registerHyphenationCallback(word => [word])
}
const logoFile = readFileSync(`${ROOT}/src/brand/logo-avalix.svg`, 'utf8')
const logoViewBox = /viewBox="([^"]+)"/.exec(logoFile)[1]
const logoPath = / d="([^"]+)"/.exec(logoFile)[1]
export function Logo({ color = '#2A0E52', width = 51 } = {}) {
  return h(Svg, { viewBox: logoViewBox, width, height: width / 5.41 }, h(Path, { d: logoPath, fill: color }))
}
export const sample = {
  org: 'Estúdio Corpo & Movimento',
  subject: 'Mariana Costa',
  evaluator: 'Camila Andrade · CREF 000000-G/SP',
  date: '04/09/2026',
  period: '05/06 a 04/09/2026',
  protocol: 'Jackson & Pollock · 7 dobras',
  conversion: 'Siri',
  age: '32 anos',
  height: '168 cm',
  weight: '64,8',
  fat: '24,0',
  lean: '49,2',
  fatMass: '15,6',
  bmi: '23,0',
  dates: ['05/06', '03/07', '07/08', '04/09'],
  history: [
    { label: 'Peso corporal', unit: 'kg', delta: '−3,2 kg', values: [68, 67, 65.9, 64.8] },
    { label: 'Gordura corporal', unit: '%', delta: '−4,0 p.p.', values: [28, 26.8, 25.2, 24] },
    { label: 'Massa magra', unit: 'kg', delta: '+0,2 kg', values: [49, 49, 49.3, 49.2] },
    { label: 'Cintura', unit: 'cm', delta: '−5,0 cm', values: [79, 77.5, 75.5, 74] },
  ],
  circumferences: [
    ['Cintura', '79,0', '74,0', '−5,0'],
    ['Abdômen', '86,0', '81,5', '−4,5'],
    ['Quadril', '101,0', '98,0', '−3,0'],
    ['Braço relaxado · D', '29,5', '29,0', '−0,5'],
    ['Braço relaxado · E', '29,0', '28,8', '−0,2'],
    ['Coxa medial · D', '57,0', '55,5', '−1,5'],
    ['Coxa medial · E', '56,5', '55,0', '−1,5'],
    ['Panturrilha · D', '35,5', '35,5', '0,0'],
  ],
  skinfolds: [['Peitoral', '12,0'], ['Axilar média', '16,0'], ['Tríceps', '21,0'], ['Subescapular', '19,0'], ['Abdominal', '25,0'], ['Suprailíaca', '21,0'], ['Coxa', '29,0']],
  notes: 'Relata boa adaptação à rotina. Manter o acompanhamento das medidas e reavaliar ao final do mesociclo.',
  method: 'Composição corporal estimada por Jackson & Pollock (7 dobras), com conversão de Siri. Interpretar com as condições da coleta e o contexto individual. Este relatório não constitui diagnóstico.',
  consistency: 'As quatro avaliações usam o mesmo protocolo. Variações pequenas podem refletir a variabilidade da medida. p.p. = pontos percentuais.',
  workoutName: 'Hipertrofia · Acumulação',
  workoutMeta: '8 semanas · Início em 07/09/2026 · 4 sessões por semana',
  schedule: ['A', 'B', 'A', 'C'],
  day: 'A',
  dayName: 'Membros superiores',
  exercises: [
    { name: 'Supino reto com halteres', sets: '3', reps: '8–12', rir: '2', rest: '90 s', tempo: '2–0–2', note: 'Manter a amplitude confortável.' },
    { name: 'Remada baixa na polia', sets: '3', reps: '10–12', rir: '2', rest: '60 s', tempo: '2–0–2', group: true },
    { name: 'Elevação lateral', sets: '3', reps: '12–15', rir: '2', rest: '60 s', tempo: '2–0–2', group: true },
    { name: 'Tríceps na corda', sets: '3', reps: '10–12', rir: '1', rest: '60 s', tempo: '2–0–2', note: 'Drop-set na última série: reduzir a carga uma vez.' },
    { name: 'Prancha frontal', sets: '3', reps: 'Livre', rir: '—', rest: '45 s', tempo: null, note: 'Encerrar ao perder a posição.' },
  ],
  weeks: [
    ['1–2', 'Adaptação', 'Seguir a prescrição-base.'],
    ['3–5', 'Acumulação', 'Supino: 4 séries. Demais exercícios: manter.'],
    ['6–7', 'Intensificação', 'Supino: 4 séries de 6–8 repetições, RIR 1, pausa 120 s.'],
    ['8', 'Recuperação', 'Supino: 2 séries. Demais exercícios: manter.'],
  ],
  workoutNote: 'RIR indica quantas repetições ainda caberiam na série. Cadência 2–0–2: 2 s na descida, sem pausa, 2 s na subida.',
}

export function Txt({ children, style, ...props }) {
  return h(Text, { style: { fontFamily: 'Manrope', fontSize: 9, lineHeight: 1.4, ...style }, ...props }, children)
}

export function Footer({ page, concept, color = '#66717E', line = '#DCE2E8', left = 36, right = 36 }) {
  return h(View, { fixed: true, style: { position: 'absolute', left, right, bottom: 24, borderTopWidth: 0.6, borderTopColor: line, paddingTop: 8 } },
    h(View, { style: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } },
      h(Logo, { color, width: 43 }),
      h(Txt, { style: { fontSize: 7, color } }, sample.evaluator),
      h(Txt, { style: { fontSize: 7, color } }, `${page} / 3`)),
    h(Txt, { style: { fontSize: 6.5, color, marginTop: 4 } }, `Estudo visual · ${concept} · Dados fictícios para comparação de design`))
}

export const num = value => value.toFixed(1).replace('.', ',')
