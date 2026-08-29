import { describe, it, expect } from 'vitest'
import { planShareText, whatsappUrl } from './share'
import type { WorkoutDayRow, WorkoutExerciseRow, WorkoutPlanRow } from './api'

const plan = {
  id: 'p1', org_id: 'o1', subject_id: 's1', evaluator_id: 'e1',
  name: 'Hipertrofia AB', goal: 'hypertrophy', weeks: 4, starts_on: null, notes: null,
  status: 'active', source_assessment_id: null, source_posture_session_id: null,
  volume: null, volume_engine_version: null, created_at: 'x', updated_at: 'x',
} as WorkoutPlanRow

const days: WorkoutDayRow[] = [
  { id: 'dA', org_id: 'o1', plan_id: 'p1', label: 'A', name: 'Peito', position: 0, created_at: 'x' },
  { id: 'dB', org_id: 'o1', plan_id: 'p1', label: 'B', name: null, position: 1, created_at: 'x' },
]
const exercises: WorkoutExerciseRow[] = [
  { id: 'x2', org_id: 'o1', day_id: 'dA', exercise_id: 'e-sup', position: 1, sets: 3, reps: '10', rir: null, rest_seconds: 60, tempo: null, notes: null, group_key: null, group_kind: null, technique: null, created_at: 'x' },
  { id: 'x1', org_id: 'o1', day_id: 'dA', exercise_id: 'e-cru', position: 0, sets: 4, reps: '8-12', rir: 2, rest_seconds: 90, tempo: null, notes: null, group_key: null, group_kind: null, technique: null, created_at: 'x' },
  { id: 'x3', org_id: 'o1', day_id: 'dB', exercise_id: 'e-agacho', position: 0, sets: 5, reps: '5', rir: 1, rest_seconds: 120, tempo: null, notes: null, group_key: null, group_kind: null, technique: null, created_at: 'x' },
]
const names = { 'e-sup': 'Supino', 'e-cru': 'Crucifixo', 'e-agacho': 'Agachamento' }

describe('planShareText', () => {
  const text = planShareText({ orgName: 'Studio X', plan, days, exercises, exerciseNames: names })

  it('inclui org, nome do plano e objetivo', () => {
    expect(text).toContain('Studio X')
    expect(text).toContain('*Hipertrofia AB*')
    expect(text).toContain('Hipertrofia · 4 semanas')
  })

  it('ordena dias e exercícios por posição e formata séries×reps', () => {
    const idxCru = text.indexOf('Crucifixo')
    const idxSup = text.indexOf('Supino')
    expect(idxCru).toBeLessThan(idxSup) // position 0 antes do 1
    expect(text).toContain('1. Crucifixo — 4×8-12 (RIR 2)')
    expect(text).toContain('2. Supino — 3×10') // sem RIR
    expect(text).toContain('*Treino A — Peito*')
    expect(text).toContain('*Treino B*') // dia sem nome
  })

  it('termina com a atribuição do Avalix', () => {
    expect(text.trimEnd().endsWith('Plano feito no Avalix.')).toBe(true)
  })

  it('imprime descanso e cadência, como o PDF', () => {
    expect(text).toContain('1. Crucifixo — 4×8-12 (RIR 2) · 90s')
    expect(text).toContain('2. Supino — 3×10 · 60s')
  })
})

// Regressão: o texto do WhatsApp e o PDF são os dois documentos oficiais do
// mesmo plano e diziam coisas diferentes. Sem overrides nem weekly_schedule, o
// aluno recebia a semana 1 como se valesse para o mesociclo inteiro.
describe('planShareText não pode contradizer o PDF', () => {
  const planComSequencia = { ...plan, weeks: 3, weekly_schedule: ['A', 'B', 'A'] } as WorkoutPlanRow
  const overrides = [
    {
      id: 'o1', org_id: 'o1', plan_id: 'p1', workout_exercise_id: 'x1',
      week_number: 2, sets: 5, reps: '6-8', rir: 1, rest_seconds: 120,
      is_skipped: false, notes: null, created_at: 'x',
    },
    {
      id: 'o2', org_id: 'o1', plan_id: 'p1', workout_exercise_id: 'x3',
      week_number: 3, sets: null, reps: null, rir: null, rest_seconds: null,
      is_skipped: true, notes: null, created_at: 'x',
    },
  ] as unknown as Parameters<typeof planShareText>[0]['overrides']

  const texto = planShareText({
    orgName: 'Studio X',
    plan: planComSequencia,
    days,
    exercises,
    exerciseNames: names,
    overrides,
  })

  it('mostra a sequência semanal (A · B · A), que antes sumia', () => {
    expect(texto).toContain('Sequência da semana: A · B · A')
  })

  it('lista os ajustes por semana com o nome do exercício', () => {
    expect(texto).toContain('*Ajustes por semana*')
    expect(texto).toContain('*Semana 2*')
    expect(texto).toContain('- Crucifixo: 5 séries · 6-8 reps · RIR 1 · 120s')
  })

  it('deixa claro quando o exercício sai da semana', () => {
    expect(texto).toContain('*Semana 3*')
    expect(texto).toContain('- Agachamento: não fazer nesta semana')
  })

  it('sem overrides, não inventa a seção', () => {
    const semOverrides = planShareText({
      orgName: 'Studio X', plan, days, exercises, exerciseNames: names,
    })
    expect(semOverrides).not.toContain('Ajustes por semana')
  })
})

// O WhatsApp é o canal que mais gente usa para receber o treino. Se ele listar
// os exercícios de uma super-série soltos, o aluno faz todas as séries de um e
// depois todas do outro — que é outro treino, com outro estímulo.
describe('planShareText com bloco e sem faixa de reps', () => {
  const comBloco: WorkoutExerciseRow[] = [
    { ...exercises[1], group_key: 'g1', group_kind: 'superset' },
    { ...exercises[0], group_key: 'g1', group_kind: 'superset', technique: 'drop_set' },
    { ...exercises[2], reps: null },
  ]
  const texto = planShareText({
    orgName: 'Studio X',
    plan,
    days,
    exercises: comBloco,
    exerciseNames: names,
  })

  it('anuncia o bloco e como executá-lo', () => {
    expect(texto).toContain('_Super-série: 2 exercícios em sequência, sem descanso entre eles_')
  })

  it('recua os membros do bloco e mantém a numeração contínua', () => {
    expect(texto).toContain('   1. Crucifixo — 4×8-12 (RIR 2) · 90s')
    expect(texto).toContain('   2. Supino — 3×10 · 60s · Drop-set')
  })

  it('sem faixa de reps sai como séries, e não como "5×" pendurado', () => {
    expect(texto).toContain('1. Agachamento — 5 séries (RIR 1) · 120s')
    expect(texto).not.toContain('Agachamento — 5×')
  })
})

describe('whatsappUrl', () => {
  it('sem número quando o telefone não é E.164 completo', () => {
    expect(whatsappUrl('oi', '(11) 99999-9999')).toBe('https://wa.me/?text=oi')
    expect(whatsappUrl('oi', null)).toBe('https://wa.me/?text=oi')
  })
  it('usa o número quando tem código do país', () => {
    expect(whatsappUrl('oi', '+55 11 99999-9999')).toBe('https://wa.me/5511999999999?text=oi')
  })
  it('codifica o texto', () => {
    expect(whatsappUrl('a b&c')).toContain('text=a%20b%26c')
  })
})
