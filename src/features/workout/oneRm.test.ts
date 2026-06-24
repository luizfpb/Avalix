import { describe, it, expect } from 'vitest'
import {
  estimateOneRm,
  loadForPercent,
  percentTable,
  repsForLoad,
  roundToIncrement,
} from './oneRm'

describe('estimateOneRm', () => {
  it('Epley: 100kg x 5 -> 116.67', () => {
    expect(estimateOneRm(100, 5, 'epley')).toBeCloseTo(116.667, 2)
  })
  it('Brzycki: 100kg x 5 -> 112.5', () => {
    expect(estimateOneRm(100, 5, 'brzycki')).toBeCloseTo(112.5, 4)
  })
  it('1 repetição devolve a própria carga', () => {
    expect(estimateOneRm(120, 1, 'epley')).toBe(120)
    expect(estimateOneRm(120, 1, 'brzycki')).toBe(120)
  })
  it('entradas inválidas -> 0', () => {
    expect(estimateOneRm(0, 5)).toBe(0)
    expect(estimateOneRm(100, 0)).toBe(0)
    expect(estimateOneRm(100, 37, 'brzycki')).toBe(0)
  })
})

describe('loadForPercent', () => {
  it('80% de 100 = 80', () => {
    expect(loadForPercent(100, 80)).toBe(80)
  })
})

describe('repsForLoad', () => {
  it('na própria 1RM = 1 rep; ~90% ~ 3 reps (Epley)', () => {
    expect(repsForLoad(100, 100)).toBe(1)
    expect(repsForLoad(100, 90)).toBe(3) // (100/90 - 1)*30 = 3.33 -> 3
    expect(repsForLoad(100, 75)).toBe(10) // (100/75 - 1)*30 = 10
  })
})

describe('percentTable', () => {
  it('100% bate a 1RM e a tabela tem 13 linhas por padrão', () => {
    const t = percentTable(116.67)
    expect(t).toHaveLength(13)
    expect(t[0].pct).toBe(100)
    expect(t[0].load).toBeCloseTo(116.67, 2)
    expect(t[t.length - 1].pct).toBe(40)
  })
})

describe('roundToIncrement', () => {
  it('arredonda para 2,5 kg', () => {
    expect(roundToIncrement(82)).toBe(82.5)
    expect(roundToIncrement(80)).toBe(80)
    expect(roundToIncrement(81.2)).toBe(80)
    expect(roundToIncrement(83.75, 1.25)).toBe(83.75)
  })
})
