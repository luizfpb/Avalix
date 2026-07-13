// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllIntakeLinksLocal,
  clearIntakeLinkLocal,
  loadIntakeLinkLocal,
  purgeExpiredIntakeLinks,
  saveIntakeLinkLocal,
  setIntakeLinkScope,
} from './linkStore'

const NOW = Date.parse('2026-01-01T00:00:00Z')
const FUTURE = '2026-01-02T00:00:00Z'
const PAST = '2025-12-31T00:00:00Z'
const TOKEN = 'a'.repeat(43)

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  localStorage.clear()
  setIntakeLinkScope('user-a', 'org-a')
})

afterEach(() => vi.restoreAllMocks())

describe('link local de intake', () => {
  it('salva no escopo e normaliza token legado do path para fragmento', () => {
    saveIntakeLinkLocal('i1', `http://localhost:3000/a/${TOKEN}`, FUTURE)
    expect(loadIntakeLinkLocal('i1', NOW)).toBe(`http://localhost:3000/a#${TOKEN}`)
    setIntakeLinkScope('user-b', 'org-a')
    expect(loadIntakeLinkLocal('i1', NOW)).toBeNull()
  })

  it('nao salva sem dono, origem estranha ou token invalido', () => {
    setIntakeLinkScope(null, null)
    saveIntakeLinkLocal('i1', `http://localhost:3000/a#${TOKEN}`, FUTURE)
    setIntakeLinkScope('user-a', 'org-a')
    saveIntakeLinkLocal('i2', `https://evil.example/a#${TOKEN}`, FUTURE)
    saveIntakeLinkLocal('i3', 'http://localhost:3000/a#curto', FUTURE)
    expect(localStorage.length).toBe(0)
  })

  it('descarta link legado sem atribui-lo ao usuario atual', () => {
    localStorage.setItem(
      'avalix:intakelink:legado',
      JSON.stringify({ url: `http://localhost:3000/a#${TOKEN}`, expiresAt: FUTURE })
    )
    setIntakeLinkScope('user-b', 'org-b')
    expect(loadIntakeLinkLocal('legado', NOW)).toBeNull()
    expect(localStorage.getItem('avalix:intakelink:legado')).toBeNull()
  })

  it('remove expirado ao ler', () => {
    saveIntakeLinkLocal('i2', `http://localhost:3000/a#${TOKEN}`, PAST)
    expect(loadIntakeLinkLocal('i2', NOW)).toBeNull()
  })

  it('limpa um link e todos os links no logout', () => {
    saveIntakeLinkLocal('i3', `http://localhost:3000/a#${TOKEN}`, FUTURE)
    clearIntakeLinkLocal('i3')
    expect(loadIntakeLinkLocal('i3', NOW)).toBeNull()

    saveIntakeLinkLocal('i4', `http://localhost:3000/a#${TOKEN}`, FUTURE)
    localStorage.setItem('outra', 'fica')
    clearAllIntakeLinksLocal()
    expect(localStorage.getItem('outra')).toBe('fica')
    expect([...Array(localStorage.length)].some((_, i) => localStorage.key(i)?.startsWith('avalix:intakelink:'))).toBe(false)
  })

  it('purge remove vencidos e preserva vivos e chaves alheias', () => {
    saveIntakeLinkLocal('velho', `http://localhost:3000/a#${TOKEN}`, PAST)
    saveIntakeLinkLocal('vivo', `http://localhost:3000/a#${TOKEN}`, FUTURE)
    localStorage.setItem('outra-chave', 'fica')
    purgeExpiredIntakeLinks(NOW)
    expect(loadIntakeLinkLocal('velho', NOW)).toBeNull()
    expect(loadIntakeLinkLocal('vivo', NOW)).toBe(`http://localhost:3000/a#${TOKEN}`)
    expect(localStorage.getItem('outra-chave')).toBe('fica')
  })
})
