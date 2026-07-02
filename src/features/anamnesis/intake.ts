import { supabase } from '../../lib/supabase'
import { sha256Hex } from '../../lib/hash'
import type { Database, Json } from '../../lib/database.types'
import { SPEC_VERSION, type AnamnesisAnswers } from './spec'
import { computeGate } from './gate'
import { consentText, CONSENT_VERSION } from '../consent/text'
import type { SignerKind } from '../consent/api'

export type IntakeRow = Database['public']['Tables']['anamnese_intakes']['Row']
export type PendingIntake = Database['public']['Views']['pending_anamnese_intakes']['Row']

const INTAKE_TTL_DAYS = 7

// token = 256 bits aleatorios em base64url. Guardamos so o hash (sha256) no
// banco; o token cru so existe dentro do link. O mesmo sha256Hex e recalculado
// no servidor (funcao SQL) pra localizar a linha — vazamento do banco nao revela
// token usavel.
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function intakeUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/a/${token}`
}

export type GeneratedLink = { intakeId: string; url: string; expiresAt: string }

// Gera o link pro aluno responder. NAO exige consentimento previo: o aluno
// consente no proprio envio. org_id e recopiado do subject pelo trigger.
export async function generateIntakeLink(input: {
  subjectId: string
  orgId: string
}): Promise<GeneratedLink> {
  const token = randomToken()
  const tokenHash = await sha256Hex(token)
  const expiresAt = new Date(Date.now() + INTAKE_TTL_DAYS * 86400000).toISOString()
  const { data, error } = await supabase
    .from('anamnese_intakes')
    .insert({
      subject_id: input.subjectId,
      org_id: input.orgId,
      token_hash: tokenHash,
      spec_version: SPEC_VERSION,
      expires_at: expiresAt,
    })
    .select('id, expires_at')
    .single()
  if (error) throw error
  return { intakeId: data.id, url: intakeUrl(token), expiresAt: data.expires_at }
}

// intakes "vivos" de um avaliado (aguardando o aluno ou aguardando revisao)
export async function listSubjectIntakes(subjectId: string): Promise<IntakeRow[]> {
  const { data, error } = await supabase
    .from('anamnese_intakes')
    .select('*')
    .eq('subject_id', subjectId)
    .in('status', ['pending', 'submitted'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getIntake(intakeId: string): Promise<IntakeRow | null> {
  const { data, error } = await supabase
    .from('anamnese_intakes')
    .select('*')
    .eq('id', intakeId)
    .maybeSingle()
  if (error) throw error
  return data
}

// alimenta badge/dashboard: o que esta aguardando revisao, por org
export async function listPendingIntakes(orgId: string): Promise<PendingIntake[]> {
  const { data, error } = await supabase
    .from('pending_anamnese_intakes')
    .select('*')
    .eq('org_id', orgId)
    .order('submitted_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function cancelIntake(intakeId: string): Promise<void> {
  const { error } = await supabase
    .from('anamnese_intakes')
    .update({ status: 'canceled' })
    .eq('id', intakeId)
    .eq('status', 'pending')
  if (error) throw error
}

export async function rejectIntake(intakeId: string): Promise<void> {
  const { error } = await supabase
    .from('anamnese_intakes')
    .update({ status: 'rejected' })
    .eq('id', intakeId)
    .eq('status', 'submitted')
  if (error) throw error
}

// aceita: o gate e calculado aqui no TS (modulo puro) a partir das respostas e
// passado pra RPC atomica, que cria consentimento + anamnese numa transacao.
export async function acceptIntake(input: {
  intakeId: string
  answers: AnamnesisAnswers
}): Promise<string> {
  const gate = computeGate(input.answers)
  const { data, error } = await supabase.rpc('accept_anamnese_intake', {
    p_intake: input.intakeId,
    p_liberado: gate.liberado,
    p_nivel: gate.nivelEncaminhamento,
    p_flag: gate.flagEncaminhamento,
  })
  if (error) throw error
  return data as string
}

// ---- publico (aluno, sem login) ---------------------------------------
export type PublicIntake = {
  orgName: string
  subjectFirstName: string
  subjectSex: 'M' | 'F'
  specVersion: string
}

export async function getIntakeByToken(token: string): Promise<PublicIntake | null> {
  const { data, error } = await supabase.rpc('get_anamnese_intake', { p_token: token })
  if (error) throw error
  const row = data?.[0]
  if (!row) return null
  return {
    orgName: row.org_name,
    subjectFirstName: row.subject_first_name,
    subjectSex: row.subject_sex === 'F' ? 'F' : 'M',
    specVersion: row.spec_version,
  }
}

export type SubmitIntakeInput = {
  token: string
  orgName: string
  answers: AnamnesisAnswers
  signerKind: SignerKind
  signerName: string
}

// O hash do termo e do texto EXATO exibido (com o nome do Controlador), igual ao
// fluxo de consentimento do personal. Prova depois qual texto o aluno leu.
export async function submitIntake(input: SubmitIntakeInput): Promise<void> {
  const consentHash = await sha256Hex(consentText(input.orgName))
  const { error } = await supabase.rpc('submit_anamnese_intake', {
    p_token: input.token,
    p_payload: input.answers as unknown as Json,
    p_signer_kind: input.signerKind,
    p_signer_name: input.signerName.trim(),
    p_consent_version: CONSENT_VERSION,
    p_consent_text_sha256: consentHash,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  })
  if (error) throw error
}
