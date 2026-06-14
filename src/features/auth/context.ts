import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { AuthStatus } from '../../lib/routing'

export interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  user: User | null
  isRecovering: boolean
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.')
  return ctx
}
