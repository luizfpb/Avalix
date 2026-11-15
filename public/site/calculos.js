// Fórmulas das ferramentas públicas. Cópia das do app, que são a fonte:
//   1RM: src/features/workout/oneRm.ts
//   Dobras e US Navy: src/features/assessment/protocols/equations.ts
//   Siri: src/features/assessment/protocols/bodyComposition.ts
//   IMC e faixas da OMS: src/features/assessment/bmi.ts e adultReference.ts
//   VO2máx e faixas de Herdy: src/features/fitness/engine.ts e norms.ts
// src/lib/sitePublico.test.ts confere este arquivo contra os módulos do app,
// então mudar uma fórmula lá sem mudar aqui reprova o teste.
//
// Só no site (o app não calcula), com a fonte ao lado e teste próprio:
//   cintura e relação cintura-quadril: pontos de corte da OMS (2008)
//   relação cintura-estatura: Ashwell e Hsieh (2005)
//   frequência cardíaca máxima: Tanaka, Monahan e Seals (2001) e 220 − idade
//   zonas pela frequência cardíaca de reserva: Karvonen (1957)

export function computeBmi(weightKg, heightCm) {
  const m = heightCm / 100
  return weightKg / (m * m)
}

const ADULT_REFERENCE_MIN_AGE = 18

export function bmiCategory(bmi, ageYears) {
  if (!(ageYears != null && Number.isFinite(ageYears) && ageYears >= ADULT_REFERENCE_MIN_AGE)) {
    const label = ageYears == null || !Number.isFinite(ageYears)
      ? 'Sem classificação (idade não informada)'
      : 'Sem classificação adulta (menor de 18 anos)'
    return { label, tone: 'none' }
  }
  if (bmi < 18.5) return { label: 'Abaixo do peso', tone: 'warn' }
  if (bmi < 25) return { label: 'Peso normal', tone: 'normal' }
  if (bmi < 30) return { label: 'Sobrepeso', tone: 'warn' }
  if (bmi < 35) return { label: 'Obesidade grau I', tone: 'warn' }
  if (bmi < 40) return { label: 'Obesidade grau II', tone: 'warn' }
  return { label: 'Obesidade grau III', tone: 'warn' }
}

// OMS (2008): cintura acima de 94 cm (homens) ou 80 cm (mulheres) indica risco
// metabólico aumentado; acima de 102 cm ou 88 cm, muito aumentado.
export function waistRisk(sex, waistCm) {
  const [aumentado, muito] = sex === 'M' ? [94, 102] : [80, 88]
  if (waistCm > muito) return 'muito aumentado'
  if (waistCm > aumentado) return 'aumentado'
  return 'baixo'
}

// OMS (2008): relação cintura-quadril a partir de 0,90 (homens) ou 0,85
// (mulheres) indica risco muito aumentado.
export function waistHipRisk(sex, ratio) {
  return ratio >= (sex === 'M' ? 0.9 : 0.85) ? 'muito aumentado' : 'abaixo do ponto de corte'
}

// Ashwell e Hsieh (2005): cintura menor que metade da altura (relação < 0,5).
export function waistHeightRisk(ratio) {
  return ratio >= 0.5 ? 'acima de 0,5' : 'abaixo de 0,5'
}

export function hrMax(ageYears, formula = 'tanaka') {
  return formula === 'fox' ? 220 - ageYears : 208 - 0.7 * ageYears
}

// Cinco zonas por percentual. Com a FC de repouso, o percentual é da
// frequência cardíaca de reserva (Karvonen); sem ela, da FC máxima.
export const HR_ZONES = [
  { zona: 1, nome: 'Muito leve, recuperação', de: 50, ate: 60 },
  { zona: 2, nome: 'Leve, base aeróbia', de: 60, ate: 70 },
  { zona: 3, nome: 'Moderada', de: 70, ate: 80 },
  { zona: 4, nome: 'Intensa', de: 80, ate: 90 },
  { zona: 5, nome: 'Máxima', de: 90, ate: 100 },
]

export function hrAt(pct, maxHr, restHr = null) {
  return restHr == null ? (maxHr * pct) / 100 : restHr + ((maxHr - restHr) * pct) / 100
}

export function hrZones(maxHr, restHr = null) {
  return HR_ZONES.map((z) => ({
    ...z,
    min: Math.round(hrAt(z.de, maxHr, restHr)),
    max: Math.round(hrAt(z.ate, maxHr, restHr)),
  }))
}

export function estimateOneRm(weight, reps, formula = 'epley') {
  if (!(weight > 0) || !(reps >= 1)) return 0
  if (reps === 1) return weight
  if (formula === 'brzycki') {
    if (reps >= 37) return 0
    return (weight * 36) / (37 - reps)
  }
  return weight * (1 + reps / 30)
}

export function repsForLoad(oneRm, weight) {
  if (!(oneRm > 0) || !(weight > 0)) return 0
  if (weight >= oneRm) return 1
  return Math.max(1, Math.round((oneRm / weight - 1) * 30))
}

export function roundToIncrement(value, increment = 2.5) {
  if (!(increment > 0)) return value
  return Math.round(value / increment) * increment
}

export function percentTable(oneRm, pcts = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50]) {
  return pcts.map((pct) => {
    const load = oneRm * (pct / 100)
    return { pct, load, reps: repsForLoad(oneRm, load) }
  })
}

export function jp7BodyDensity(sex, sumMm, ageYears) {
  if (sex === 'M') {
    return 1.112 - 0.00043499 * sumMm + 0.00000055 * sumMm * sumMm - 0.00028826 * ageYears
  }
  return 1.097 - 0.00046971 * sumMm + 0.00000056 * sumMm * sumMm - 0.00012828 * ageYears
}

export function jp3MaleBodyDensity(sumMm, ageYears) {
  return 1.10938 - 0.0008267 * sumMm + 0.0000016 * sumMm * sumMm - 0.0002574 * ageYears
}

export function jpWardFemaleBodyDensity(sumMm, ageYears) {
  return 1.0994921 - 0.0009929 * sumMm + 0.0000023 * sumMm * sumMm - 0.0001392 * ageYears
}

export function siriBodyFatPct(bodyDensity) {
  return 495 / bodyDensity - 450
}

export function usNavyBodyFatPct(sex, heightCm, neckCm, trunkCm, hipCm) {
  if (sex === 'M') {
    return 495 / (1.0324 - 0.19077 * Math.log10(trunkCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450
  }
  return 495 / (1.29579 - 0.35004 * Math.log10(trunkCm + hipCm - neckCm) + 0.221 * Math.log10(heightCm)) - 450
}

export function cooperVo2(distanceM) {
  return (distanceM - 504.9) / 44.73
}

export function rockportVo2(sex, ageYears, weightKg, timeS, hrBpm) {
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

export function queensVo2(sex, hrBpm) {
  return sex === 'M' ? 111.33 - 0.42 * hrBpm : 65.81 - 0.1847 * hrBpm
}

const HERDY_SOURCE = 'Herdy e Caixeta, Arq Bras Cardiol, 2016'
const HERDY_AGES = [
  [15, 24],
  [25, 34],
  [35, 44],
  [45, 54],
  [55, 64],
  [65, 74],
]
const HERDY_MEAN = {
  M: [50.6, 47.4, 45.4, 40.5, 35.3, 30.0],
  F: [38.9, 38.1, 34.9, 31.1, 28.6, 25.1],
}
const HERDY_LABELS = ['Muito fraca', 'Fraca', 'Regular', 'Boa', 'Excelente']
const round2 = (v) => Math.round(v * 100) / 100

export function herdyReferenceMean(sex, ageYears) {
  const i = HERDY_AGES.findIndex(([a, b]) => ageYears >= a && ageYears <= b)
  return i === -1 ? null : HERDY_MEAN[sex]?.[i] ?? null
}

export function herdyCutoffs(mean) {
  return {
    low: round2(mean * 0.5),
    fair: round2(mean * 0.8),
    good: round2(mean * 0.95),
    excellent: round2(mean * 1.05),
  }
}

export function rateVo2(vo2, sex, ageYears) {
  const mean = herdyReferenceMean(sex, ageYears)
  if (mean == null) return null
  const c = herdyCutoffs(mean)
  const v = round2(vo2)
  const level = v < c.low ? 0 : v <= c.fair ? 1 : v <= c.good ? 2 : v <= c.excellent ? 3 : 4
  return { label: HERDY_LABELS[level], level, levels: 5, source: HERDY_SOURCE }
}

// Mifflin et al. (Am J Clin Nutr, 1990): 10 × peso + 6,25 × altura − 5 × idade + s
export function bmrMifflin(sex, weightKg, heightCm, ageYears) {
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === 'M' ? 5 : -161)
}

// Harris-Benedict revisada por Roza & Shizgal (Am J Clin Nutr, 1984)
export function bmrHarrisBenedict(sex, weightKg, heightCm, ageYears) {
  if (sex === 'M') {
    return 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * ageYears
  }
  return 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.330 * ageYears
}

// Cunningham (Am J Clin Nutr, 1980): 500 + 22 × massa livre de gordura (kg)
export function bmrCunningham(leanMassKg) {
  return 500 + 22 * leanMassKg
}

export const TDEE_FACTORS = [
  { fator: 1.2, nome: 'Sedentário', rotina: 'Pouco ou nenhum exercício' },
  { fator: 1.375, nome: 'Levemente ativo', rotina: '1 a 3 treinos por semana' },
  { fator: 1.55, nome: 'Moderadamente ativo', rotina: '3 a 5 treinos por semana' },
  { fator: 1.725, nome: 'Muito ativo', rotina: '6 a 7 treinos intensos por semana' },
  { fator: 1.9, nome: 'Extremamente ativo', rotina: 'Treino diário intenso ou trabalho físico' },
]

export function tdeeTable(bmr) {
  return TDEE_FACTORS.map((f) => ({
    ...f,
    kcal: Math.round(bmr * f.fator),
  }))
}

// Número digitado no formato brasileiro ("72,5") ou com ponto.
export function lerNumero(texto) {
  const t = String(texto ?? '').trim().replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const INT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

export function formatar(n, casas = 1) {
  return casas === 1 ? NUM.format(n) : INT.format(n)
}
