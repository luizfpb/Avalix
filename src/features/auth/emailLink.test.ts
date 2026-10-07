import { describe, expect, it } from 'vitest'
import { readEmailLink } from './emailLink'

const HASH = 'a3f1c9e07b2d4458a3f1c9e07b2d4458a3f1c9e07b2d4458a3f1c9e0'

describe('readEmailLink', () => {
  it('lê o token_hash do tipo esperado', () => {
    expect(readEmailLink(`?token_hash=${HASH}&type=recovery`, 'recovery')).toEqual({
      tokenHash: HASH,
      type: 'recovery',
    })
    expect(readEmailLink(`?type=email&token_hash=pkce_${HASH}`, 'email')).toEqual({
      tokenHash: `pkce_${HASH}`,
      type: 'email',
    })
  })

  it('ignora link de outro fluxo, sem token ou com token malformado', () => {
    expect(readEmailLink(`?token_hash=${HASH}&type=email`, 'recovery')).toBeNull()
    expect(readEmailLink('?type=recovery', 'recovery')).toBeNull()
    expect(readEmailLink('?token_hash=curto&type=recovery', 'recovery')).toBeNull()
    expect(readEmailLink(`?token_hash=${HASH}<script>&type=recovery`, 'recovery')).toBeNull()
    expect(readEmailLink('', 'recovery')).toBeNull()
  })
})
