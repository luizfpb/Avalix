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

class MembershipLoadError extends Error {
  readonly temporary: boolean

  constructor(error: unknown, status: number) {
    super('Não foi possível carregar sua organização.', { cause: error })
    this.temporary = status === 0 || status === 408 || status === 429 || status >= 500
  }
}

// V1 opera com uma org por usuário; se houver mais de uma membership, carrega
// a mais antiga (determinístico — sem o order, qual org abre seria loteria).
async function fetchMembership(userId: string): Promise<{
  membership: MembershipRow | null
  organization: OrganizationRow | null
}> {
  const { data, error, status } = await supabase
    .from('org_members')
    .select('*, organizations(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new MembershipLoadError(error, status)
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
  // Erro de rede no refetch não invalida os dados já carregados nem pode
  // desmontar o formulário. Uma resposta sem membership ou uma recusa de
  // autenticação/autorização continua fechando a rota normalmente.
  const refreshFailed = query.isError && !!query.data?.organization &&
    query.error instanceof MembershipLoadError && query.error.temporary

  // o log de erros (client_errors) precisa da org pra RLS; módulo fora do React
  const currentOrgId = query.data?.organization?.id ?? null
  useEffect(() => {
    setErrlogOrg(currentOrgId)
  }, [currentOrgId])

  const status: OrgStatus = useMemo(() => {
    if (authStatus !== 'signedIn') return 'absent'
    if (query.isError && !refreshFailed) return 'error'
    if (query.isPending) return 'loading'
    return query.data?.organization ? 'present' : 'absent'
  }, [authStatus, query.isError, query.isPending, query.data, refreshFailed])

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
      refreshFailed,
      refreshing: query.isFetching,
    }),
    [status, query.data?.organization, query.data?.membership, refresh, refreshFailed, query.isFetching]
  )

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>
}
