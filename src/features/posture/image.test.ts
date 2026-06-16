import { describe, it, expect } from 'vitest'
import { computeTargetSize } from './image'

describe('computeTargetSize', () => {
  it('reduz mantendo proporção pelo lado maior', () => {
    expect(computeTargetSize(3000, 2000, 1600)).toEqual({ width: 1600, height: 1067 })
    expect(computeTargetSize(2000, 4000, 320)).toEqual({ width: 160, height: 320 })
  })
  it('não aumenta imagem menor que o limite', () => {
    expect(computeTargetSize(1000, 800, 1600)).toEqual({ width: 1000, height: 800 })
  })
  it('protege contra dimensões inválidas', () => {
    expect(computeTargetSize(0, 0, 1600)).toEqual({ width: 0, height: 0 })
  })
})
