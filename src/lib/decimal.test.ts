import { describe, expect, it } from 'vitest'
import { normalizeDecimalInput } from './decimal'

describe('normalizeDecimalInput', () => {
  it('aceita a vírgula do teclado brasileiro sem perder a casa decimal', () => {
    // Com type="number", conforme a versão do iOS, a vírgula era descartada e
    // "12,5" chegava como "125" — ou o campo ficava vazio.
    expect(normalizeDecimalInput('12,5')).toBe('12.5')
    expect(Number(normalizeDecimalInput('12,5'))).toBe(12.5)
    expect(normalizeDecimalInput('42.5')).toBe('42.5')
  })

  it('preserva os estados intermediários da digitação', () => {
    expect(normalizeDecimalInput('')).toBe('')
    expect(normalizeDecimalInput('12,')).toBe('12.')
    expect(normalizeDecimalInput(',5')).toBe('.5')
    expect(Number(normalizeDecimalInput(',5'))).toBe(0.5)
  })

  it('descarta o que não é número e separadores repetidos', () => {
    expect(normalizeDecimalInput('12,5 kg')).toBe('12.5')
    expect(normalizeDecimalInput('1.2.3')).toBe('1.23')
    expect(normalizeDecimalInput('abc')).toBe('')
  })

  it('mantém o sinal negativo para a validação recusar, em vez de inverter a medida', () => {
    expect(normalizeDecimalInput('-3')).toBe('-3')
    expect(normalizeDecimalInput('-2,5')).toBe('-2.5')
    expect(normalizeDecimalInput('-')).toBe('-')
    expect(normalizeDecimalInput('3-')).toBe('3')
  })
})
