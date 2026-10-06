import { describe, expect, it } from 'vitest'
import { formatPhone } from './phone'

describe('formatPhone', () => {
  it('celular e fixo com DDD, digitados de qualquer jeito', () => {
    expect(formatPhone('11999990000')).toBe('(11) 99999-0000')
    expect(formatPhone(' 11 99999 0000 ')).toBe('(11) 99999-0000')
    expect(formatPhone('(21) 3333-4444')).toBe('(21) 3333-4444')
    expect(formatPhone('2133334444')).toBe('(21) 3333-4444')
  })

  it('com o código do país', () => {
    expect(formatPhone('+55 11 99999-0000')).toBe('+55 (11) 99999-0000')
  })

  it('o que não parece telefone brasileiro aparece como foi digitado', () => {
    expect(formatPhone('+1 415 555 0100')).toBe('+1 415 555 0100')
    expect(formatPhone('9999-0000')).toBe('9999-0000')
  })

  it('vazio vira nulo', () => {
    expect(formatPhone(null)).toBeNull()
    expect(formatPhone('   ')).toBeNull()
  })
})
