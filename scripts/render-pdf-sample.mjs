// Gera amostras dos dois PDFs para inspecao VISUAL (o CLAUDE.md proibe iterar
// dataviz de PDF as cegas). Nao roda no CI; e ferramenta de desenvolvimento.
//
//   npx vite-node scripts/render-pdf-sample.mjs <pasta-de-saida>
//
// Depois: pdftoppm -png -r 80 saida/treino.pdf saida/treino
//
// Os dados sao propositalmente de ESTRESSE: nome comprido, acentos, caractere
// fora do WinAnsi, divisao com muitos exercicios e mesociclo de 8 semanas com
// overrides em todas — os casos que estouravam pagina ou trocavam glifo.
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const outDir = process.argv[2] ?? 'pdf-sample'
mkdirSync(outDir, { recursive: true })

// Registra as MESMAS fontes que o navegador vai baixar, mas por caminho de
// arquivo: assim o que se inspecciona aqui e o que o educador recebe.
const { registerReportFontsFrom } = await import('../src/features/reports/pdfFonts.ts')
registerReportFontsFrom(join(process.cwd(), 'public/fonts'))

const { generateWorkoutPdf } = await import('../src/features/reports/workoutPdf.tsx')
const { generateAssessmentPdf } = await import('../src/features/reports/assessmentPdf.tsx')

const EXERCICIOS = [
  'Supino reto com barra', 'Supino inclinado com halteres', 'Crucifixo na polia',
  'Desenvolvimento militar', 'Elevacao lateral', 'Triceps testa',
  'Triceps corda', 'Puxada frontal supinada', 'Remada curvada',
  'Remada unilateral', 'Rosca direta', 'Rosca martelo',
  'Agachamento livre', 'Leg press 45', 'Cadeira extensora',
  'Mesa flexora', 'Panturrilha em pe', 'Abdominal infra',
]

const dias = ['A', 'B', 'C'].map((label, di) => ({
  id: `d${di}`,
  plan_id: 'p1',
  org_id: 'o1',
  label,
  name: `Treino ${label} - membros superiores e inferiores`,
  position: di,
  created_at: '2026-06-01',
}))

// Agrupamentos e reps em branco entram na amostra de proposito: a faixa do
// bloco, o fundo dos membros e o travessao da celula sem faixa so existem no
// caminho de render, e a regra da casa e nunca iterar PDF as cegas.
// Divisao A: super-serie nos exercicios 1 e 2, com drop-set no segundo.
// Divisao B: circuito de tres. Divisao C: um exercicio sem faixa de reps.
function agrupamento(di, i) {
  if (di === 0 && (i === 1 || i === 2)) return { group_key: 'gA', group_kind: 'superset' }
  if (di === 1 && i < 3) return { group_key: 'gB', group_kind: 'circuit' }
  return { group_key: null, group_kind: null }
}

const exercises = dias.flatMap((d, di) =>
  EXERCICIOS.slice(0, 6).map((nome, i) => ({
    id: `e${di}-${i}`,
    day_id: d.id,
    org_id: 'o1',
    exercise_id: `x${di}-${i}`,
    position: i,
    sets: 4,
    reps: di === 2 && i === 5 ? null : '8-12',
    rir: 2,
    rest_seconds: 90,
    tempo: '2-0-2',
    // Caractere fora do WinAnsi de proposito: antes virava outro glifo.
    notes: i === 0 ? 'Manter RIR ≤ 2 e amplitude completa' : null,
    technique: di === 0 && i === 2 ? 'drop_set' : null,
    ...agrupamento(di, i),
    created_at: '2026-06-01',
  }))
)

const exerciseNames = Object.fromEntries(
  exercises.map((e, i) => [e.exercise_id, EXERCICIOS[i % EXERCICIOS.length]])
)

// 8 semanas com overrides em varios exercicios: o caso que estourava a pagina.
const weeks = Array.from({ length: 8 }, (_, i) => ({
  id: `w${i}`, plan_id: 'p1', org_id: 'o1',
  week_number: i + 1,
  label: i === 3 ? 'Choque' : `Bloco ${Math.floor(i / 2) + 1}`,
  is_deload: i === 7,
  notes: null, created_at: '2026-06-01',
}))

const overrides = weeks.flatMap((w) =>
  exercises.slice(0, 6).map((e) => ({
    id: `o${w.week_number}-${e.id}`, org_id: 'o1', plan_id: 'p1',
    workout_exercise_id: e.id,
    week_number: w.week_number,
    sets: 4 + (w.week_number % 2), reps: '6-10', rir: 1,
    rest_seconds: 120, is_skipped: false,
    notes: 'Progredir carga se RIR ≥ 3', created_at: '2026-06-01',
  }))
)

const plan = {
  id: 'p1', org_id: 'o1', subject_id: 's1', evaluator_id: 'u1',
  name: 'Mesociclo de hipertrofia - fase de acumulacao',
  goal: 'hypertrophy', weeks: 8, starts_on: '2026-06-01',
  notes: 'Observacoes longas para testar quebra de pagina. '.repeat(40),
  status: 'active', source_assessment_id: null, source_posture_session_id: null,
  volume: null, volume_engine_version: null,
  weekly_schedule: ['A', 'B', 'A', 'C'],
  created_at: '2026-06-01', updated_at: '2026-06-01',
}

const workoutBlob = await generateWorkoutPdf({
  orgName: 'Estudio Corpo & Movimento',
  subjectName: 'Maria Aparecida do Nascimento Goncalves Silva',
  evaluatorName: 'Prof. Joao Carlos de Almeida (CREF 000000-G/SP)',
  plan, days: dias, exercises, overrides, weeks,
  exerciseNames, snapshot: null,
})
writeFileSync(join(outDir, 'treino.pdf'), Buffer.from(await workoutBlob.arrayBuffer()))

const assessment = {
  id: 'a1', org_id: 'o1', subject_id: 's1', evaluator_id: 'u1',
  assessed_at: '2026-06-01', protocol_id: 'jp7',
  weight_kg: 80, height_cm: 178,
  notes: 'Aluno relatou desconforto lombar leve. Observar amplitude.',
  medications: null,
  results: {
    bodyFatPct: 18, bodyDensity: 1.05, fatMassKg: 14.4, leanMassKg: 65.6,
    engineVersion: '1.1.0', inputs: { sex: 'M' },
    conversions: { siri: 18, brozek: 17.5 },
    warnings: [
      { code: 'idade-fora-da-faixa', message: 'Este protocolo foi validado em pessoas de 18 a 61 anos. Com 70 anos a estimativa e uma extrapolacao e deve ser lida com reserva.' },
    ],
  },
  engine_version: '1.1.0', created_at: '2026-06-01', updated_at: '2026-06-01',
}

const assessmentBlob = await generateAssessmentPdf({
  orgName: 'Estudio Corpo & Movimento',
  subjectName: 'Maria Aparecida do Nascimento Goncalves Silva',
  evaluatorName: 'Prof. Joao Carlos de Almeida (CREF 000000-G/SP)',
  assessment,
  skinfolds: [], circumferences: [],
  // A serie mistura protocolos DE PROPOSITO: e o caminho que imprime o aviso de
  // comparabilidade, e a variacao de %gordura (22 -> 18) e o caso que tem de
  // sair em pontos percentuais, nao em '%'.
  history: [
    { date: '01/01', protocolId: 'jp7', weightKg: 84, bmi: 26.5, bodyFatPct: 22, leanMassKg: 65.5, fatMassKg: 18.5 },
    { date: '01/03', protocolId: 'jp7', weightKg: 82, bmi: 25.9, bodyFatPct: 20, leanMassKg: 65.6, fatMassKg: 16.4 },
    { date: '01/06', protocolId: 'jp3', weightKg: 80, bmi: 25.3, bodyFatPct: 18, leanMassKg: 65.6, fatMassKg: 14.4 },
  ],
  circumferenceHistory: [
    { assessedAt: '2026-01-01', site: 'waist', valueCm: 92 },
    { assessedAt: '2026-06-01', site: 'waist', valueCm: 86 },
  ],
})
writeFileSync(join(outDir, 'avaliacao.pdf'), Buffer.from(await assessmentBlob.arrayBuffer()))

console.log('ok:', outDir)
