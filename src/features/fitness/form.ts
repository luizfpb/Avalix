// Campos do formulário de testes físicos (texto, como a pessoa digitou) e a
// conversão para as medidas gravadas. Teste em branco fica de fora; teste
// preenchido pela metade é erro daquele teste, sem apagar nada.

import type { Sex } from '../assessment/protocols'
import { FAIXAS, inRange, type FitnessMeasures, type FitnessTestKey, type Range } from './measures'

export type FitnessFields = {
  cooperDistance: string
  rockportMin: string
  rockportSec: string
  rockportHr: string
  rockportWeight: string
  queensHr: string
  pushUpsReps: string
  pushUpsKnees: boolean
  sitUpsReps: string
  reachBest: string
  reachFeet: 23 | 26
  gripRight: string
  gripLeft: string
}

export function emptyFields(sex: Sex, weightKg: number | null): FitnessFields {
  return {
    cooperDistance: '',
    rockportMin: '',
    rockportSec: '',
    rockportHr: '',
    rockportWeight: weightKg != null ? String(weightKg) : '',
    queensHr: '',
    pushUpsReps: '',
    // a tabela do CSEP é com os joelhos apoiados para mulheres
    pushUpsKnees: sex === 'F',
    sitUpsReps: '',
    reachBest: '',
    reachFeet: 26,
    gripRight: '',
    gripLeft: '',
  }
}

const str = (v: number | undefined) => (v == null ? '' : String(v))

export function fieldsFromMeasures(m: FitnessMeasures, sex: Sex, weightKg: number | null): FitnessFields {
  const f = emptyFields(sex, weightKg)
  if (m.cooper) f.cooperDistance = str(m.cooper.distance_m)
  if (m.rockport) {
    f.rockportMin = String(Math.floor(m.rockport.time_s / 60))
    f.rockportSec = String(Math.round(m.rockport.time_s % 60))
    f.rockportHr = str(m.rockport.heart_rate_bpm)
    f.rockportWeight = str(m.rockport.weight_kg)
  }
  if (m.queens) f.queensHr = str(m.queens.heart_rate_bpm)
  if (m.push_ups) {
    f.pushUpsReps = str(m.push_ups.reps)
    f.pushUpsKnees = m.push_ups.knees
  }
  if (m.sit_ups) f.sitUpsReps = str(m.sit_ups.reps)
  if (m.sit_and_reach) {
    f.reachBest = str(m.sit_and_reach.best_cm)
    f.reachFeet = m.sit_and_reach.feet_mark_cm
  }
  if (m.grip) {
    f.gripRight = str(m.grip.right_kg)
    f.gripLeft = str(m.grip.left_kg)
  }
  return f
}

export type FormErrors = Partial<Record<FitnessTestKey, string>>

const blank = (s: string) => s.trim() === ''
const fmtRange = (r: Range, unit: string) =>
  `${r.min.toLocaleString('pt-BR')} e ${r.max.toLocaleString('pt-BR')} ${unit}`

function parseNum(s: string): number | null {
  if (blank(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

function isInt(n: number) {
  return Number.isInteger(n)
}

export function buildMeasures(f: FitnessFields): { measures: FitnessMeasures; errors: FormErrors } {
  const measures: FitnessMeasures = {}
  const errors: FormErrors = {}

  // Cooper
  const distance = parseNum(f.cooperDistance)
  if (distance != null) {
    if (!inRange(distance, FAIXAS.cooper_distance_m)) {
      errors.cooper = `Distância entre ${fmtRange(FAIXAS.cooper_distance_m, 'm')}.`
    } else measures.cooper = { distance_m: distance }
  }

  // Rockport: tempo, FC e peso juntos
  const rockportFilled = [f.rockportMin, f.rockportSec, f.rockportHr].some((s) => !blank(s))
  if (rockportFilled) {
    const min = parseNum(f.rockportMin) ?? 0
    const sec = parseNum(f.rockportSec) ?? 0
    const hr = parseNum(f.rockportHr)
    const weight = parseNum(f.rockportWeight)
    const time = min * 60 + sec
    if (!isInt(min) || !isInt(sec) || min < 0 || sec < 0 || sec >= 60) {
      errors.rockport = 'Tempo em minutos e segundos (0 a 59).'
    } else if (!inRange(time, FAIXAS.rockport_time_s)) {
      errors.rockport = 'Tempo entre 6 e 60 minutos.'
    } else if (hr == null || !inRange(hr, FAIXAS.heart_rate_bpm)) {
      errors.rockport = `Frequência cardíaca entre ${fmtRange(FAIXAS.heart_rate_bpm, 'bpm')}.`
    } else if (weight == null || !inRange(weight, FAIXAS.rockport_weight_kg)) {
      errors.rockport = `Peso entre ${fmtRange(FAIXAS.rockport_weight_kg, 'kg')}: a equação usa o peso.`
    } else measures.rockport = { time_s: time, heart_rate_bpm: hr, weight_kg: weight }
  }

  // Queens
  const qHr = parseNum(f.queensHr)
  if (qHr != null) {
    if (!inRange(qHr, FAIXAS.heart_rate_bpm)) {
      errors.queens = `Frequência cardíaca entre ${fmtRange(FAIXAS.heart_rate_bpm, 'bpm')}.`
    } else measures.queens = { heart_rate_bpm: qHr }
  }

  // Flexão
  const push = parseNum(f.pushUpsReps)
  if (push != null) {
    if (!isInt(push) || !inRange(push, FAIXAS.push_ups_reps)) {
      errors.push_ups = 'Número inteiro de repetições.'
    } else measures.push_ups = { reps: push, knees: f.pushUpsKnees }
  }

  // Abdominal
  const sit = parseNum(f.sitUpsReps)
  if (sit != null) {
    if (!isInt(sit) || !inRange(sit, FAIXAS.sit_ups_reps)) {
      errors.sit_ups = 'Número inteiro de repetições.'
    } else measures.sit_ups = { reps: sit }
  }

  // Sentar e alcançar
  const reach = parseNum(f.reachBest)
  if (reach != null) {
    if (!inRange(reach, FAIXAS.sit_and_reach_cm)) {
      errors.sit_and_reach = `Alcance entre ${fmtRange(FAIXAS.sit_and_reach_cm, 'cm')}, lido na régua do banco.`
    } else measures.sit_and_reach = { best_cm: reach, feet_mark_cm: f.reachFeet }
  }

  // Preensão: uma mão basta
  const right = parseNum(f.gripRight)
  const left = parseNum(f.gripLeft)
  if (right != null || left != null) {
    const bad = [right, left].some((v) => v != null && !inRange(v, FAIXAS.grip_kg))
    if (bad) errors.grip = `Cada mão entre ${fmtRange(FAIXAS.grip_kg, 'kg')}.`
    else {
      measures.grip = {
        ...(right != null ? { right_kg: right } : {}),
        ...(left != null ? { left_kg: left } : {}),
      }
    }
  }

  return { measures, errors }
}
