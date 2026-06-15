import { describe, it, expect } from 'vitest'
import { CONSENT_VERSION, consentText, consentContent } from './text'
import { sha256Hex } from '../../lib/hash'

describe('consentimento', () => {
  it('tem versão não vazia e texto substancial', () => {
    expect(CONSENT_VERSION).toMatch(/\S/)
    expect(consentText('Clínica X').length).toBeGreaterThan(200)
  })

  it('embute o nome do Controlador no texto', () => {
    expect(consentText('Estúdio Corpo & Movimento')).toContain('Estúdio Corpo & Movimento')
  })

  it('usa fallback genérico quando não há nome', () => {
    const text = consentText('')
    expect(text).toContain('o profissional ou a organização responsável')
    expect(text).toContain('Controlador')
  })

  it('cobre os pontos mínimos de LGPD (base legal, revogação, responsável)', () => {
    const text = consentText('Clínica X')
    expect(text).toMatch(/LGPD/)
    expect(text).toMatch(/revogar/i)
    expect(text).toMatch(/respons[áa]vel legal/i)
  })

  it('hash é estável por nome e muda quando o nome muda', async () => {
    const a1 = await sha256Hex(consentText('Org A'))
    const a2 = await sha256Hex(consentText('Org A'))
    const b = await sha256Hex(consentText('Org B'))
    expect(a1).toBe(a2)
    expect(a1).not.toBe(b)
    expect(a1).toHaveLength(64)
  })

  it('consentContent devolve versão e texto renderizado', () => {
    expect(consentContent('Org A')).toEqual({
      version: CONSENT_VERSION,
      text: consentText('Org A'),
    })
  })
})
