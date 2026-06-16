import { supabase } from '../../lib/supabase'

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
