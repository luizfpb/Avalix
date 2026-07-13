// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveDraft } from '../../lib/draft'
import { saveIntakeLinkLocal } from '../anamnesis/linkStore'
import {
  clearPrivateClientState,
  identityChanged,
  setPrivateClientScope,
} from './clientPrivacy'

const TOKEN = 'a'.repeat(43)

beforeEach(() => {
  localStorage.clear()
  setPrivateClientScope('user-a', 'org-a')
})

describe('fronteira de privacidade da sessao', () => {
  it('detecta logout e troca de conta, mas nao o bootstrap', () => {
    expect(identityChanged(undefined, 'user-a')).toBe(false)
    expect(identityChanged(undefined, null)).toBe(true)
    expect(identityChanged('user-a', 'user-a')).toBe(false)
    expect(identityChanged('user-a', 'user-b')).toBe(true)
    expect(identityChanged('user-a', null)).toBe(true)
  })

  it('limpa cache, drafts e capability links juntos', () => {
    const queryClient = { clear: vi.fn() }
    saveDraft('avaliacao', { dado: 'sensivel' })
    saveIntakeLinkLocal(
      'intake-a',
      `http://localhost:3000/a#${TOKEN}`,
      '2099-01-01T00:00:00Z'
    )
    expect(localStorage.length).toBe(2)

    clearPrivateClientState(queryClient)

    expect(queryClient.clear).toHaveBeenCalledOnce()
    expect(localStorage.length).toBe(0)
  })
})
