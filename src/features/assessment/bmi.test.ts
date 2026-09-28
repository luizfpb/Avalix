import { describe, it, expect } from 'vitest'
import { computeBmi, bmiCategory } from './bmi'
import { assessmentAgeYears } from './adultReference'

const ADULTO = 30

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
    expect(bmiCategory(17, ADULTO).label).toBe('Abaixo do peso')
    expect(bmiCategory(18.5, ADULTO).label).toBe('Peso normal') // limite inferior inclusivo
    expect(bmiCategory(24.9, ADULTO).label).toBe('Peso normal')
    expect(bmiCategory(25, ADULTO).label).toBe('Sobrepeso') // 25.0 já é sobrepeso
    expect(bmiCategory(30, ADULTO).label).toBe('Obesidade grau I')
    expect(bmiCategory(35, ADULTO).label).toBe('Obesidade grau II')
    expect(bmiCategory(40, ADULTO).label).toBe('Obesidade grau III')
  })

  it('marca só a faixa normal como tom normal', () => {
    expect(bmiCategory(22, ADULTO).tone).toBe('normal')
    expect(bmiCategory(17, ADULTO).tone).toBe('warn')
    expect(bmiCategory(27, ADULTO).tone).toBe('warn')
  })

  // Dos 5 aos 19 anos a OMS classifica pela curva de idade; o corte de adulto
  // chamava de "Peso normal" a criança com sobrepeso pela curva.
  it('não aplica a faixa adulta abaixo de 18 anos', () => {
    expect(bmiCategory(23, 12)).toEqual({ label: 'Sem classificação adulta (menor de 18 anos)', tone: 'none' })
    expect(bmiCategory(23, 17).tone).toBe('none')
    expect(bmiCategory(23, 18).label).toBe('Peso normal')
  })

  it('não classifica quando a idade é desconhecida', () => {
    expect(bmiCategory(23, null)).toEqual({ label: 'Sem classificação (idade não informada)', tone: 'none' })
  })
})

describe('assessmentAgeYears', () => {
  it('usa a idade gravada no cálculo quando existe', () => {
    expect(assessmentAgeYears(16, '1990-01-01', '2026-01-01')).toBe(16)
  })

  it('sem snapshot, usa a idade na data da coleta, e não hoje', () => {
    expect(assessmentAgeYears(null, '2010-06-15', '2026-06-14')).toBe(15)
    expect(assessmentAgeYears(undefined, '2010-06-15', '2026-06-15')).toBe(16)
    expect(assessmentAgeYears(null, null, '2026-06-15')).toBeNull()
  })
})
