// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveIntakeLinkLocal,
  loadIntakeLinkLocal,
  clearIntakeLinkLocal,
  purgeExpiredIntakeLinks,
} from './linkStore'

const NOW = new Date('2026-07-07T12:00:00Z').getTime()
const FUTURE = new Date('2026-07-14T12:00:00Z').toISOString()
const PAST = new Date('2026-07-01T12:00:00Z').toISOString()

beforeEach(() => localStorage.clear())

describe('linkStore (URL do convite por aparelho)', () => {
  it('salva e recupera enquanto o convite não expirou', () => {
    saveIntakeLinkLocal('i1', 'https://app/a/tok', FUTURE)
    expect(loadIntakeLinkLocal('i1', NOW)).toBe('https://app/a/tok')
  })

  it('expirado some (e é removido do storage)', () => {
    saveIntakeLinkLocal('i2', 'https://app/a/tok', PAST)
    expect(loadIntakeLinkLocal('i2', NOW)).toBeNull()
    expect(localStorage.getItem('avalix:intakelink:i2')).toBeNull()
  })

  it('clear remove (cancelamento do convite)', () => {
    saveIntakeLinkLocal('i3', 'https://app/a/tok', FUTURE)
    clearIntakeLinkLocal('i3')
    expect(loadIntakeLinkLocal('i3', NOW)).toBeNull()
  })

  it('purge limpa vencidos/corrompidos e preserva vivos e chaves alheias', () => {
    saveIntakeLinkLocal('velho', 'https://a', PAST)
    saveIntakeLinkLocal('vivo', 'https://b', FUTURE)
    localStorage.setItem('avalix:intakelink:lixo', '{quebrado')
    localStorage.setItem('outra-coisa', 'fica')
    purgeExpiredIntakeLinks(NOW)
    expect(localStorage.getItem('avalix:intakelink:velho')).toBeNull()
    expect(localStorage.getItem('avalix:intakelink:lixo')).toBeNull()
    expect(loadIntakeLinkLocal('vivo', NOW)).toBe('https://b')
    expect(localStorage.getItem('outra-coisa')).toBe('fica')
  })
})
