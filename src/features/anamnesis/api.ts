import { supabase } from '../../lib/supabase'
import type { Database, Json } from '../../lib/database.types'
import type { AnamnesisAnswers } from './spec'
import { assertGateComplete } from './gate'
import { SPEC_VERSION } from './spec'

export type AnamneseRow = Database['public']['Tables']['anamneses']['Row']

export type CreateAnamneseInput = {
  orgId: string
  subjectId: string
  assessedAt: string
  answers: AnamnesisAnswers
}

// O gate é recalculado aqui (fonte única) e gravado nas colunas; o payload
// guarda as respostas cruas. org_id é recopiado do subject pelo trigger.
export async function createAnamnese(input: CreateAnamneseInput): Promise<AnamneseRow> {
  const gate = assertGateComplete(input.answers)
  const { data, error } = await supabase
    .from('anamneses')
    .insert({
      org_id: input.orgId,
      subject_id: input.subjectId,
      assessed_at: input.assessedAt,
      spec_version: SPEC_VERSION,
      payload: input.answers as unknown as Json,
      liberado: gate.liberado,
      nivel_encaminhamento: gate.nivelEncaminhamento,
      flag_encaminhamento: gate.flagEncaminhamento,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export type UpdateAnamneseInput = {
  assessedAt: string
  answers: AnamnesisAnswers
}

// Correção de uma anamnese já registrada (mesmo registro, não versão nova: pra
// reavaliar existe "Nova anamnese", que versiona por data). org_id/subject_id
// nem entram no update — são congelados por trigger; updated_at e a trilha de
// auditoria saem dos triggers da 0005. O gate é recalculado das respostas
// novas pela MESMA função do create, senão as colunas liberado/nivel/flag
// ficariam descrevendo respostas antigas.
export async function updateAnamnese(
  id: string,
  input: UpdateAnamneseInput
): Promise<AnamneseRow> {
  const gate = assertGateComplete(input.answers)
  const { data, error } = await supabase
    .from('anamneses')
    .update({
      assessed_at: input.assessedAt,
      spec_version: SPEC_VERSION,
      payload: input.answers as unknown as Json,
      liberado: gate.liberado,
      nivel_encaminhamento: gate.nivelEncaminhamento,
      flag_encaminhamento: gate.flagEncaminhamento,
    })
    .eq('id', id)
    .select('*')
    .single()
  // update que não pega linha nenhuma (registro excluído noutra aba, acesso
  // perdido) volta como PGRST116 em inglês; normalizeDbError repassa a
  // mensagem, então a tradução tem que sair daqui
  if (error?.code === 'PGRST116') {
    throw new Error('Esta anamnese não está mais disponível para edição. Recarregue a página.')
  }
  if (error) throw error
  return data
}

export async function listAnamneses(subjectId: string): Promise<AnamneseRow[]> {
  const { data, error } = await supabase
    .from('anamneses')
    .select('*')
    .eq('subject_id', subjectId)
    // Desempate determinístico: duas anamneses na MESMA data deixavam a ordem
    // por conta do plano do Postgres, então "a mais recente" — que alimenta o
    // banner de contraindicações no builder de treino — podia alternar entre
    // recarregamentos. Com um aluno que respondeu duas vezes no mesmo dia, o
    // profissional podia ver a triagem errada.
    .order('assessed_at', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getAnamnese(id: string): Promise<AnamneseRow | null> {
  const { data, error } = await supabase
    .from('anamneses')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}
