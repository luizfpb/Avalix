import { describe, it, expect } from 'vitest'
import { ageFromBirthDate } from './age'

const today = new Date(2026, 5, 15) // 2026-06-15 (mês é 0-based)

describe('ageFromBirthDate', () => {
  it('conta anos completos em relação à data de referência', () => {
    expect(ageFromBirthDate('2010-06-15', today)).toBe(16) // aniversário hoje
    expect(ageFromBirthDate('2010-06-16', today)).toBe(15) // aniversário amanhã
    expect(ageFromBirthDate('2010-06-14', today)).toBe(16) // já passou
  })

  it('rejeita data malformada ou inexistente', () => {
    expect(ageFromBirthDate('2026-02-30', today)).toBeNull()
    expect(ageFromBirthDate('xx', today)).toBeNull()
    expect(ageFromBirthDate('', today)).toBeNull()
  })
})
