import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { AuthContext, type AuthContextValue, type MfaStatus } from './context'
import type { AuthStatus } from '../../lib/routing'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [isRecovering, setIsRecovering] = useState(false)
  const [mfaStatus, setMfaStatus] = useState<MfaStatus>('unknown')

  // Lê o nível de garantia (AAL) da sessão. aal1 com nextLevel aal2 = 2FA
  // pendente. Em erro, não bloqueia o usuário (degrada para 'ok').
  const refreshMfa = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (error || !data) {
        setMfaStatus('ok')
        return
      }
      setMfaStatus(
        data.currentLevel === 'aal1' && data.nextLevel === 'aal2' ? 'required' : 'ok'
      )
    } catch {
      setMfaStatus('ok')
    }
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setStatus(data.session ? 'signedIn' : 'signedOut')
      if (data.session) void refreshMfa()
      else setMfaStatus('ok')
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY') setIsRecovering(true)
      if (event === 'SIGNED_OUT') setIsRecovering(false)
      setSession(newSession)
      setStatus(newSession ? 'signedIn' : 'signedOut')
      if (newSession) void refreshMfa()
      else setMfaStatus('ok')
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [refreshMfa])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      isRecovering,
      mfaStatus,
      refreshMfa,
      signOut: async () => {
        await supabase.auth.signOut()
        setIsRecovering(false)
        setMfaStatus('ok')
      },
    }),
    [status, session, isRecovering, mfaStatus, refreshMfa]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
