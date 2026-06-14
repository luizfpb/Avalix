import { describe, it, expect } from 'vitest'
import { normalizeAuthError } from './errors'

describe('normalizeAuthError', () => {
  it('mapeia code invalid_credentials', () => {
    expect(normalizeAuthError({ code: 'invalid_credentials' })).toMatch(/incorretos/i)
  })
  it('mapeia email_not_confirmed', () => {
    expect(normalizeAuthError({ code: 'email_not_confirmed' })).toMatch(/confirme/i)
  })
  it('cai para o texto quando não há code', () => {
    expect(normalizeAuthError({ message: 'Invalid login credentials' })).toMatch(/incorretos/i)
  })
  it('aceita string', () => {
    expect(normalizeAuthError('Email not confirmed')).toMatch(/confirme/i)
  })
  it('tem fallback genérico', () => {
    expect(normalizeAuthError(null)).toMatch(/errado/i)
    expect(normalizeAuthError({})).toMatch(/errado/i)
  })
  it('preserva mensagem desconhecida não vazia', () => {
    expect(normalizeAuthError({ message: 'Coisa estranha' })).toBe('Coisa estranha')
  })
})
