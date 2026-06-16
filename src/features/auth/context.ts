import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { AuthStatus } from '../../lib/routing'

// 'unknown' enquanto o AAL ainda não foi checado na sessão atual; 'required'
// quando há 2FA pendente (aal1 -> aal2); 'ok' caso contrário.
export type MfaStatus = 'unknown' | 'required' | 'ok'

export interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  user: User | null
  isRecovering: boolean
  mfaStatus: MfaStatus
  refreshMfa: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.')
  return ctx
}
