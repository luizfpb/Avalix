import { supabase } from '../../lib/supabase'
import type { Database, Json } from '../../lib/database.types'
import type { AnamnesisAnswers } from './spec'
import { computeGate } from './gate'
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
  const gate = computeGate(input.answers)
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

export async function listAnamneses(subjectId: string): Promise<AnamneseRow[]> {
  const { data, error } = await supabase
    .from('anamneses')
    .select('*')
    .eq('subject_id', subjectId)
    .order('assessed_at', { ascending: false })
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
