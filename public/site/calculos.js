// Fórmulas das ferramentas públicas. Cópia das do app, que são a fonte:
//   1RM: src/features/workout/oneRm.ts
//   Dobras e US Navy: src/features/assessment/protocols/equations.ts
//   Siri: src/features/assessment/protocols/bodyComposition.ts
// src/lib/sitePublico.test.ts confere este arquivo contra os módulos do app,
// então mudar uma fórmula lá sem mudar aqui reprova o teste.

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
