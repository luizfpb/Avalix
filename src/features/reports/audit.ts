import { supabase } from '../../lib/supabase'
import type { Database } from '../../lib/database.types'

export type DataAction =
  | 'EXPORT_CSV'
  | 'EXPORT_JSON'
  | 'PDF_REPORT'
  | 'AI_SUMMARY'
  | 'SHARE_GOOGLE_CALENDAR'
  | 'SHARE_ICS'
  | 'SHARE_WHATSAPP'
  | 'SUBJECT_EXPORT'

// A RPC valida no servidor a organização, o alvo, o MFA e o usuário da sessão.
// Uma indisponibilidade momentânea da trilha não bloqueia o arquivo já gerado.
export async function logDataAction(input: {
  orgId: string
  action: DataAction
  tableName: string
  rowId: string | null
  subjectId?: string | null
}): Promise<void> {
  const { error } = await supabase.rpc('log_data_action', {
    p_org: input.orgId,
    p_action: input.action,
    p_table_name: input.tableName,
    ...(input.rowId !== null ? { p_row_id: input.rowId } : {}),
    ...(input.subjectId != null ? { p_subject_id: input.subjectId } : {}),
  })
  if (error) console.warn('falha ao registrar auditoria de dados:', error.message)
}

export async function logExport(input: {
  orgId: string
  userId?: string
  action: Extract<DataAction, 'EXPORT_CSV' | 'EXPORT_JSON' | 'PDF_REPORT' | 'AI_SUMMARY'>
  tableName: string
  rowId: string | null
  subjectId?: string | null
}): Promise<void> {
  return logDataAction(input)
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
