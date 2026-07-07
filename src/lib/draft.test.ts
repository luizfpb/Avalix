// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { saveDraft, loadDraft, clearDraft, purgeExpiredDrafts } from './draft'

const DAY = 24 * 60 * 60 * 1000

beforeEach(() => localStorage.clear())

describe('draft (rascunho local)', () => {
  it('salva e recupera', () => {
    saveDraft('t1', { a: 1, b: 'x' })
    expect(loadDraft('t1')).toEqual({ a: 1, b: 'x' })
  })

  it('expira em 24h (e remove o vencido)', () => {
    const t0 = 1_000_000
    saveDraft('t2', { a: 1 }, t0)
    expect(loadDraft('t2', t0 + DAY - 1)).toEqual({ a: 1 })
    expect(loadDraft('t2', t0 + DAY + 1)).toBeNull()
    // segunda leitura confirma que foi removido do storage
    expect(localStorage.getItem('avalix:draft:t2')).toBeNull()
  })

  it('clearDraft remove', () => {
    saveDraft('t3', { a: 1 })
    clearDraft('t3')
    expect(loadDraft('t3')).toBeNull()
  })

  it('conteúdo corrompido no storage não quebra', () => {
    localStorage.setItem('avalix:draft:t4', '{lixo')
    expect(loadDraft('t4')).toBeNull()
  })

  it('purgeExpiredDrafts limpa só os vencidos (e ignora chaves alheias)', () => {
    const t0 = 1_000_000
    saveDraft('velho', { a: 1 }, t0)
    saveDraft('novo', { a: 2 }, t0 + DAY)
    localStorage.setItem('outra-chave', 'fica')
    purgeExpiredDrafts(t0 + DAY + 1)
    expect(loadDraft('velho', t0 + DAY + 1)).toBeNull()
    expect(loadDraft('novo', t0 + DAY + 1)).toEqual({ a: 2 })
    expect(localStorage.getItem('outra-chave')).toBe('fica')
  })
})
