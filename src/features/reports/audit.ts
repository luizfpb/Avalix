import { supabase } from '../../lib/supabase'
import type { Database } from '../../lib/database.types'

export type ExportAction = 'EXPORT_CSV' | 'EXPORT_JSON' | 'PDF_REPORT' | 'AI_SUMMARY'

// Registra a exportação em audit_logs. Best-effort: a policy exige ser membro
// da org, user_id = auth.uid() e a ação na lista permitida. Não bloqueia o
// download se a auditoria falhar.
export async function logExport(input: {
  orgId: string
  userId: string
  action: ExportAction
  tableName: string
  rowId: string | null
}): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({
    org_id: input.orgId,
    user_id: input.userId,
    action: input.action,
    table_name: input.tableName,
    row_id: input.rowId,
  })
  if (error) console.warn('falha ao registrar auditoria de exportação:', error.message)
}

// ---- leitura (página /auditoria, owner/admin — a RLS garante) -----------

export type AuditLogRow = Database['public']['Tables']['audit_logs']['Row']
export type ClientErrorRow = Database['public']['Tables']['client_errors']['Row']

export const AUDIT_PAGE_SIZE = 50

// página de eventos, mais recente primeiro. count exato pra paginação.
export async function listAuditLogs(
  orgId: string,
  page: number
): Promise<{ rows: AuditLogRow[]; total: number }> {
  const from = page * AUDIT_PAGE_SIZE
  const { data, error, count } = await supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('at', { ascending: false })
    .range(from, from + AUDIT_PAGE_SIZE - 1)
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

// nomes dos usuários citados nos eventos (profiles_select permite ler perfis
// de quem divide a org)
export async function listProfileNames(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {}
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)
  if (error) throw error
  const map: Record<string, string> = {}
  for (const p of data ?? []) map[p.id] = p.full_name
  return map
}

export async function listClientErrors(orgId: string, limit = 50): Promise<ClientErrorRow[]> {
  const { data, error } = await supabase
    .from('client_errors')
    .select('*')
    .eq('org_id', orgId)
    .order('at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function clearClientErrors(orgId: string): Promise<void> {
  const { error } = await supabase.from('client_errors').delete().eq('org_id', orgId)
  if (error) throw error
}
