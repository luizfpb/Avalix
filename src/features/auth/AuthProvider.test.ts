import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { mfa: { getAuthenticatorAssuranceLevel: vi.fn() } },
  },
}))

import { mfaStatusFromAssurance } from './mfa'

describe('decisao de MFA', () => {
  it('exige desafio somente quando aal2 esta pendente', () => {
    expect(
      mfaStatusFromAssurance({ currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] })
    ).toBe('required')
    expect(
      mfaStatusFromAssurance({ currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] })
    ).toBe('ok')
    expect(
      mfaStatusFromAssurance({ currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] })
    ).toBe('ok')
    expect(
      mfaStatusFromAssurance({ currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] })
    ).toBe('unknown')
  })
})
