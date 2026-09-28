import { describe, it, expect } from 'vitest'
import { classifyBodyFat } from './bodyFat'

const ADULTO = 30

describe('classifyBodyFat (faixas ACE)', () => {
  it('classifica homens', () => {
    expect(classifyBodyFat('M', 4, ADULTO).label).toBe('Gordura essencial')
    expect(classifyBodyFat('M', 10, ADULTO).label).toBe('Atleta')
    expect(classifyBodyFat('M', 16, ADULTO).label).toBe('Bom (fitness)')
    expect(classifyBodyFat('M', 22, ADULTO).label).toBe('Aceitável')
    expect(classifyBodyFat('M', 30, ADULTO).label).toBe('Obesidade')
  })

  it('classifica mulheres', () => {
    expect(classifyBodyFat('F', 12, ADULTO).label).toBe('Gordura essencial')
    expect(classifyBodyFat('F', 18, ADULTO).label).toBe('Atleta')
    expect(classifyBodyFat('F', 23, ADULTO).label).toBe('Bom (fitness)')
    expect(classifyBodyFat('F', 28, ADULTO).label).toBe('Aceitável')
    expect(classifyBodyFat('F', 35, ADULTO).label).toBe('Obesidade')
  })

  it('marca essencial como low e obesidade como warn', () => {
    expect(classifyBodyFat('M', 4, ADULTO).tone).toBe('low')
    expect(classifyBodyFat('F', 35, ADULTO).tone).toBe('warn')
    expect(classifyBodyFat('M', 16, ADULTO).tone).toBe('normal')
  })

  it('não usa as faixas de adulto abaixo de 18 anos nem sem idade', () => {
    expect(classifyBodyFat('F', 28, 14)).toEqual({
      label: 'Sem classificação adulta (menor de 18 anos)', tone: 'none',
    })
    expect(classifyBodyFat('M', 22, null).tone).toBe('none')
    expect(classifyBodyFat('M', 22, 18).label).toBe('Aceitável')
  })
})
