// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveDraft } from '../../lib/draft'
import { saveIntakeLinkLocal } from '../anamnesis/linkStore'

vi.mock('../../lib/errlog', () => ({ setErrlogOrg: vi.fn() }))

import {
  classifySessionTransition,
  clearPrivateClientState,
  identityChanged,
  setPrivateClientScope,
} from './clientPrivacy'
import { loadDraft } from '../../lib/draft'

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

  it('separa revalidacao da mesma identidade de troca real de conta', () => {
    // O supabase-js reemite SIGNED_IN a cada volta do app ao primeiro plano.
    expect(classifySessionTransition('user-a', 'user-a')).toBe('revalidated')
    // Bootstrap ainda precisa resolver o AAL antes de liberar o shell.
    expect(classifySessionTransition(undefined, 'user-a')).toBe('newIdentity')
    expect(classifySessionTransition('user-a', 'user-b')).toBe('newIdentity')
    expect(classifySessionTransition('user-a', null)).toBe('signedOut')
    expect(classifySessionTransition(undefined, null)).toBe('signedOut')
  })

  it('revalidacao preserva o rascunho legivel; troca de conta o torna inacessivel', () => {
    saveDraft('avaliacao', { peso: 82 })
    expect(loadDraft('avaliacao')).toEqual({ peso: 82 })

    // Caminho da revalidacao: o escopo completo NAO e mexido (regressao do bug
    // em que voltar do WhatsApp desligava o autosave ate o proximo reload).
    expect(classifySessionTransition('user-a', 'user-a')).toBe('revalidated')
    expect(loadDraft('avaliacao')).toEqual({ peso: 82 })
    saveDraft('avaliacao', { peso: 83 })
    expect(loadDraft('avaliacao')).toEqual({ peso: 83 })

    // Caminho da identidade nova: escopo sem org derruba leitura e escrita.
    setPrivateClientScope('user-b', null)
    expect(loadDraft('avaliacao')).toBeNull()
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
