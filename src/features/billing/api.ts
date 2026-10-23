import { useQuery } from '@tanstack/react-query'
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { useOrganization } from '../organization/context'
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

// Conta em só leitura (assinatura vencida). O banco é quem recusa; aqui é só
// para avisar antes de alguém preencher um formulário inteiro. Enquanto a
// consulta carrega, ou se ela falhar, não bloqueia nada.
export function useReadOnly(): { readOnly: boolean; canManage: boolean } {
  const { organization } = useOrganization()
  const { data } = useOrgBilling(organization?.id)
  return { readOnly: data?.access === 'blocked', canManage: !!data?.can_manage }
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
// Sem esse corpo (503 do gateway, página de erro em HTML) ou sem rede, o SDK
// só tem textos internos em inglês ("Edge Function returned a non-2xx status
// code"), que iam direto para a tela.
export async function billingRequest(
  orgId: string,
  request: BillingRequest
): Promise<{ url?: string; ok?: boolean; method?: 'pix' }> {
  const { data, error } = await supabase.functions.invoke('billing', {
    body: { org_id: orgId, ...request },
  })
  if (error) {
    if (error instanceof FunctionsFetchError) {
      throw new Error('Falha de conexão. Verifique sua internet e tente de novo.', { cause: error })
    }
    if (error instanceof FunctionsHttpError) {
      const response = error.context as Response
      const body = await response.json().catch(() => null)
      if (body && typeof body.error === 'string') throw new Error(body.error)
      throw new Error(
        `O serviço de pagamento não respondeu (erro ${response.status}). Tente de novo em instantes.`,
        { cause: error }
      )
    }
    throw new Error('O serviço de pagamento não respondeu. Tente de novo em instantes.', { cause: error })
  }
  return (data ?? {}) as { url?: string; ok?: boolean; method?: 'pix' }
}
