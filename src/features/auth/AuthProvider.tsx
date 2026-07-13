import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { clearPersistedAuthSession, supabase } from '../../lib/supabase'
import { AuthContext, type AuthContextValue, type MfaStatus } from './context'
import type { AuthStatus } from '../../lib/routing'
import {
  clearPrivateClientState,
  identityChanged,
  setPrivateClientScope,
} from './clientPrivacy'
import { mfaStatusFromAssurance } from './mfa'

// Sobrevive ao unmount deliberado na rota publica /a. Assim, ao voltar para
// a area autenticada, uma troca de conta ocorrida em outra aba ainda limpa o
// QueryClient e todo estado privado da identidade anterior.
let lastObservedUserId: string | null | undefined

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [isRecovering, setIsRecovering] = useState(false)
  const [mfaStatus, setMfaStatus] = useState<MfaStatus>('unknown')
  const [mfaError, setMfaError] = useState<string | null>(null)
  const mfaAttempt = useRef(0)

  // Falha ao consultar AAL nunca libera o shell. O usuario recebe uma acao de
  // retry; apenas uma resposta valida do Supabase muda unknown para ok/required.
  const refreshMfa = useCallback(async () => {
    const attempt = ++mfaAttempt.current
    setMfaStatus('unknown')
    setMfaError(null)
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (attempt !== mfaAttempt.current) return
      if (error || !data) {
        setMfaError('Não foi possível verificar a segurança da sessão.')
        return
      }
      const nextStatus = mfaStatusFromAssurance(data)
      if (nextStatus === 'unknown') {
        setMfaError('O servidor devolveu um estado de segurança inesperado.')
        return
      }
      setMfaStatus(nextStatus)
    } catch {
      if (attempt === mfaAttempt.current) {
        setMfaError('Não foi possível verificar a segurança da sessão.')
      }
    }
  }, [])

  const applySession = useCallback(
    (newSession: Session | null) => {
      const nextUserId = newSession?.user.id ?? null
      if (identityChanged(lastObservedUserId, nextUserId)) {
        clearPrivateClientState(queryClient)
      }
      lastObservedUserId = nextUserId
      // O org sera acrescentado pela fronteira dentro de OrganizationProvider.
      setPrivateClientScope(nextUserId, null)
      setSession(newSession)
      setStatus(newSession ? 'signedIn' : 'signedOut')
      if (newSession) {
        void refreshMfa()
      } else {
        ++mfaAttempt.current
        setMfaError(null)
        setMfaStatus('ok')
      }
    },
    [queryClient, refreshMfa]
  )

  useEffect(() => {
    let active = true
    let authEventSeen = false

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventSeen) return
      if (error) {
        applySession(null)
        return
      }
      applySession(data.session)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!active) return
      authEventSeen = true
      if (event === 'PASSWORD_RECOVERY') setIsRecovering(true)
      if (event === 'SIGNED_OUT') setIsRecovering(false)
      applySession(newSession)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [applySession])

  const signOut = useCallback(async () => {
    // Limpa imediatamente mesmo se a rede falhar; dados de outra conta nunca
    // podem permanecer visiveis enquanto o SDK conclui o logout.
    clearPrivateClientState(queryClient)
    setPrivateClientScope(null, null)
    applySession(null)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        // O SDK tambem consulta o endpoint no scope local. Remover pela chave
        // configurada garante o logout offline e no reload; o ticker normal
        // passa a observar que nao existe mais sessao persistida.
        clearPersistedAuthSession()
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
      }
    } finally {
      setIsRecovering(false)
      setMfaError(null)
      setMfaStatus('ok')
    }
  }, [applySession, queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      isRecovering,
      mfaStatus,
      refreshMfa,
      signOut,
    }),
    [status, session, isRecovering, mfaStatus, refreshMfa, signOut]
  )

  const blockedByMfaCheck = status === 'signedIn' && mfaStatus === 'unknown' && mfaError

  return (
    <AuthContext.Provider value={value}>
      {blockedByMfaCheck ? (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{mfaError}</p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => void refreshMfa()}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Tentar de novo
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  )
}
