// Fórmulas das ferramentas públicas. Cópia das do app, que são a fonte:
//   1RM: src/features/workout/oneRm.ts
//   Dobras e US Navy: src/features/assessment/protocols/equations.ts
//   Siri: src/features/assessment/protocols/bodyComposition.ts
//   IMC e faixas da OMS: src/features/assessment/bmi.ts e adultReference.ts
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
