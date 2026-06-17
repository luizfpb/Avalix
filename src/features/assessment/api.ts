import { supabase } from '../../lib/supabase'
import type { Database, Json } from '../../lib/database.types'
import type { AssessmentResultSnapshot } from './result'

export type AssessmentRow = Database['public']['Tables']['assessments']['Row']
export type SkinfoldReadingRow = Database['public']['Tables']['skinfold_readings']['Row']
export type CircumferenceReadingRow = Database['public']['Tables']['circumference_readings']['Row']

export type NewSkinfoldReading = {
  site: string
  reading_1: number
  reading_2: number | null
  reading_3: number | null
}
export type NewCircumferenceReading = { site: string; value_cm: number }

export type CreateAssessmentInput = {
  orgId: string
  subjectId: string
  assessedAt: string
  protocolId: string
  weightKg: number
  heightCm: number
  medications: string | null
  notes: string | null
  result: AssessmentResultSnapshot
  skinfolds: NewSkinfoldReading[]
  circumferences: NewCircumferenceReading[]
}

// Insere a avaliação e, em seguida, as leituras (org_id é recopiado pelos
// triggers a partir do pai). O snapshot em results já contém todos os números,
// então a avaliação é a fonte de verdade do laudo mesmo se uma leitura falhar.
export async function createAssessment(input: CreateAssessmentInput): Promise<AssessmentRow> {
  const { data: assessment, error } = await supabase
    .from('assessments')
    .insert({
      org_id: input.orgId,
      subject_id: input.subjectId,
      assessed_at: input.assessedAt,
      protocol_id: input.protocolId,
      weight_kg: input.weightKg,
      height_cm: input.heightCm,
      medications: input.medications,
      notes: input.notes,
      results: input.result as unknown as Json,
      engine_version: input.result.engineVersion,
    })
    .select('*')
    .single()
  if (error) throw error

  if (input.skinfolds.length > 0) {
    const { error: skErr } = await supabase.from('skinfold_readings').insert(
      input.skinfolds.map((s) => ({
        org_id: input.orgId,
        assessment_id: assessment.id,
        site: s.site,
        reading_1: s.reading_1,
        reading_2: s.reading_2,
        reading_3: s.reading_3,
      }))
    )
    if (skErr) throw skErr
  }

  if (input.circumferences.length > 0) {
    const { error: ciErr } = await supabase.from('circumference_readings').insert(
      input.circumferences.map((c) => ({
        org_id: input.orgId,
        assessment_id: assessment.id,
        site: c.site,
        value_cm: c.value_cm,
      }))
    )
    if (ciErr) throw ciErr
  }

  return assessment
}

export async function listAssessments(subjectId: string): Promise<AssessmentRow[]> {
  const { data, error } = await supabase
    .from('assessments')
    .select('*')
    .eq('subject_id', subjectId)
    .order('assessed_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getAssessment(id: string): Promise<{
  assessment: AssessmentRow | null
  skinfolds: SkinfoldReadingRow[]
  circumferences: CircumferenceReadingRow[]
}> {
  const { data: assessment, error } = await supabase
    .from('assessments')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!assessment) return { assessment: null, skinfolds: [], circumferences: [] }

  const sk = await supabase.from('skinfold_readings').select('*').eq('assessment_id', id).order('site')
  if (sk.error) throw sk.error
  const ci = await supabase
    .from('circumference_readings')
    .select('*')
    .eq('assessment_id', id)
    .order('site')
  if (ci.error) throw ci.error

  return { assessment, skinfolds: sk.data ?? [], circumferences: ci.data ?? [] }
}
