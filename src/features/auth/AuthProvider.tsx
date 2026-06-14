import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { AuthContext, type AuthContextValue } from './context'
import type { AuthStatus } from '../../lib/routing'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [isRecovering, setIsRecovering] = useState(false)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setStatus(data.session ? 'signedIn' : 'signedOut')
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY') setIsRecovering(true)
      if (event === 'SIGNED_OUT') setIsRecovering(false)
      setSession(newSession)
      setStatus(newSession ? 'signedIn' : 'signedOut')
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      isRecovering,
      signOut: async () => {
        await supabase.auth.signOut()
        setIsRecovering(false)
      },
    }),
    [status, session, isRecovering]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
