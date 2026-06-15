import { describe, it, expect } from 'vitest'
import { sha256Hex } from './hash'

describe('sha256Hex', () => {
  it('bate com os vetores conhecidos de SHA-256', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })

  it('é determinístico e sensível a qualquer mudança no texto', async () => {
    const a = await sha256Hex('texto de consentimento')
    const b = await sha256Hex('texto de consentimento')
    const c = await sha256Hex('texto de consentimento ')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toHaveLength(64)
  })
})
