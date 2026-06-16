import { describe, it, expect } from 'vitest'
import { meanReading } from './sites'

describe('meanReading', () => {
  it('faz a média das aferições válidas', () => {
    expect(meanReading([10, 12, 14])).toBe(12)
    expect(meanReading([10])).toBe(10)
  })
  it('ignora vazios, zeros e não-números', () => {
    expect(meanReading([10, 0, Number.NaN, 12])).toBe(11)
  })
  it('devolve null quando não há aferição válida', () => {
    expect(meanReading([])).toBeNull()
    expect(meanReading([0, Number.NaN])).toBeNull()
  })
})
