import { supabase } from '../../lib/supabase'
import type { Database } from '../../lib/database.types'

export type SubjectRow = Database['public']['Tables']['subjects']['Row']
export type SubjectInsert = Database['public']['Tables']['subjects']['Insert']
export type SubjectUpdate = Database['public']['Tables']['subjects']['Update']

// RLS já restringe a visibilidade; filtramos por org_id pra usar o índice e
// deixar explícito. Ativos primeiro, depois ordem alfabética.
export async function listSubjects(orgId: string): Promise<SubjectRow[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('org_id', orgId)
    .order('is_active', { ascending: false })
    .order('full_name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getSubject(id: string): Promise<SubjectRow | null> {
  const { data, error } = await supabase.from('subjects').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

// evaluator_id é omitido de propósito: o default do banco (auth.uid()) assume,
// e o trigger check_evaluator valida que é membro da org.
export async function createSubject(input: SubjectInsert): Promise<SubjectRow> {
  const { data, error } = await supabase.from('subjects').insert(input).select('*').single()
  if (error) throw error
  return data
}

export async function updateSubject(id: string, patch: SubjectUpdate): Promise<SubjectRow> {
  const { data, error } = await supabase
    .from('subjects')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}
