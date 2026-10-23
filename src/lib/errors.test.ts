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
  it('traduz o prazo estourado como falha de conexão, sem mostrar o erro cru', () => {
    expect(normalizeDbError({ message: 'AbortError: signal is aborted without reason' })).toMatch(/conexão/i)
    expect(normalizeDbError({ message: 'AbortError: The operation was aborted.' })).toMatch(/conexão/i)
  })
  it('deixa passar exceção pt-BR dos nossos triggers', () => {
    const msg = 'registro de consentimento e imutavel; apenas revoked_at pode ser alterado'
    expect(normalizeDbError({ message: msg })).toBe(msg)
  })
  it('tem fallback genérico', () => {
    expect(normalizeDbError(null)).toMatch(/errado/i)
  })
  // Campo que a tela deixa passar e o banco recusa (telefone curto, título
  // longo, duração fracionada) chegava ao usuário com o texto do Postgres.
  it('traduz o CHECK e o tipo inválido do Postgres, sem nome de constraint', () => {
    const check = normalizeDbError({
      code: '23514',
      message: 'new row for relation "appointments" violates check constraint "appointments_title_check"',
    })
    expect(check).toMatch(/fora do permitido/i)
    expect(check).not.toMatch(/constraint|relation/i)
    const tipo = normalizeDbError({ code: '22P02', message: 'invalid input syntax for type integer: "7.5"' })
    expect(tipo).toMatch(/fora do permitido/i)
    expect(normalizeDbError({ code: '22003', message: 'numeric field overflow' })).toMatch(/fora do permitido/i)
  })
  it('mantém a mensagem pt-BR que os nossos gatilhos levantam com 23514', () => {
    const msg = 'A sequência semanal contém uma divisão que não existe neste plano.'
    expect(normalizeDbError({ code: '23514', message: msg })).toBe(msg)
  })
})
