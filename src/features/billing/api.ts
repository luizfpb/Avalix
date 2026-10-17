import { useQuery } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { BillingCycle, OrgBilling } from './rules'

export async function getOrgBilling(orgId: string): Promise<OrgBilling> {
  const { data, error } = await supabase.rpc('get_org_billing', { p_org: orgId })
  if (error) throw error
  return data as unknown as OrgBilling
}

export function useOrgBilling(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['billing', orgId],
    queryFn: () => getOrgBilling(orgId as string),
    enabled: !!orgId,
    staleTime: 1000 * 60,
  })
}

export type BillingRequest =
  | { action: 'checkout'; plan: string; cycle: BillingCycle; method: 'card' }
  | {
      action: 'checkout'
      plan: string
      cycle: BillingCycle
      method: 'pix'
      name: string
      cpf_cnpj: string
      email?: string
    }
  | { action: 'change'; plan: string; cycle: BillingCycle }
  | { action: 'cancel' }

// A Edge Function responde { error } em pt-BR; o supabase-js embrulha a
// resposta não-2xx num FunctionsHttpError, então a mensagem é lida do corpo.
export async function billingRequest(
  orgId: string,
  request: BillingRequest
): Promise<{ url?: string; ok?: boolean; method?: 'pix' }> {
  const { data, error } = await supabase.functions.invoke('billing', {
    body: { org_id: orgId, ...request },
  })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      if (body && typeof body.error === 'string') throw new Error(body.error)
    }
    throw error
  }
  return (data ?? {}) as { url?: string; ok?: boolean; method?: 'pix' }
}
