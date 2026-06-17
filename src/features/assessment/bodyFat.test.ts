import { describe, it, expect } from 'vitest'
import { classifyBodyFat } from './bodyFat'

describe('classifyBodyFat (faixas ACE)', () => {
  it('classifica homens', () => {
    expect(classifyBodyFat('M', 4).label).toBe('Gordura essencial')
    expect(classifyBodyFat('M', 10).label).toBe('Atleta')
    expect(classifyBodyFat('M', 16).label).toBe('Bom (fitness)')
    expect(classifyBodyFat('M', 22).label).toBe('Aceitável')
    expect(classifyBodyFat('M', 30).label).toBe('Obesidade')
  })

  it('classifica mulheres', () => {
    expect(classifyBodyFat('F', 12).label).toBe('Gordura essencial')
    expect(classifyBodyFat('F', 18).label).toBe('Atleta')
    expect(classifyBodyFat('F', 23).label).toBe('Bom (fitness)')
    expect(classifyBodyFat('F', 28).label).toBe('Aceitável')
    expect(classifyBodyFat('F', 35).label).toBe('Obesidade')
  })

  it('marca essencial como low e obesidade como warn', () => {
    expect(classifyBodyFat('M', 4).tone).toBe('low')
    expect(classifyBodyFat('F', 35).tone).toBe('warn')
    expect(classifyBodyFat('M', 16).tone).toBe('normal')
  })
})
