// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))

import {
  consumePublicIntakeToken,
  intakeDraftFingerprint,
  isValidIntakeToken,
} from './intake'

const TOKEN = 'Ab_'.repeat(14) + 'Z'

describe('capability token do intake publico', () => {
  it('aceita apenas o token base64url de 256 bits', () => {
    expect(TOKEN).toHaveLength(43)
    expect(isValidIntakeToken(TOKEN)).toBe(true)
    expect(isValidIntakeToken(`${TOKEN}=`)).toBe(false)
    expect(isValidIntakeToken('curto')).toBe(false)
  })

  it('consome fragmento e o apaga imediatamente da URL', () => {
    const replaceState = vi.fn()
    const token = consumePublicIntakeToken(
      { pathname: '/a', hash: `#${TOKEN}`, search: '' },
      { state: { x: 1 }, replaceState }
    )
    expect(token).toBe(TOKEN)
    expect(replaceState).toHaveBeenCalledWith({ x: 1 }, '', '/a')
  })

  it('migra o path legado sem conservar o segredo no historico', () => {
    const replaceState = vi.fn()
    expect(
      consumePublicIntakeToken(
        { pathname: `/a/${TOKEN}`, hash: '', search: '' },
        { state: null, replaceState }
      )
    ).toBe(TOKEN)
    expect(replaceState).toHaveBeenCalledWith(null, '', '/a')
  })

  it('nao devolve token invalido, mas ainda higieniza a URL', () => {
    const replaceState = vi.fn()
    expect(
      consumePublicIntakeToken(
        { pathname: '/a/invalido', hash: '', search: '?token=segredo' },
        { state: null, replaceState }
      )
    ).toBeNull()
    expect(replaceState).toHaveBeenCalledWith(null, '', '/a')
  })

  it('gera fingerprints diferentes sem incluir o token', () => {
    const other = `B${TOKEN.slice(1)}`
    const fingerprint = intakeDraftFingerprint(TOKEN)
    expect(fingerprint).toMatch(/^[a-f0-9]{16}$/)
    expect(fingerprint).not.toContain(TOKEN.slice(0, 8))
    expect(intakeDraftFingerprint(other)).not.toBe(fingerprint)
  })
})
