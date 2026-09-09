// @vitest-environment jsdom
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRecoveryFlow, updateRecoveryFlow } from './recovery'

const userId = '10000000-0000-0000-0000-000000000001'
const firstId = '20000000-0000-0000-0000-000000000001'
const otherId = '20000000-0000-0000-0000-000000000002'
function session(id = firstId, user = userId, extra = {}): Session {
  return { user: { id: user }, access_token: `header.${btoa(JSON.stringify({ sub: user, session_id: id, ...extra }))}.signature` } as Session
}
beforeEach(clearRecoveryFlow)
afterEach(() => { vi.restoreAllMocks(); clearRecoveryFlow() })

describe('etapa de recuperação vinculada à sessão', () => {
  it('restaura o marcador persistido após reinicializar o módulo no reload', async () => {
    updateRecoveryFlow(session(), 'PASSWORD_RECOVERY')
    vi.resetModules()
    const reloaded = await import('./recovery')
    expect(reloaded.updateRecoveryFlow(session(), 'INITIAL_SESSION')).toBe(true)
    reloaded.clearRecoveryFlow()
  })
  it('restaura na mesma sessão e aceita refresh do token sem renovar o prazo', () => {
    expect(updateRecoveryFlow(session(), 'PASSWORD_RECOVERY', 1000)).toBe(true)
    expect(updateRecoveryFlow(session(), 'INITIAL_SESSION', 2000)).toBe(true)
    expect(updateRecoveryFlow(session(firstId, userId, { iat: 5000 }), 'TOKEN_REFRESHED', 3000)).toBe(true)
    expect(updateRecoveryFlow(session(), 'INITIAL_SESSION', 3_601_000)).toBe(false)
  })
  it('outro login da mesma pessoa não herda a recuperação', () => {
    updateRecoveryFlow(session(), 'PASSWORD_RECOVERY')
    expect(updateRecoveryFlow(session(otherId), 'SIGNED_IN')).toBe(false)
    expect(updateRecoveryFlow(session(), 'INITIAL_SESSION')).toBe(false)
  })
  it('logout e troca de conta removem o marcador', () => {
    updateRecoveryFlow(session(), 'PASSWORD_RECOVERY')
    expect(updateRecoveryFlow(session(firstId, 'outro-usuario'), 'SIGNED_IN')).toBe(false)
    updateRecoveryFlow(session(), 'PASSWORD_RECOVERY')
    expect(updateRecoveryFlow(null, 'SIGNED_OUT')).toBe(false)
    expect(updateRecoveryFlow(session(), 'INITIAL_SESSION')).toBe(false)
  })
  it('não inicia recuperação só por existir uma sessão ou um JWT ilegível', () => {
    expect(updateRecoveryFlow(session(), 'INITIAL_SESSION')).toBe(false)
    expect(updateRecoveryFlow({ ...session(), access_token: 'invalido' }, 'INITIAL_SESSION')).toBe(false)
  })
  it('não aceita claims de outra identidade e descarta prazo no futuro', () => {
    updateRecoveryFlow(session(), 'PASSWORD_RECOVERY', 100_000)
    expect(updateRecoveryFlow(session(), 'INITIAL_SESSION', 1)).toBe(false)
    updateRecoveryFlow(session(), 'PASSWORD_RECOVERY')
    expect(updateRecoveryFlow(session(firstId, userId, { sub: 'outra-pessoa' }), 'INITIAL_SESSION')).toBe(false)
  })
  it('mantém o fluxo atual se o navegador não permite sessionStorage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') })
    expect(updateRecoveryFlow(session(), 'PASSWORD_RECOVERY')).toBe(true)
    expect(updateRecoveryFlow(session(), 'TOKEN_REFRESHED')).toBe(true)
  })
})
