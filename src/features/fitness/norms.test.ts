import { describe, expect, it } from 'vitest'
import {
  GRIP_LOW_KG,
  HERDY_MEAN,
  herdyCutoffs,
  herdyReferenceMean,
  rateGrip,
  ratePushUps,
  rateSitAndReach,
  rateVo2,
} from './norms'

describe('VO2máx — Herdy e Caixeta (2016)', () => {
  // Tabelas 4 e 5 do artigo, como impressas, nas linhas sem erro de digitação.
  const impressas: { sex: 'M' | 'F'; age: number; corte: [number, number, number, number] }[] = [
    { sex: 'M', age: 20, corte: [25.3, 40.48, 48.07, 53.13] },
    { sex: 'M', age: 30, corte: [23.7, 37.92, 45.03, 49.77] },
    { sex: 'M', age: 40, corte: [22.7, 36.32, 43.13, 47.67] },
    { sex: 'M', age: 50, corte: [20.25, 32.4, 38.47, 42.52] },
    { sex: 'M', age: 70, corte: [15, 24, 28.5, 31.5] },
    { sex: 'F', age: 20, corte: [19.45, 31.12, 36.95, 40.84] },
    { sex: 'F', age: 30, corte: [19.05, 30.48, 36.19, 40.0] },
    { sex: 'F', age: 50, corte: [15.55, 24.88, 29.54, 32.65] },
    { sex: 'F', age: 60, corte: [14.3, 22.88, 27.17, 30.03] },
    { sex: 'F', age: 70, corte: [12.55, 20.08, 23.84, 26.35] },
  ]

  it.each(impressas)('$sex $age anos: os cortes derivados da média batem com a tabela', ({ sex, age, corte }) => {
    const mean = herdyReferenceMean(sex, age)!
    const c = herdyCutoffs(mean)
    // a impressão arredonda ora para cima, ora para baixo na segunda casa
    expect(c.low).toBeCloseTo(corte[0], 1)
    expect(c.fair).toBeCloseTo(corte[1], 1)
    expect(c.good).toBeCloseTo(corte[2], 1)
    expect(c.excellent).toBeCloseTo(corte[3], 1)
  })

  it('as linhas com erro de digitação saem da regra do artigo', () => {
    // mulheres 35–44: "boa 33,16–34,08" no impresso; 105% de 34,9 é 36,65
    expect(herdyCutoffs(herdyReferenceMean('F', 40)!).excellent).toBe(36.65)
    // homens 55–64: "< 17,54" e "17,65–" no impresso; 50% de 35,3 é 17,65
    expect(herdyCutoffs(herdyReferenceMean('M', 60)!).low).toBe(17.65)
  })

  it('bordas das faixas como impressas (homem 20 anos)', () => {
    expect(rateVo2(25.29, 'M', 20)!.label).toBe('Muito fraca')
    expect(rateVo2(25.3, 'M', 20)!.label).toBe('Fraca')
    expect(rateVo2(40.48, 'M', 20)!.label).toBe('Fraca')
    expect(rateVo2(40.49, 'M', 20)!.label).toBe('Regular')
    expect(rateVo2(48.07, 'M', 20)!.label).toBe('Regular')
    expect(rateVo2(48.08, 'M', 20)!.label).toBe('Boa')
    expect(rateVo2(53.13, 'M', 20)!.label).toBe('Boa')
    expect(rateVo2(53.14, 'M', 20)!.label).toBe('Excelente')
  })

  it('faixas etárias pelos limites, e nada fora de 15 a 74', () => {
    expect(herdyReferenceMean('M', 24)).toBe(HERDY_MEAN.M[0])
    expect(herdyReferenceMean('M', 25)).toBe(HERDY_MEAN.M[1])
    expect(herdyReferenceMean('F', 74)).toBe(HERDY_MEAN.F[5])
    expect(rateVo2(40, 'M', 14)).toBeNull()
    expect(rateVo2(40, 'M', 75)).toBeNull()
  })
})

describe('Flexão de braço — CSEP-PATH (2019)', () => {
  it('homem 20–29 na posição completa, nas bordas', () => {
    expect(ratePushUps(36, false, 'M', 25)!.label).toBe('Excelente')
    expect(ratePushUps(35, false, 'M', 25)!.label).toBe('Muito bom')
    expect(ratePushUps(29, false, 'M', 25)!.label).toBe('Muito bom')
    expect(ratePushUps(28, false, 'M', 25)!.label).toBe('Bom')
    expect(ratePushUps(22, false, 'M', 25)!.label).toBe('Bom')
    expect(ratePushUps(21, false, 'M', 25)!.label).toBe('Regular')
    expect(ratePushUps(17, false, 'M', 25)!.label).toBe('Regular')
    expect(ratePushUps(16, false, 'M', 25)!.label).toBe('Precisa melhorar')
  })

  it('mulher 50–59 com os joelhos apoiados', () => {
    expect(ratePushUps(21, true, 'F', 55)!.label).toBe('Excelente')
    expect(ratePushUps(11, true, 'F', 55)!.label).toBe('Muito bom')
    expect(ratePushUps(7, true, 'F', 55)!.label).toBe('Bom')
    expect(ratePushUps(2, true, 'F', 55)!.label).toBe('Regular')
    expect(ratePushUps(1, true, 'F', 55)!.label).toBe('Precisa melhorar')
  })

  it('protocolo diferente do da tabela fica sem classificação', () => {
    expect(ratePushUps(20, false, 'F', 25)).toBeNull()
    expect(ratePushUps(20, true, 'M', 25)).toBeNull()
  })

  it('fora de 15 a 69 anos fica sem classificação', () => {
    expect(ratePushUps(20, false, 'M', 70)).toBeNull()
    expect(ratePushUps(20, false, 'M', 14)).toBeNull()
  })
})

describe('Sentar e alcançar — CSEP (2003)', () => {
  it('homem 20–29, pés no 26: o 29 repetido na impressão fica em regular', () => {
    expect(rateSitAndReach(40, 26, 'M', 25)!.label).toBe('Excelente')
    expect(rateSitAndReach(34, 26, 'M', 25)!.label).toBe('Muito bom')
    expect(rateSitAndReach(30, 26, 'M', 25)!.label).toBe('Bom')
    expect(rateSitAndReach(29, 26, 'M', 25)!.label).toBe('Regular')
    expect(rateSitAndReach(25, 26, 'M', 25)!.label).toBe('Regular')
    expect(rateSitAndReach(24, 26, 'M', 25)!.label).toBe('Precisa melhorar')
  })

  it('banco com os pés no 23 soma 3 cm antes de comparar', () => {
    // 27 cm num banco de 23 equivalem a 30 cm na escala da tabela: bom
    expect(rateSitAndReach(27, 23, 'M', 25)!.label).toBe('Bom')
    expect(rateSitAndReach(27, 26, 'M', 25)!.label).toBe('Regular')
  })

  it('mulher 60–69', () => {
    expect(rateSitAndReach(35, 26, 'F', 65)!.label).toBe('Excelente')
    expect(rateSitAndReach(22, 26, 'F', 65)!.label).toBe('Precisa melhorar')
  })

  it('sem tabela abaixo de 20 e acima de 69', () => {
    expect(rateSitAndReach(30, 26, 'M', 19)).toBeNull()
    expect(rateSitAndReach(30, 26, 'F', 70)).toBeNull()
  })
})

describe('Preensão manual — EWGSOP2', () => {
  it('cortes de força baixa', () => {
    expect(GRIP_LOW_KG).toEqual({ M: 27, F: 16 })
    expect(rateGrip(26.9, 'M', 70)!.label).toBe('Força baixa')
    expect(rateGrip(27, 'M', 70)!.label).toBe('Acima do corte de força baixa')
    expect(rateGrip(15.9, 'F', 40)!.label).toBe('Força baixa')
    expect(rateGrip(16, 'F', 40)!.label).toBe('Acima do corte de força baixa')
  })
  it('sem corte para menores de 18', () => {
    expect(rateGrip(10, 'F', 17)).toBeNull()
  })
})
