// Resultados dos testes físicos a partir das medidas, do sexo e da idade na
// data do teste. Calculado na leitura (não há snapshot no banco): mudar uma
// tabela aqui muda a classificação das sessões antigas também, e a medida
// gravada continua a mesma.

import type { Sex } from '../assessment/protocols'
import type { FitnessMeasures, FitnessTestKey } from './measures'
import {
  rateGrip,
  ratePushUps,
  rateSitAndReach,
  rateVo2,
  pushUpsProtocolMatches,
  sitAndReachOnCsepScale,
  type Rating,
} from './norms'

// Cooper KH. A means of assessing maximal oxygen intake. JAMA. 1968;203:201-4.
// Homens de 17 a 52 anos.
export function cooperVo2(distanceM: number): number {
  return (distanceM - 504.9) / 44.73
}

// Kline GM et al. Estimation of VO2max from a one-mile track walk, gender,
// age, and body weight. Med Sci Sports Exerc. 1987;19(3):253-9.
// Homens e mulheres de 30 a 69 anos. Peso em libras, tempo em minutos, FC ao
// cruzar a chegada.
export function rockportVo2(sex: Sex, ageYears: number, weightKg: number, timeS: number, hrBpm: number): number {
  const weightLb = weightKg * 2.20462
  const minutes = timeS / 60
  return (
    132.853 -
    0.0769 * weightLb -
    0.3877 * ageYears +
    6.315 * (sex === 'M' ? 1 : 0) -
    3.2649 * minutes -
    0.1565 * hrBpm
  )
}

// McArdle WD et al. Reliability and interrelationships between maximal oxygen
// intake, physical work capacity and step-test scores in college women.
// Med Sci Sports. 1972;4(4):182-6. Banco de 41,3 cm, 3 minutos; FC contada de
// 5 a 20 s depois de parar, multiplicada por 4. Universitários.
export function queensVo2(sex: Sex, hrBpm: number): number {
  return sex === 'M' ? 111.33 - 0.42 * hrBpm : 65.81 - 0.1847 * hrBpm
}

export type FitnessResult = {
  key: FitnessTestKey
  // número principal da linha (VO2máx nos cardiorrespiratórios)
  value: number
  unit: string
  // o que o número é: "VO2máx estimado", "repetições"...
  valueLabel: string
  // medidas que o professor digitou, já em texto
  detail: string[]
  rating: Rating | null
  // por que não há classificação, ou ressalva do protocolo
  notes: string[]
}

const fmt = (v: number, digits = 1) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds)
  return `${Math.floor(s / 60)}min${String(s % 60).padStart(2, '0')}s`
}

function vo2Notes(vo2: number, rating: Rating | null): string[] {
  const notes: string[] = []
  if (vo2 < 10 || vo2 > 90) notes.push('Resultado incomum: confira as medidas.')
  if (!rating && vo2 >= 10 && vo2 <= 90) notes.push('Sem classificação para esta idade (tabela de 15 a 74 anos).')
  return notes
}

export function computeFitness(m: FitnessMeasures, sex: Sex, ageYears: number): FitnessResult[] {
  const out: FitnessResult[] = []

  if (m.cooper) {
    const vo2 = cooperVo2(m.cooper.distance_m)
    const rating = rateVo2(vo2, sex, ageYears)
    const notes = vo2Notes(vo2, rating)
    if (sex === 'F' || ageYears < 17 || ageYears > 52) {
      notes.push('Equação desenvolvida com homens de 17 a 52 anos.')
    }
    out.push({
      key: 'cooper',
      value: vo2,
      unit: 'ml/kg/min',
      valueLabel: 'VO2máx estimado',
      detail: [`${fmt(m.cooper.distance_m, 0)} m em 12 minutos`],
      rating,
      notes,
    })
  }

  if (m.rockport) {
    const r = m.rockport
    const vo2 = rockportVo2(sex, ageYears, r.weight_kg, r.time_s, r.heart_rate_bpm)
    const rating = rateVo2(vo2, sex, ageYears)
    const notes = vo2Notes(vo2, rating)
    if (ageYears < 30 || ageYears > 69) notes.push('Equação desenvolvida com adultos de 30 a 69 anos.')
    out.push({
      key: 'rockport',
      value: vo2,
      unit: 'ml/kg/min',
      valueLabel: 'VO2máx estimado',
      detail: [
        `1 milha em ${formatDuration(r.time_s)}`,
        `FC final ${fmt(r.heart_rate_bpm, 0)} bpm`,
        `peso ${fmt(r.weight_kg)} kg`,
      ],
      rating,
      notes,
    })
  }

  if (m.queens) {
    const vo2 = queensVo2(sex, m.queens.heart_rate_bpm)
    const rating = rateVo2(vo2, sex, ageYears)
    const notes = vo2Notes(vo2, rating)
    notes.push('Equação desenvolvida com universitários.')
    out.push({
      key: 'queens',
      value: vo2,
      unit: 'ml/kg/min',
      valueLabel: 'VO2máx estimado',
      detail: [`FC de recuperação ${fmt(m.queens.heart_rate_bpm, 0)} bpm`],
      rating,
      notes,
    })
  }

  if (m.push_ups) {
    const p = m.push_ups
    const rating = ratePushUps(p.reps, p.knees, sex, ageYears)
    const notes: string[] = []
    if (!pushUpsProtocolMatches(sex, p.knees)) {
      notes.push(
        sex === 'F'
          ? 'Sem classificação: a tabela das mulheres é com os joelhos apoiados.'
          : 'Sem classificação: a tabela dos homens é na posição completa.'
      )
    } else if (!rating) {
      notes.push('Sem classificação para esta idade (tabela de 15 a 69 anos).')
    }
    out.push({
      key: 'push_ups',
      value: p.reps,
      unit: 'rep.',
      valueLabel: 'repetições',
      detail: [p.knees ? 'joelhos apoiados' : 'posição completa'],
      rating,
      notes,
    })
  }

  if (m.sit_ups) {
    out.push({
      key: 'sit_ups',
      value: m.sit_ups.reps,
      unit: 'rep.',
      valueLabel: 'repetições em 1 minuto',
      detail: [],
      rating: null,
      notes: ['Registrado para acompanhar a evolução, sem tabela de classificação.'],
    })
  }

  if (m.sit_and_reach) {
    const s = m.sit_and_reach
    const rating = rateSitAndReach(s.best_cm, s.feet_mark_cm, sex, ageYears)
    const notes: string[] = []
    if (!rating) notes.push('Sem classificação para esta idade (tabela de 20 a 69 anos).')
    const detail = [`pés na marca de ${s.feet_mark_cm} cm`]
    if (s.feet_mark_cm === 23) {
      detail.push(`${fmt(sitAndReachOnCsepScale(s.best_cm, 23))} cm na escala da tabela (pés no 26)`)
    }
    out.push({
      key: 'sit_and_reach',
      value: s.best_cm,
      unit: 'cm',
      valueLabel: 'melhor alcance',
      detail,
      rating,
      notes,
    })
  }

  if (m.grip) {
    const g = m.grip
    const hands = [g.right_kg, g.left_kg].filter((v): v is number => v != null)
    const best = Math.max(...hands)
    const detail: string[] = []
    if (g.right_kg != null) detail.push(`direita ${fmt(g.right_kg)} kg`)
    if (g.left_kg != null) detail.push(`esquerda ${fmt(g.left_kg)} kg`)
    if (g.right_kg != null && g.left_kg != null) {
      detail.push(`diferença ${fmt(Math.abs(g.right_kg - g.left_kg))} kg`)
    }
    const rating = rateGrip(best, sex, ageYears)
    out.push({
      key: 'grip',
      value: best,
      unit: 'kg',
      valueLabel: 'maior medida',
      detail,
      rating,
      notes: rating ? [] : ['Sem ponto de corte abaixo de 18 anos.'],
    })
  }

  return out
}

export function formatResultValue(r: FitnessResult): string {
  const digits = r.key === 'push_ups' || r.key === 'sit_ups' ? 0 : 1
  return `${fmt(r.value, digits)} ${r.unit}`
}
