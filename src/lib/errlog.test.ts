import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

import { sanitizeClientErrorText, sanitizedClientPath } from './errlog'

describe('higienizacao do log do cliente', () => {
  const token = 'Ab_'.repeat(14) + 'Z'

  it('remove capability token de path, fragmento e query', () => {
    const input = `falhou em /a/${token}, depois /a#${token}?token=${token}`
    const output = sanitizeClientErrorText(input, 600)
    expect(output).not.toContain(token)
    expect(output).toContain('[redacted]')
  })

  it('reduz qualquer rota publica ao path sem segredo', () => {
    expect(sanitizedClientPath(`/a/${token}`)).toBe('/a')
    expect(sanitizedClientPath('/agenda')).toBe('/agenda')
  })

  it('remove tokens de auth em fragmento e query (callback OAuth/recuperacao)', () => {
    const secret = 'x'.repeat(48)
    const input =
      `erro em https://app/auth#access_token=${secret}&refresh_token=${secret}` +
      `&id_token=${secret}&provider_token=${secret}&code=${secret}?apikey=${secret}`
    const output = sanitizeClientErrorText(input, 600)
    expect(output).not.toContain(secret)
    expect(output).toContain('[redacted]')
  })
})
