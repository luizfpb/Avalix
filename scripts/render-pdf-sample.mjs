// Gera os três PDFs de PRODUÇÃO para inspeção visual, sem rede ou banco.
// Dados fictícios: identidade e medidas da proposta Clareza, completadas com
// registros de desenvolvimento. A composição é calculada pelo motor do app,
// portanto não repete os números meramente ilustrativos do estudo visual.
//
//   npx vite-node scripts/render-pdf-sample.mjs <pasta-de-saida>
//   pdftoppm -png -r 90 saida/treino.pdf saida/treino
//
// Além dos documentos usuais, gera versões de estresse com histórico extenso,
// grupos grandes, textos livres longos, protocolos mistos e dados ausentes.
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildAssessmentResult } from '../src/features/assessment/result.ts'
import { computeBmi } from '../src/features/assessment/bmi.ts'
import { CIRCUMFERENCE_CATALOG } from '../src/features/assessment/sites.ts'

const outDir = process.argv[2] ?? 'pdf-sample'
mkdirSync(outDir, { recursive: true })

// Mesmas fontes do navegador, resolvidas no disco para render offline.
const { registerReportFontsFrom } = await import('../src/features/reports/pdfFonts.ts')
registerReportFontsFrom(join(process.cwd(), 'public/fonts'))
const { generateWorkoutPdf } = await import('../src/features/reports/workoutPdf.tsx')
const { generateAssessmentPdf, generateEvolutionPdf } = await import('../src/features/reports/assessmentPdf.tsx')

const identity = {
  orgName: 'Estúdio Corpo & Movimento',
  subjectName: 'Mariana Costa',
  evaluatorName: 'Camila Andrade · CREF 000000-G/SP',
}
const longIdentity = {
  orgName: 'Estúdio Corpo & Movimento — Centro Integrado de Avaliação Física e Acompanhamento do Treinamento',
  subjectName: 'Mariana Aparecida Costa de Albuquerque Nascimento Gonçalves da Silva',
  evaluatorName: 'Camila Maria Andrade de Albuquerque · CREF 000000-G/SP',
}
const round = value => Math.round(value * 10) / 10
const recordedAt = date => `${date}T10:00:00Z`
const shortDate = date => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
const longText = (sentence, length) => Array.from(
  { length: Math.ceil(length / (sentence.length + 1)) }, () => sentence,
).join(' ').slice(0, length)
const skinfoldValues = {
  chest: 12, midaxillary: 16, triceps: 21, subscapular: 19,
  abdomen: 25, suprailiac: 21, thigh: 29,
}
const circumferenceValues = {
  neck: 32, shoulder: 103, chest: 89, waist: 74, abdomen: 81.5, hip: 98,
  arm_relaxed_r: 29, arm_relaxed_l: 28.8, arm_flexed_r: 30.5, arm_flexed_l: 30.2,
  forearm_r: 24, forearm_l: 23.8, wrist_r: 15.5, wrist_l: 15.3,
  thigh_proximal_r: 59, thigh_proximal_l: 58.5, thigh_mid_r: 55.5, thigh_mid_l: 55,
  thigh_distal_r: 42, thigh_distal_l: 41.8, calf_r: 35.5, calf_l: 35.2,
}
const initialCircumferences = {
  ...circumferenceValues, waist: 79, abdomen: 86, hip: 101,
  arm_relaxed_r: 29.5, arm_relaxed_l: 29, thigh_mid_r: 57, thigh_mid_l: 56.5,
}
const normalDates = ['2026-06-05', '2026-07-03', '2026-08-07', '2026-09-04']

function assessmentData(stress = false) {
  const dates = stress
    ? Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2024, 3 + i, 4)).toISOString().slice(0, 10))
    : normalDates
  const circumferenceHistory = []
  const records = dates.map((date, index) => {
    const progress = index / (dates.length - 1)
    const id = `sample-assessment-${stress ? 'long-' : ''}${index}`
    const weightKg = stress ? round(68 - 3.2 * progress) : [68, 67, 65.9, 64.8][index]
    const skinfoldsMm = Object.fromEntries(Object.entries(skinfoldValues)
      .map(([site, value]) => [site, round(value * (1.16 - 0.16 * progress))]))
    const circumferencesCm = Object.fromEntries(Object.entries(circumferenceValues)
      .map(([site, value]) => [site, round(initialCircumferences[site] + (value - initialCircumferences[site]) * progress)]))
    for (const [site, valueCm] of Object.entries(circumferencesCm)) {
      circumferenceHistory.push({ assessmentId: id, assessedAt: date, assessmentCreatedAt: recordedAt(date), site, valueCm })
    }
    // Um registro sem composição e mudanças de método exercitam lacunas e
    // comparabilidade; o último usa JP7 aos 70 anos para mostrar a ressalva real.
    const protocolId = stress && index === 9 ? null : stress && index % 6 === 2 ? 'usNavy' : stress && index % 6 === 4 ? 'jpWard' : 'jp7'
    const result = protocolId ? buildAssessmentResult(protocolId, {
      sex: 'F', ageYears: stress ? 70 : 32, heightCm: 168, skinfoldsMm, circumferencesCm,
    }, weightKg) : null
    return {
      id, org_id: 'sample-org', subject_id: 'sample-subject', evaluator_id: 'sample-evaluator',
      assessed_at: date, protocol_id: protocolId, weight_kg: weightKg, height_cm: 168,
      notes: stress
        ? longText('Registro fictício de desenvolvimento: acompanhar a adaptação à rotina e registrar as condições da próxima coleta. Acentos e símbolos: RIR ≤ 2, variação ≥ 0 e evolução → acompanhamento.', 12000)
        : 'Dados fictícios para validação visual. Relata boa adaptação à rotina. Manter o acompanhamento das medidas e reavaliar ao final do mesociclo.',
      medications: stress
        ? longText('Campo fictício para conferir a reprodução integral do relato sobre medicamentos: nome, horário e observação registrados pelo profissional, sem recomendação de uso ou ajuste de dose.', 1400)
        : null,
      results: result, engine_version: result?.engineVersion ?? null,
      created_at: recordedAt(date), updated_at: recordedAt(date),
    }
  })
  const assessment = records.at(-1)
  const currentSkinfolds = assessment.results.inputs.skinfoldsMm
  const skinfolds = Object.entries(currentSkinfolds).map(([site, value], index) => ({
    id: `sample-fold-${index}`, assessment_id: assessment.id, org_id: 'sample-org', site,
    reading_1: round(value - 1), reading_2: value, reading_3: round(value + 1), notes: null,
    created_at: assessment.created_at,
  }))
  const circumferences = CIRCUMFERENCE_CATALOG.flatMap(group => group.items).map(({ key }, index) => ({
    id: `sample-circ-${index}`, assessment_id: assessment.id, org_id: 'sample-org', site: key,
    value_cm: circumferenceValues[key], is_custom: false, created_at: assessment.created_at,
  }))
  if (stress) {
    circumferences.push({
      id: 'sample-circ-custom', assessment_id: assessment.id, org_id: 'sample-org',
      site: 'Medida personalizada de acompanhamento — referência anatômica descrita pelo profissional para a próxima coleta',
      value_cm: 42.8, is_custom: true, created_at: assessment.created_at,
    })
  }
  const history = records.map(row => ({
    date: shortDate(row.assessed_at), protocolId: row.protocol_id, weightKg: row.weight_kg,
    bmi: computeBmi(row.weight_kg, row.height_cm), bodyFatPct: row.results?.bodyFatPct ?? null,
    leanMassKg: row.results?.leanMassKg ?? null, fatMassKg: row.results?.fatMassKg ?? null,
  }))
  return { ...(stress ? longIdentity : identity), assessment, skinfolds, circumferences, history, circumferenceHistory }
}

const exerciseDefinitions = [
  [
    ['Supino reto com halteres', '8–12', 2, 90, 'Manter a amplitude confortável.'],
    ['Remada baixa na polia', '10–12', 2, 60, null],
    ['Elevação lateral', '12–15', 2, 60, null],
    ['Tríceps na corda', '10–12', 1, 60, 'Drop-set na última série: reduzir a carga uma vez.'],
    ['Prancha frontal', null, null, 45, 'Encerrar ao perder a posição.'],
  ],
  [
    ['Agachamento livre', '8–10', 2, 120, 'Manter a execução estável durante toda a série.'],
    ['Leg press 45°', '10–12', 2, 90, null],
    ['Cadeira extensora', '12–15', 2, 60, null],
    ['Mesa flexora', '10–12', 2, 60, null],
    ['Panturrilha em pé', '12–15', 1, 60, 'Pausar brevemente no ponto de maior contração.'],
  ],
  [
    ['Puxada frontal na polia', '8–12', 2, 90, null],
    ['Desenvolvimento com halteres', '8–12', 2, 90, null],
    ['Rosca alternada com halteres', '10–12', 2, 60, null],
    ['Ponte de quadril', '12–15', 2, 60, null],
    ['Abdominal na polia', '12–15', 2, 60, null],
  ],
]

function workoutData(stress = false, assessment) {
  const planId = stress ? 'sample-plan-long' : 'sample-plan'
  const createdAt = recordedAt('2026-09-04')
  const plan = {
    id: planId, org_id: 'sample-org', subject_id: 'sample-subject', evaluator_id: 'sample-evaluator',
    name: stress ? 'Hipertrofia e desenvolvimento de capacidades físicas — mesociclo de acumulação com organização individual das sessões' : 'Hipertrofia · Acumulação',
    goal: 'hypertrophy', weeks: 8, starts_on: '2026-09-07',
    notes: stress
      ? longText('Prescrição fictícia exclusiva para validar a paginação. Registrar carga e repetições realizadas; comunicar dúvidas ao profissional. Conferir os ajustes da semana antes de iniciar e respeitar a sequência dos exercícios agrupados.', 12000)
      : 'Dados fictícios para validação visual. RIR indica quantas repetições ainda caberiam na série. Cadência 2–0–2: 2 s na descida, sem pausa, 2 s na subida. Registrar a execução e consultar o profissional em caso de dúvida.',
    status: 'active', source_assessment_id: assessment.id, source_posture_session_id: null,
    volume: null, volume_engine_version: null, weekly_schedule: ['A', 'B', 'A', 'C'],
    created_at: createdAt, updated_at: createdAt,
  }
  const days = ['A', 'B', 'C'].map((label, index) => ({
    id: `${planId}-day-${label}`, plan_id: planId, org_id: 'sample-org', label,
    name: stress ? `${['Membros superiores', 'Membros inferiores', 'Complementar'][index]} — controle de execução e organização dos blocos durante o mesociclo`
      : ['Membros superiores', 'Membros inferiores', 'Complementar'][index],
    position: index, created_at: createdAt,
  }))
  const exerciseNames = {}
  const exercises = days.flatMap((day, dayIndex) => Array.from({ length: stress ? [30, 16, 5][dayIndex] : 5 }, (_, index) => {
    const [name, reps, rir, rest, notes] = exerciseDefinitions[dayIndex][index % 5]
    const id = `${day.id}-exercise-${index}`
    const exerciseId = `${id}-catalog`
    exerciseNames[exerciseId] = stress
      ? `${name} — variação ${index + 1} com ajuste individual de amplitude e posicionamento`
      : name
    const grouped = stress ? dayIndex < 2 && index < 16 : dayIndex === 0 && (index === 1 || index === 2)
    return {
      id, day_id: day.id, org_id: 'sample-org', exercise_id: exerciseId, position: index,
      sets: 3, reps, rir, rest_seconds: stress && index === 29 ? 0 : rest, tempo: reps ? '2–0–2' : null,
      notes: stress
        ? longText(`Anotação fictícia do exercício ${index + 1}: manter RIR ≤ 2 e execução estável; registrar a carga utilizada para discussão com o profissional.`, index === 20 ? 1800 : 160)
        : notes,
      technique: dayIndex === 0 && index === 3 ? 'drop_set' : stress && index === 25 ? 'rest_pause' : null,
      group_key: grouped ? `${day.id}-group` : null,
      group_kind: grouped ? (dayIndex === 1 ? 'circuit' : 'superset') : null,
      created_at: createdAt,
    }
  }))
  const weeks = Array.from({ length: 8 }, (_, index) => ({
    id: `${planId}-week-${index + 1}`, plan_id: planId, org_id: 'sample-org', week_number: index + 1,
    label: index < 2 ? 'Adaptação' : index < 5 ? 'Acumulação' : index < 7 ? 'Intensificação' : 'Recuperação',
    is_deload: index === 7,
    notes: stress ? `Observação fictícia da semana ${index + 1}: conferir os ajustes abaixo e registrar a resposta às sessões.` : null,
    created_at: createdAt,
  }))
  const overrides = weeks.flatMap(week => {
    if (!stress && week.week_number < 3) return []
    const changed = stress ? exercises.slice(0, week.week_number === 6 ? 16 : 3) : [exercises[0]]
    return changed.map((exercise, index) => ({
      id: `${week.id}-override-${index}`, org_id: 'sample-org', plan_id: planId,
      workout_exercise_id: exercise.id, week_number: week.week_number,
      sets: week.week_number === 8 ? 2 : 4,
      reps: week.week_number === 6 || week.week_number === 7 ? '6–8' : null,
      rir: week.week_number === 6 || week.week_number === 7 ? 1 : null,
      rest_seconds: week.week_number === 6 || week.week_number === 7 ? 120 : null,
      is_skipped: stress && week.week_number === 8 && index === 2,
      notes: stress ? `Alteração fictícia ${index + 1}: conferir a execução antes de progredir; registrar a resposta da sessão na semana ${week.week_number}.` : null,
      created_at: createdAt,
    }))
  })
  return {
    ...(stress ? longIdentity : identity), plan, days, exercises, weeks, overrides, exerciseNames,
    source: { assessmentDate: assessment.assessed_at, bodyFatPct: assessment.results.bodyFatPct },
  }
}

async function save(name, generate, data) {
  const blob = await generate(data)
  writeFileSync(join(outDir, name), Buffer.from(await blob.arrayBuffer()))
  console.log(`ok: ${name} (${blob.size} bytes)`)
}

for (const stress of [false, true]) {
  const data = assessmentData(stress)
  const suffix = stress ? '-longo' : ''
  await save(`avaliacao${suffix}.pdf`, generateAssessmentPdf, data)
  await save(`evolucao${suffix}.pdf`, generateEvolutionPdf, {
    ...(stress ? longIdentity : identity), history: data.history, circumferenceHistory: data.circumferenceHistory,
  })
  await save(`treino${suffix}.pdf`, generateWorkoutPdf, workoutData(stress, data.assessment))
}

const minimal = assessmentData()
await save('avaliacao-minima.pdf', generateAssessmentPdf, {
  ...identity, evaluatorName: null,
  assessment: {
    ...minimal.assessment, protocol_id: null, results: null, engine_version: null,
    medications: null, notes: null,
  },
  skinfolds: [], circumferences: [], history: [], circumferenceHistory: [],
})
console.log(`Amostras ficticias salvas em: ${outDir}`)
