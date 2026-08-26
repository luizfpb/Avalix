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
export type NewCircumferenceReading = { site: string; value_cm: number; is_custom?: boolean }

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

function skinfoldPayload(input: CreateAssessmentInput): Json {
  return input.skinfolds.map((s) => ({
    site: s.site,
    reading_1: s.reading_1,
    reading_2: s.reading_2,
    reading_3: s.reading_3,
  })) as unknown as Json
}

function circumferencePayload(input: CreateAssessmentInput): Json {
  return input.circumferences.map((c) => ({
    site: c.site,
    value_cm: c.value_cm,
    is_custom: c.is_custom ?? false,
  })) as unknown as Json
}

// Cabeçalho e leituras nascem na mesma transação. Se qualquer leitura, trigger,
// RLS ou consentimento falhar, nenhuma avaliação órfã fica persistida.
export async function createAssessment(input: CreateAssessmentInput): Promise<AssessmentRow> {
  const { data: assessment, error } = await supabase.rpc('create_assessment', {
    p_subject: input.subjectId,
    p_assessed_at: input.assessedAt,
    p_protocol_id: input.protocolId,
    p_weight_kg: input.weightKg,
    p_height_cm: input.heightCm,
    p_results: input.result as unknown as Json,
    p_engine_version: input.result.engineVersion,
    p_skinfolds: skinfoldPayload(input),
    p_circumferences: circumferencePayload(input),
    ...(input.medications != null ? { p_medications: input.medications } : {}),
    ...(input.notes != null ? { p_notes: input.notes } : {}),
  })
  if (error) throw error
  if (!assessment) throw new Error('A criação da avaliação não retornou o registro criado.')
  return assessment
}

// Atualiza header + leituras numa transação só (RPC save_assessment, 0019).
// Antes eram duas chamadas: se a troca das leituras falhasse (rede,
// consentimento revogado), o snapshot novo ficava com leituras velhas — PDF e
// gráficos de evolução divergiam. Agora falha reverte tudo.
export async function updateAssessment(
  id: string,
  input: CreateAssessmentInput,
  expectedUpdatedAt?: string | null
): Promise<AssessmentRow> {
  const { data, error } = await supabase.rpc('save_assessment', {
    p_assessment: id,
    // Concorrencia otimista (0023): se a linha mudou depois que esta tela
    // carregou, o banco recusa em vez de sobrescrever o trabalho do outro
    // dispositivo. undefined = sem checagem (comportamento antigo).
    p_expected_updated_at: expectedUpdatedAt ?? undefined,
    p_assessed_at: input.assessedAt,
    p_protocol_id: input.protocolId,
    p_weight_kg: input.weightKg,
    p_height_cm: input.heightCm,
    // args com default null na RPC: omitir = limpar o campo
    ...(input.medications != null ? { p_medications: input.medications } : {}),
    ...(input.notes != null ? { p_notes: input.notes } : {}),
    p_results: input.result as unknown as Json,
    p_engine_version: input.result.engineVersion,
    p_skinfolds: input.skinfolds.map((s) => ({
      site: s.site,
      reading_1: s.reading_1,
      reading_2: s.reading_2,
      reading_3: s.reading_3,
    })) as unknown as Json,
    p_circumferences: input.circumferences.map((c) => ({
      site: c.site,
      value_cm: c.value_cm,
      is_custom: c.is_custom ?? false,
    })) as unknown as Json,
  })
  if (error) throw error
  return data as AssessmentRow
}

// Exclusão da avaliação. O FK on delete cascade leva as leituras; a auditoria
// registra o DELETE.
export async function deleteAssessment(id: string): Promise<void> {
  const { error } = await supabase.from('assessments').delete().eq('id', id)
  if (error) throw error
}

export type SubjectCircumference = {
  assessmentId: string
  assessedAt: string
  assessmentCreatedAt: string
  site: string
  valueCm: number
}

// Todas as circunferências do avaliado ao longo das avaliações (via join),
// pra montar a evolução por ponto. RLS continua valendo por avaliação.
export async function listSubjectCircumferences(subjectId: string): Promise<SubjectCircumference[]> {
  // Esta é a consulta de maior cardinalidade do app: até 22 sítios do catálogo
  // por avaliação, ou seja, ~45 avaliações já passam do teto de linhas do
  // PostgREST. Era a única de alta cardinalidade sem o laço de paginação de 500
  // que o projeto usa em outros sete lugares — e, pior, sem ORDER BY: o corte
  // não vinha do "mais antigo", vinha do que o plano devolvesse, normalmente
  // ordem física, então as avaliações MAIS RECENTES é que caíam fora. O sintoma
  // era um gráfico de evolução com menos pontos e um "atual"/variação errados
  // no PDF entregue ao aluno, sem nenhum erro na tela.
  const rows: Array<{
    site: string
    value_cm: number
    assessments:
      | { id: string; assessed_at: string; created_at: string }
      | { id: string; assessed_at: string; created_at: string }[]
  }> = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('circumference_readings')
      .select('id, site, value_cm, assessments!inner(id, subject_id, assessed_at, created_at)')
      .eq('assessments.subject_id', subjectId)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...((data ?? []) as unknown as typeof rows))
    if ((data?.length ?? 0) < pageSize) break
  }
  return mapCircumferences(rows)
}

export function mapCircumferences(
  rows: Array<{
    site: string
    value_cm: number
    assessments:
      | { id: string; assessed_at: string; created_at: string }
      | { id: string; assessed_at: string; created_at: string }[]
  }>
): SubjectCircumference[] {
  return rows.map(({ site, value_cm, assessments }) => {
    const a = Array.isArray(assessments) ? assessments[0] : assessments
    return {
      assessmentId: a?.id ?? '',
      assessedAt: a?.assessed_at ?? '',
      assessmentCreatedAt: a?.created_at ?? '',
      site,
      valueCm: value_cm,
    }
  })
}

// Última avaliação (data) por avaliado da org — pro gatilho de reavaliação no
// dashboard. A view last_assessment_by_subject (0016) agrega no banco com
// distinct on, em vez de baixar todas as avaliações da org; security_invoker
// mantém a RLS valendo.
export async function listLastAssessmentBySubject(orgId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('last_assessment_by_subject')
    .select('subject_id, assessed_at')
    .eq('org_id', orgId)
  if (error) throw error
  const map: Record<string, string> = {}
  for (const r of data ?? []) {
    if (r.subject_id && r.assessed_at) map[r.subject_id] = r.assessed_at
  }
  return map
}

export async function listAssessments(subjectId: string): Promise<AssessmentRow[]> {
  const { data, error } = await supabase
    .from('assessments')
    .select('*')
    .eq('subject_id', subjectId)
    .order('assessed_at', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
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
