import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { setErrlogOrg } from '../../lib/errlog'
import { useAuth } from '../auth/context'
import {
  OrganizationContext,
  type OrganizationContextValue,
  type OrganizationRow,
  type MembershipRow,
  type OrgStatus,
} from './context'

// V1 opera com uma org por usuário; se houver mais de uma membership, carrega
// a mais antiga (determinístico — sem o order, qual org abre seria loteria).
async function fetchMembership(userId: string): Promise<{
  membership: MembershipRow | null
  organization: OrganizationRow | null
}> {
  const { data, error } = await supabase
    .from('org_members')
    .select('*, organizations(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return { membership: null, organization: null }

  const row = data as MembershipRow & {
    organizations: OrganizationRow | OrganizationRow[] | null
  }
  const organization = Array.isArray(row.organizations)
    ? row.organizations[0] ?? null
    : row.organizations ?? null

  const { organizations: _ignored, ...membership } = row
  return { membership: membership as MembershipRow, organization }
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, status: authStatus } = useAuth()
  const userId = user?.id ?? null

  const query = useQuery({
    queryKey: ['organization', userId],
    queryFn: () => fetchMembership(userId as string),
    enabled: authStatus === 'signedIn' && !!userId,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  })
  const { refetch } = query

  // o log de erros (client_errors) precisa da org pra RLS; módulo fora do React
  const currentOrgId = query.data?.organization?.id ?? null
  useEffect(() => {
    setErrlogOrg(currentOrgId)
  }, [currentOrgId])

  const status: OrgStatus = useMemo(() => {
    if (authStatus !== 'signedIn') return 'absent'
    if (query.isError) return 'error'
    if (query.isPending) return 'loading'
    return query.data?.organization ? 'present' : 'absent'
  }, [authStatus, query.isError, query.isPending, query.data])

  const refresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  const value = useMemo<OrganizationContextValue>(
    () => ({
      status,
      organization: query.data?.organization ?? null,
      membership: query.data?.membership ?? null,
      role:
        (query.data?.membership as { role?: string | null } | null | undefined)?.role ?? null,
      refresh,
    }),
    [status, query.data?.organization, query.data?.membership, refresh]
  )

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>
}
