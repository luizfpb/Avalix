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
  { id: 'x2', org_id: 'o1', day_id: 'dA', exercise_id: 'e-sup', position: 1, sets: 3, reps: '10', rir: null, rest_seconds: 60, tempo: null, notes: null, created_at: 'x' },
  { id: 'x1', org_id: 'o1', day_id: 'dA', exercise_id: 'e-cru', position: 0, sets: 4, reps: '8-12', rir: 2, rest_seconds: 90, tempo: null, notes: null, created_at: 'x' },
  { id: 'x3', org_id: 'o1', day_id: 'dB', exercise_id: 'e-agacho', position: 0, sets: 5, reps: '5', rir: 1, rest_seconds: 120, tempo: null, notes: null, created_at: 'x' },
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
