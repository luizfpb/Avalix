import { describe, it, expect } from 'vitest'
import { computeBmi, bmiCategory } from './bmi'

describe('computeBmi', () => {
  it('calcula peso / altura² em metros', () => {
    // 80 kg, 180 cm -> 80 / 3.24 = 24.69
    expect(computeBmi(80, 180)).toBeCloseTo(24.69, 2)
    // 60 kg, 170 cm -> 60 / 2.89 = 20.76
    expect(computeBmi(60, 170)).toBeCloseTo(20.76, 2)
  })
})

describe('bmiCategory', () => {
  it('classifica pelas faixas da OMS, com limite superior exclusivo', () => {
    expect(bmiCategory(17).label).toBe('Abaixo do peso')
    expect(bmiCategory(18.5).label).toBe('Peso normal') // limite inferior inclusivo
    expect(bmiCategory(24.9).label).toBe('Peso normal')
    expect(bmiCategory(25).label).toBe('Sobrepeso') // 25.0 já é sobrepeso
    expect(bmiCategory(30).label).toBe('Obesidade grau I')
    expect(bmiCategory(35).label).toBe('Obesidade grau II')
    expect(bmiCategory(40).label).toBe('Obesidade grau III')
  })

  it('marca só a faixa normal como tom normal', () => {
    expect(bmiCategory(22).tone).toBe('normal')
    expect(bmiCategory(17).tone).toBe('warn')
    expect(bmiCategory(27).tone).toBe('warn')
  })
})
