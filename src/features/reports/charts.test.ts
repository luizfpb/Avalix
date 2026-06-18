import { describe, it, expect } from 'vitest'
import { donutSlices, linePath } from './charts'

describe('donutSlices', () => {
  it('duas fatias iguais → 50% cada', () => {
    const s = donutSlices([1, 1], 50, 50, 40, 24)
    expect(s).toHaveLength(2)
    expect(s[0].pct).toBeCloseTo(0.5, 6)
    expect(s[1].pct).toBeCloseTo(0.5, 6)
    expect(s[0].d.startsWith('M')).toBe(true)
  })
  it('total zero → vazio', () => {
    expect(donutSlices([0, 0], 50, 50, 40, 24)).toEqual([])
  })
})

describe('linePath', () => {
  it('escala min no fundo e max no topo', () => {
    const l = linePath([0, 10], 100, 50)
    expect(l.min).toBe(0)
    expect(l.max).toBe(10)
    // 1º ponto (valor 0 = min) fica mais embaixo (y maior) que o 2º (valor 10 = max)
    expect(l.coords[0].y).toBeGreaterThan(l.coords[1].y)
  })
  it('ignora nulos nos pontos mas mantém as coords', () => {
    const l = linePath([5, null, 8], 100, 50)
    expect(l.coords).toHaveLength(3)
    expect(l.coords[1].valid).toBe(false)
    expect(l.points.split(' ')).toHaveLength(2)
  })
})
