import { describe, it, expect } from 'vitest'
import { lineTiltDeg, angleDeg, parseDoc } from './annotations'

describe('lineTiltDeg', () => {
  it('horizontal = 0, vertical = 90', () => {
    expect(lineTiltDeg({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0, 6)
    expect(lineTiltDeg({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90, 6)
  })
  it('dobra para 0..90 independente do sentido', () => {
    expect(lineTiltDeg({ x: 0, y: 0 }, { x: 10, y: 10 })).toBeCloseTo(45, 6)
    expect(lineTiltDeg({ x: 0, y: 0 }, { x: -10, y: 10 })).toBeCloseTo(45, 6)
    expect(lineTiltDeg({ x: 0, y: 0 }, { x: 10, y: -10 })).toBeCloseTo(45, 6)
  })
  it('inclinação pequena de ombro', () => {
    expect(lineTiltDeg({ x: 0, y: 0 }, { x: 10, y: 1 })).toBeCloseTo(5.71, 1)
  })
})

describe('angleDeg', () => {
  it('reto, raso e agudo', () => {
    expect(angleDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 6)
    expect(angleDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(180, 6)
    expect(angleDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(45, 6)
  })
  it('vértice degenerado não quebra', () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(0)
  })
})

describe('parseDoc', () => {
  it('mantém formas válidas e descarta lixo', () => {
    const doc = parseDoc({
      shapes: [
        { id: 'a', type: 'line', points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] },
        { id: 'b', type: 'angle', points: [{ x: 0, y: 0 }] }, // pontos de menos
        { type: 'circulo', points: [] }, // tipo inválido
        { id: 'c', type: 'point', points: [{ x: 0.5, y: 0.5 }] },
      ],
    })
    expect(doc.shapes.map((s) => s.id)).toEqual(['a', 'c'])
  })
  it('entrada vazia/ inválida vira doc vazio', () => {
    expect(parseDoc(null).shapes).toEqual([])
    expect(parseDoc({}).shapes).toEqual([])
  })
})
