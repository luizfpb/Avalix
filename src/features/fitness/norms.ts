// Tabelas normativas dos testes físicos. Cada tabela tem a fonte ao lado e
// um teste que confere os pontos de corte publicados (norms.test.ts).
// Só entra aqui tabela conferida na fonte: teste sem tabela confiável
// (abdominal em 1 minuto) é registrado e acompanhado, sem classificação.

import type { Sex } from '../assessment/protocols'

export type Rating = {
  label: string
  // 0 = pior faixa; o maior índice é a melhor. Serve para a cor e a ordem.
  level: number
  levels: number
  source: string
}

// ---------------------------------------------------------------------
// VO2máx — Herdy AH, Caixeta A. Brazilian Cardiorespiratory Fitness
// Classification Based on Maximum Oxygen Consumption. Arq Bras Cardiol.
// 2016;106(5). doi:10.5935/abc.20160070
//
// 2.837 adultos saudáveis e fisicamente ativos, teste cardiopulmonar máximo em
// esteira, sul do Brasil. "Boa" é a média de cada grupo (± 5%); as outras
// faixas são percentuais dessa média: < 50% muito fraca, 50–80% fraca,
// 80–95% regular, 95–105% boa, > 105% excelente. Guardamos a média e
// derivamos os cortes, como o artigo faz; a tabela impressa tem dois erros de
// digitação (mulheres 35–44 "33,16–34,08" e homens 55–64 "< 17,54"), que a
// regra corrige.
// ---------------------------------------------------------------------
export const HERDY_SOURCE = 'Herdy e Caixeta, Arq Bras Cardiol, 2016'

const HERDY_AGES: [number, number][] = [
  [15, 24],
  [25, 34],
  [35, 44],
  [45, 54],
  [55, 64],
  [65, 74],
]

export const HERDY_MEAN: Record<Sex, number[]> = {
  M: [50.6, 47.4, 45.4, 40.5, 35.3, 30.0],
  F: [38.9, 38.1, 34.9, 31.1, 28.6, 25.1],
}

const HERDY_LABELS = ['Muito fraca', 'Fraca', 'Regular', 'Boa', 'Excelente']

const round2 = (v: number) => Math.round(v * 100) / 100

export function herdyReferenceMean(sex: Sex, ageYears: number): number | null {
  const i = HERDY_AGES.findIndex(([a, b]) => ageYears >= a && ageYears <= b)
  return i === -1 ? null : HERDY_MEAN[sex][i]
}

// Cortes como impressos: fraca vai até 80% inclusive, regular até 95%,
// boa até 105%; excelente é acima.
export function herdyCutoffs(mean: number) {
  return {
    low: round2(mean * 0.5),
    fair: round2(mean * 0.8),
    good: round2(mean * 0.95),
    excellent: round2(mean * 1.05),
  }
}

export function rateVo2(vo2: number, sex: Sex, ageYears: number): Rating | null {
  const mean = herdyReferenceMean(sex, ageYears)
  if (mean == null) return null
  const c = herdyCutoffs(mean)
  const v = round2(vo2)
  const level = v < c.low ? 0 : v <= c.fair ? 1 : v <= c.good ? 2 : v <= c.excellent ? 3 : 4
  return { label: HERDY_LABELS[level], level, levels: 5, source: HERDY_SOURCE }
}

// ---------------------------------------------------------------------
// CSEP — Canadian Society for Exercise Physiology. Cinco faixas:
// excelente, muito bom, bom, regular, precisa melhorar. Cada linha guarda o
// MÍNIMO de excelente, muito bom, bom e regular; abaixo disso, precisa
// melhorar.
// ---------------------------------------------------------------------
const CSEP_LABELS = ['Precisa melhorar', 'Regular', 'Bom', 'Muito bom', 'Excelente']

type CsepRow = { ages: [number, number]; min: [number, number, number, number] }

function rateCsep(rows: CsepRow[], value: number, ageYears: number, source: string): Rating | null {
  const row = rows.find((r) => ageYears >= r.ages[0] && ageYears <= r.ages[1])
  if (!row) return null
  const [exc, vg, good, fair] = row.min
  const level = value >= exc ? 4 : value >= vg ? 3 : value >= good ? 2 : value >= fair ? 1 : 0
  return { label: CSEP_LABELS[level], level, levels: 5, source }
}

// Flexão de braço até a fadiga, sem pausa. Homens na posição completa,
// mulheres com os joelhos apoiados. CSEP-PATH Resource Manual (2019),
// reproduzido pelo ACE no protocolo de flexão de braço.
export const PUSH_UPS_SOURCE = 'CSEP-PATH, 2019'

export const PUSH_UPS: Record<Sex, CsepRow[]> = {
  M: [
    { ages: [15, 19], min: [39, 29, 23, 18] },
    { ages: [20, 29], min: [36, 29, 22, 17] },
    { ages: [30, 39], min: [30, 22, 17, 12] },
    { ages: [40, 49], min: [25, 17, 13, 10] },
    { ages: [50, 59], min: [21, 13, 10, 7] },
    { ages: [60, 69], min: [18, 11, 8, 5] },
  ],
  F: [
    { ages: [15, 19], min: [33, 25, 18, 12] },
    { ages: [20, 29], min: [30, 21, 15, 10] },
    { ages: [30, 39], min: [27, 20, 13, 8] },
    { ages: [40, 49], min: [24, 15, 11, 5] },
    { ages: [50, 59], min: [21, 11, 7, 2] },
    { ages: [60, 69], min: [17, 12, 5, 2] },
  ],
}

// A tabela só vale no protocolo dela: joelhos apoiados para mulheres e
// posição completa para homens. Fora disso, o número fica sem classificação.
export function pushUpsProtocolMatches(sex: Sex, knees: boolean): boolean {
  return sex === 'F' ? knees : !knees
}

export function ratePushUps(reps: number, knees: boolean, sex: Sex, ageYears: number): Rating | null {
  if (!pushUpsProtocolMatches(sex, knees)) return null
  return rateCsep(PUSH_UPS[sex], reps, ageYears, PUSH_UPS_SOURCE)
}

// Sentar e alcançar, banco com o zero da régua a 26 cm da planta dos pés.
// CSEP, The Canadian Physical Activity, Fitness & Lifestyle Approach, 3ª ed.
// (2003), reproduzida no ACSM's Guidelines (tabela 4-15). A impressão repete o
// mesmo número no fim de "bom" e no começo de "regular" (29 cm nos homens de
// 20–29); o valor repetido fica em "regular", como no manual do CSEP
// (bom = 30–33 cm). Banco com os pés na marca de 23 cm soma 3 cm antes de
// comparar, como a nota da tabela manda.
export const SIT_AND_REACH_SOURCE = 'CSEP, 2003'

export const SIT_AND_REACH: Record<Sex, CsepRow[]> = {
  M: [
    { ages: [20, 29], min: [40, 34, 30, 25] },
    { ages: [30, 39], min: [38, 33, 28, 23] },
    { ages: [40, 49], min: [35, 29, 24, 18] },
    { ages: [50, 59], min: [35, 28, 24, 16] },
    { ages: [60, 69], min: [33, 25, 20, 15] },
  ],
  F: [
    { ages: [20, 29], min: [41, 37, 33, 28] },
    { ages: [30, 39], min: [41, 36, 32, 27] },
    { ages: [40, 49], min: [38, 34, 30, 25] },
    { ages: [50, 59], min: [39, 33, 30, 25] },
    { ages: [60, 69], min: [35, 31, 27, 23] },
  ],
}

export function sitAndReachOnCsepScale(bestCm: number, feetMarkCm: 23 | 26): number {
  return bestCm + (26 - feetMarkCm)
}

export function rateSitAndReach(
  bestCm: number,
  feetMarkCm: 23 | 26,
  sex: Sex,
  ageYears: number
): Rating | null {
  return rateCsep(SIT_AND_REACH[sex], sitAndReachOnCsepScale(bestCm, feetMarkCm), ageYears, SIT_AND_REACH_SOURCE)
}

// ---------------------------------------------------------------------
// Preensão manual — EWGSOP2 (Cruz-Jentoft et al., Age Ageing, 2019):
// força baixa abaixo de 27 kg (homens) e 16 kg (mulheres), pela maior medida.
// É o critério de sarcopenia provável, não uma escala de aptidão: indica só
// "baixa" ou "acima do corte".
// ---------------------------------------------------------------------
export const GRIP_SOURCE = 'EWGSOP2, 2019'
export const GRIP_LOW_KG: Record<Sex, number> = { M: 27, F: 16 }

export function rateGrip(bestKg: number, sex: Sex, ageYears: number): Rating | null {
  if (ageYears < 18) return null
  const low = bestKg < GRIP_LOW_KG[sex]
  return {
    label: low ? 'Força baixa' : 'Acima do corte de força baixa',
    level: low ? 0 : 1,
    levels: 2,
    source: GRIP_SOURCE,
  }
}
