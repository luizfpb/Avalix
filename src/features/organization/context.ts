import { createContext, useContext } from 'react'
import type { Database } from '../../lib/database.types'

// ATENÇÃO (Ponto 1): confira estes nomes no database.types.ts (seção Tables).
// Se o TS sublinhar 'organizations' ou 'memberships', troque pelos nomes reais.
export type OrganizationRow = Database['public']['Tables']['organizations']['Row']
export type MembershipRow = Database['public']['Tables']['org_members']['Row']

export type OrgStatus = 'loading' | 'absent' | 'present' | 'error'

export interface OrganizationContextValue {
  status: OrgStatus
  organization: OrganizationRow | null
  membership: MembershipRow | null
  role: string | null
  refresh: () => Promise<void>
}

export const OrganizationContext = createContext<OrganizationContextValue | null>(null)

export function useOrganization(): OrganizationContextValue {
  const ctx = useContext(OrganizationContext)
  if (!ctx) throw new Error('useOrganization precisa estar dentro de <OrganizationProvider>.')
  return ctx
}
