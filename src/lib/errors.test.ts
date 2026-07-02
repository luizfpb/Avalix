import { describe, it, expect } from 'vitest'
import { normalizeAuthError, normalizeDbError } from './errors'

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

describe('normalizeDbError', () => {
  it('traduz violação de RLS (mensagem ou code 42501)', () => {
    expect(
      normalizeDbError({ message: 'new row violates row-level security policy for table "x"' })
    ).toMatch(/consentimento|permissão/i)
    expect(normalizeDbError({ code: '42501', message: 'permission denied' })).toMatch(/permissão/i)
  })
  it('traduz unique e foreign key', () => {
    expect(normalizeDbError({ code: '23505', message: 'duplicate key value' })).toMatch(/já existe/i)
    expect(
      normalizeDbError({ code: '23503', message: 'violates foreign key constraint' })
    ).toMatch(/em uso/i)
  })
  it('traduz falha de rede', () => {
    expect(normalizeDbError({ message: 'Failed to fetch' })).toMatch(/conexão/i)
  })
  it('deixa passar exceção pt-BR dos nossos triggers', () => {
    const msg = 'registro de consentimento e imutavel; apenas revoked_at pode ser alterado'
    expect(normalizeDbError({ message: msg })).toBe(msg)
  })
  it('tem fallback genérico', () => {
    expect(normalizeDbError(null)).toMatch(/errado/i)
  })
})
