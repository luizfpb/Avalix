import { describe, it, expect } from 'vitest'
import { axisDomain, barLayout, donutSlices, linePath } from './charts'

describe('axisDomain', () => {
  it('variação maior que o piso: escala justa aos dados', () => {
    expect(axisDomain([22, 20, 18], 2)).toEqual({ min: 18, max: 22 })
  })

  it('variação abaixo do piso: abre a janela até o piso mínimo', () => {
    // o caso real do laudo: massa magra 65,5 -> 65,6 kg desenhava um "V"
    // dramático porque o eixo cabia só os 0,1 kg de diferença
    const d = axisDomain([65.5, 65.6, 65.6], 2)
    expect(d.max - d.min).toBeGreaterThanOrEqual(2)
    expect(d.min).toBeLessThanOrEqual(65.5)
    expect(d.max).toBeGreaterThanOrEqual(65.6)
    // com a janela aberta, os 0,1 kg ocupam no máximo 5% da altura
    expect(0.1 / (d.max - d.min)).toBeLessThan(0.05)
  })

  it('abre em números redondos, não no meio de lugar nenhum', () => {
    expect(axisDomain([65.5, 65.6], 2)).toEqual({ min: 64, max: 67 })
  })

  it('todos os valores iguais não geram span zero', () => {
    const d = axisDomain([80, 80], 2)
    expect(d.max).toBeGreaterThan(d.min)
  })

  it('série vazia devolve uma janela utilizável', () => {
    expect(axisDomain([], 2)).toEqual({ min: 0, max: 2 })
  })

  it('piso zero mantém o comportamento de escala automática', () => {
    expect(axisDomain([10, 20], 0)).toEqual({ min: 10, max: 20 })
  })
})

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

describe('barLayout', () => {
  it('escala pelo maior valor: o maior vira barra cheia', () => {
    const { bars, max } = barLayout([
      { label: 'a', value: 5 },
      { label: 'b', value: 10 },
    ], 200, 8, 4)
    expect(max).toBe(10)
    expect(bars[1].pct).toBe(1)
    expect(bars[1].width).toBe(200)
    expect(bars[0].pct).toBe(0.5)
    expect(bars[0].width).toBe(100)
    // empilhamento vertical
    expect(bars[0].y).toBe(0)
    expect(bars[1].y).toBe(12) // 8 + 4 de gap
  })

  it('respeita maxValue fixo e zera negativos', () => {
    const { bars } = barLayout([{ label: 'a', value: -3 }, { label: 'b', value: 5 }], 100, 8, 4, 10)
    expect(bars[0].pct).toBe(0)
    expect(bars[1].pct).toBe(0.5)
  })

  it('série vazia ou max zero não quebra', () => {
    expect(barLayout([], 100, 8).bars).toEqual([])
    const { bars } = barLayout([{ label: 'a', value: 0 }], 100, 8)
    expect(bars[0].pct).toBe(0)
  })
})
