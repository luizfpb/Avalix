import { describe, it, expect } from 'vitest'
import { poseToShapes, type PoseLandmark } from './pose'

// 33 landmarks visíveis em posições distintas (x = i/100 pra rastrear)
function fullLandmarks(visibility = 0.9): PoseLandmark[] {
  return Array.from({ length: 33 }, (_, i) => ({ x: i / 100, y: 0.5, visibility }))
}

describe('poseToShapes', () => {
  it('pose completa vira 2 linhas (ombros, quadris) + 6 pontos', () => {
    const shapes = poseToShapes(fullLandmarks())
    const lines = shapes.filter((s) => s.type === 'line')
    const points = shapes.filter((s) => s.type === 'point')
    expect(lines).toHaveLength(2)
    expect(points).toHaveLength(6)
    // linha dos ombros liga os landmarks 11 e 12
    expect(lines[0].points[0].x).toBeCloseTo(0.11)
    expect(lines[0].points[1].x).toBeCloseTo(0.12)
  })

  it('visibility baixa filtra o landmark (e a linha que depende dele)', () => {
    const lms = fullLandmarks()
    lms[11] = { ...lms[11], visibility: 0.2 } // ombro esquerdo invisível
    const shapes = poseToShapes(lms)
    const lines = shapes.filter((s) => s.type === 'line')
    expect(lines).toHaveLength(1) // só quadris
  })

  it('landmark sem visibility conta como visível', () => {
    const lms = fullLandmarks().map(({ x, y }) => ({ x, y }))
    expect(poseToShapes(lms).filter((s) => s.type === 'line')).toHaveLength(2)
  })

  it('coordenada fora da imagem é grampeada em 0..1', () => {
    const lms = fullLandmarks()
    lms[7] = { x: -0.1, y: 1.4, visibility: 0.9 }
    const ear = poseToShapes(lms).find((s) => s.type === 'point')
    expect(ear?.points[0].x).toBe(0)
    expect(ear?.points[0].y).toBe(1)
  })

  it('lista vazia devolve zero formas', () => {
    expect(poseToShapes([])).toEqual([])
  })
})
