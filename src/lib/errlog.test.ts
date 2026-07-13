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
})
