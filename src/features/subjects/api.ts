import { supabase } from '../../lib/supabase'
import { removePhotoObjectsVerified } from '../../lib/storage'
import type { Database } from '../../lib/database.types'

export type SubjectRow = Database['public']['Tables']['subjects']['Row']
export type SubjectInsert = Database['public']['Tables']['subjects']['Insert']
export type SubjectUpdate = Database['public']['Tables']['subjects']['Update']
export type SubjectSummary = Pick<
  SubjectRow,
  'id' | 'org_id' | 'full_name' | 'birth_date' | 'sex' | 'is_active'
>

// RLS já restringe a visibilidade; filtramos por org_id pra usar o índice e
// deixar explícito. Ativos primeiro, depois ordem alfabética.
export async function listSubjects(orgId: string): Promise<SubjectSummary[]> {
  const rows: SubjectSummary[] = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('subjects')
      // Listas nunca carregam contato, notas ou dados do responsável. O detalhe
      // busca o registro completo sob demanda (minimização de PII e de cache).
      .select('id, org_id, full_name, birth_date, sex, is_active')
      .eq('org_id', orgId)
      .order('is_active', { ascending: false })
      .order('full_name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) return rows
  }
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

// Exclusão definitiva (direito de eliminação, LGPD). Ordem do DECISIONS:
// remover os arquivos do Storage ANTES das linhas — a policy do Storage resolve
// o objeto pela linha de posture_photos, então apagar a linha primeiro deixaria
// o arquivo órfão e inacessível. Depois apaga o avaliado: o FK on delete cascade
// leva avaliações, leituras, sessões, fotos, anotações e consentimentos; o
// trigger de auditoria registra os DELETE automaticamente.
export async function deleteSubjectCompletely(subjectId: string): Promise<void> {
  const paths: string[] = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .rpc('prepare_subject_deletion', { p_subject: subjectId })
      .range(from, from + pageSize - 1)
    if (error) throw error
    for (const photo of data ?? []) paths.push(photo.storage_path, photo.thumb_path)
    if ((data?.length ?? 0) < pageSize) break
  }
  // remoção VERIFICADA (v2.0): o remove() do supabase-js não reporta falha por
  // objeto; sobrou arquivo => aborta antes de apagar qualquer linha.
  await removePhotoObjectsVerified(paths)
  const { error } = await supabase.rpc('finalize_subject_deletion', {
    p_subject: subjectId,
  })
  if (error) throw error
}
