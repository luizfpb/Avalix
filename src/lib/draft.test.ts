// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllPrivateDrafts,
  clearDraft,
  loadDraft,
  purgeExpiredDrafts,
  saveDraft,
  setPrivateDraftScope,
  startDraftHousekeeping,
} from './draft'

const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  setPrivateDraftScope('user-a', 'org-a')
  vi.useRealTimers()
})

describe('draft privado do profissional', () => {
  it('salva e recupera somente dentro do mesmo usuario e organizacao', () => {
    saveDraft('t1', { a: 1 })
    expect(loadDraft('t1')).toEqual({ a: 1 })

    setPrivateDraftScope('user-b', 'org-a')
    expect(loadDraft('t1')).toBeNull()
    setPrivateDraftScope('user-a', 'org-b')
    expect(loadDraft('t1')).toBeNull()
    setPrivateDraftScope('user-a', 'org-a')
    expect(loadDraft('t1')).toEqual({ a: 1 })
  })

  it('se recusa a persistir sem escopo completo', () => {
    setPrivateDraftScope('user-a', null)
    saveDraft('sem-dono', { saude: true })
    expect(localStorage.length).toBe(0)
    expect(loadDraft('sem-dono')).toBeNull()
  })

  it('expira em 24h e remove fisicamente', () => {
    const t0 = 1_000_000
    saveDraft('t2', { a: 1 }, t0)
    expect(loadDraft('t2', t0 + DAY - 1)).toEqual({ a: 1 })
    expect(loadDraft('t2', t0 + DAY + 1)).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('clear e logout removem rascunhos privados e legados', () => {
    saveDraft('t3', { a: 1 })
    clearDraft('t3')
    expect(loadDraft('t3')).toBeNull()

    saveDraft('t4', { a: 2 })
    localStorage.setItem('avalix:draft:legado', '{"savedAt":1,"data":{}}')
    clearAllPrivateDrafts()
    expect(localStorage.length).toBe(0)
    expect(loadDraft('t4')).toBeNull()
  })

  it('purge remove conteudo corrompido e chaves antigas sem dono', () => {
    localStorage.setItem('avalix:draft:private:user-a:org-a:lixo', '{lixo')
    localStorage.setItem('avalix:draft:antigo', JSON.stringify({ savedAt: Date.now(), data: 1 }))
    localStorage.setItem('outra-chave', 'fica')
    purgeExpiredDrafts()
    expect(localStorage.getItem('avalix:draft:private:user-a:org-a:lixo')).toBeNull()
    expect(localStorage.getItem('avalix:draft:antigo')).toBeNull()
    expect(localStorage.getItem('outra-chave')).toBe('fica')
  })

  it('housekeeping purga no bootstrap e periodicamente', () => {
    vi.useFakeTimers()
    const now = Date.now()
    saveDraft('velho', { a: 1 }, now - DAY - 1)
    const stop = startDraftHousekeeping(1_000)
    expect(localStorage.length).toBe(0)
    stop()
  })
})

describe('draft publico', () => {
  it('usa apenas sessionStorage e isola chaves de links diferentes', () => {
    saveDraft('intake:fingerprint-a', { a: 1 }, 1_000, { storage: 'session' })
    expect(localStorage.length).toBe(0)
    expect(loadDraft('intake:fingerprint-a', 1_001, { storage: 'session' })).toEqual({ a: 1 })
    expect(loadDraft('intake:fingerprint-b', 1_001, { storage: 'session' })).toBeNull()
  })

  it('expira mais cedo e clear nao depende do escopo profissional', () => {
    const t0 = 1_000
    saveDraft('publico', { a: 1 }, t0, { storage: 'session' })
    expect(loadDraft('publico', t0 + 2 * 60 * 60 * 1000 + 1, { storage: 'session' })).toBeNull()
    saveDraft('publico', { a: 1 }, t0, { storage: 'session' })
    clearDraft('publico', { storage: 'session' })
    expect(sessionStorage.length).toBe(0)
  })
})
