// Equações de densidade corporal e de % de gordura. Coeficientes conferidos
// contra fontes publicadas (Jackson & Pollock 1978; Jackson, Pollock & Ward
// 1980; Durnin & Womersley 1974; US Navy / Hodgdon-Beckett). Não alterar sem
// reconferir com a fonte e atualizar os testes de vetor.

import type { Sex } from './types'

// Jackson & Pollock 7 dobras (peitoral, axilar, tríceps, subescapular,
// abdominal, supra-ilíaca, coxa). Equação por sexo.
export function jp7BodyDensity(sex: Sex, sumMm: number, ageYears: number): number {
  if (sex === 'M') {
    return 1.112 - 0.00043499 * sumMm + 0.00000055 * sumMm * sumMm - 0.00028826 * ageYears
  }
  return 1.097 - 0.00046971 * sumMm + 0.00000056 * sumMm * sumMm - 0.00012828 * ageYears
}

// Jackson & Pollock 3 dobras, homens (peitoral, abdominal, coxa).
export function jp3MaleBodyDensity(sumMm: number, ageYears: number): number {
  return 1.10938 - 0.0008267 * sumMm + 0.0000016 * sumMm * sumMm - 0.0002574 * ageYears
}

// Jackson, Pollock & Ward 3 dobras, mulheres (tríceps, supra-ilíaca, coxa).
export function jpWardFemaleBodyDensity(sumMm: number, ageYears: number): number {
  return 1.0994921 - 0.0009929 * sumMm + 0.0000023 * sumMm * sumMm - 0.0001392 * ageYears
}

// Durnin & Womersley 1974, 4 dobras (bíceps, tríceps, subescapular, supra-ilíaca):
// D = c - m * log10(soma). c e m variam por sexo e faixa etária.
type DwCoef = { c: number; m: number }

const DW_MALE = {
  under17: { c: 1.1533, m: 0.0643 },
  a17_19: { c: 1.162, m: 0.063 },
  a20_29: { c: 1.1631, m: 0.0632 },
  a30_39: { c: 1.1422, m: 0.0544 },
  a40_49: { c: 1.162, m: 0.07 },
  a50plus: { c: 1.1715, m: 0.0779 },
} as const

const DW_FEMALE = {
  under17: { c: 1.1369, m: 0.0598 },
  a17_19: { c: 1.1549, m: 0.0678 },
  a20_29: { c: 1.1599, m: 0.0717 },
  a30_39: { c: 1.1423, m: 0.0632 },
  a40_49: { c: 1.1333, m: 0.0612 },
  a50plus: { c: 1.1339, m: 0.0645 },
} as const

function dwCoef(sex: Sex, ageYears: number): DwCoef {
  const t = sex === 'M' ? DW_MALE : DW_FEMALE
  if (ageYears < 17) return t.under17
  if (ageYears <= 19) return t.a17_19
  if (ageYears <= 29) return t.a20_29
  if (ageYears <= 39) return t.a30_39
  if (ageYears <= 49) return t.a40_49
  return t.a50plus
}

export function durninWomersleyBodyDensity(sex: Sex, sumMm: number, ageYears: number): number {
  const { c, m } = dwCoef(sex, ageYears)
  return c - m * Math.log10(sumMm)
}

// US Navy (Hodgdon-Beckett), medidas em cm. Retorna % de gordura diretamente.
// Homem: usa pescoço e cintura. Mulher: pescoço, cintura e quadril.
export function usNavyBodyFatPct(
  sex: Sex,
  heightCm: number,
  neckCm: number,
  waistCm: number,
  hipCm?: number
): number {
  if (sex === 'M') {
    return (
      495 /
        (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) -
      450
    )
  }
  if (hipCm == null) {
    throw new Error('quadril é obrigatório para o US Navy feminino')
  }
  return (
    495 /
      (1.29579 - 0.35004 * Math.log10(waistCm + hipCm - neckCm) + 0.221 * Math.log10(heightCm)) -
    450
  )
}
