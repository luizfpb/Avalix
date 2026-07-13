import { supabase } from '../../lib/supabase'
import { sha256Hex } from '../../lib/hash'
import { clearIntakeLinkLocal, purgeExpiredIntakeLinks, saveIntakeLinkLocal } from './linkStore'
import type { Database, Json } from '../../lib/database.types'
import { SPEC_VERSION, type AnamnesisAnswers } from './spec'
import { computeGate } from './gate'
import { consentText, CONSENT_VERSION } from '../consent/text'
import type { SignerKind } from '../consent/api'
import type { SubjectInsert } from '../subjects/api'
import type { SubjectFormValues } from '../subjects/schema'

export type IntakeRow = Database['public']['Tables']['anamnese_intakes']['Row']
export type PendingIntake = Database['public']['Views']['pending_anamnese_intakes']['Row']

// 'anamnese' = link amarrado a um avaliado existente (0017);
// 'cadastro_anamnese' = o aluno preenche o proprio cadastro junto (0018) e o
// avaliado so e criado no aceite do personal.
export type IntakeKind = 'anamnese' | 'cadastro_anamnese'

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
  // Fragmentos nao sao enviados no request HTTP, Referer ou logs do servidor.
  return `${origin}/a#${token}`
}

const INTAKE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function isValidIntakeToken(value: string | null | undefined): value is string {
  return typeof value === 'string' && INTAKE_TOKEN_RE.test(value)
}

type PublicIntakeLocation = Pick<Location, 'pathname' | 'hash' | 'search'>
type PublicIntakeHistory = Pick<History, 'replaceState' | 'state'>

// Consome o capability token uma unica vez e limpa URL/historico imediatamente.
// Aceita /a#token e, durante a transicao, o formato antigo /a/token.
export function consumePublicIntakeToken(
  currentLocation: PublicIntakeLocation = window.location,
  currentHistory: PublicIntakeHistory = window.history
): string | null {
  const hashToken = currentLocation.pathname === '/a' ? currentLocation.hash.slice(1) : ''
  const legacyToken = currentLocation.pathname.match(/^\/a\/([^/]+)$/)?.[1] ?? ''
  const candidate = hashToken || legacyToken

  if (
    currentLocation.pathname === '/a' ||
    currentLocation.pathname.startsWith('/a/') ||
    currentLocation.hash ||
    currentLocation.search
  ) {
    currentHistory.replaceState(currentHistory.state, '', '/a')
  }
  return isValidIntakeToken(candidate) ? candidate : null
}

// Identificador local nao reversivel na pratica (token aleatorio de 256 bits),
// usado somente para separar rascunhos sem persistir parte do segredo na chave.
export function intakeDraftFingerprint(token: string): string {
  let a = 0x811c9dc5
  let b = 0x9e3779b9
  for (let i = 0; i < token.length; i++) {
    const code = token.charCodeAt(i)
    a = Math.imul(a ^ code, 0x01000193)
    b = Math.imul(b ^ code, 0x85ebca6b)
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`
}

export type GeneratedLink = { intakeId: string; url: string; expiresAt: string }

async function insertIntake(row: {
  subject_id?: string
  org_id: string
  kind?: IntakeKind
}): Promise<GeneratedLink> {
  const token = randomToken()
  const tokenHash = await sha256Hex(token)
  const expiresAt = new Date(Date.now() + INTAKE_TTL_DAYS * 86400000).toISOString()
  const { data, error } = await supabase
    .from('anamnese_intakes')
    .insert({
      ...row,
      token_hash: tokenHash,
      spec_version: SPEC_VERSION,
      expires_at: expiresAt,
    })
    .select('id, expires_at')
    .single()
  if (error) throw error
  const url = intakeUrl(token)
  // v2.1: a URL fica salva NESTE aparelho (o banco só tem o hash) pra
  // sobreviver a reload — o segredo continua sem sair do dispositivo
  saveIntakeLinkLocal(data.id, url, data.expires_at)
  return { intakeId: data.id, url, expiresAt: data.expires_at }
}

// Gera o link pro aluno responder. NAO exige consentimento previo: o aluno
// consente no proprio envio. org_id e recopiado do subject pelo trigger.
export async function generateIntakeLink(input: {
  subjectId: string
  orgId: string
}): Promise<GeneratedLink> {
  return insertIntake({ subject_id: input.subjectId, org_id: input.orgId })
}

// Link de cadastro: sem avaliado. O aluno se cadastra e responde a anamnese
// numa pagina so; o subject nasce no aceite do personal.
export async function generateRegistrationLink(input: { orgId: string }): Promise<GeneratedLink> {
  return insertIntake({ org_id: input.orgId, kind: 'cadastro_anamnese' })
}

// intakes "vivos" de um avaliado (aguardando o aluno ou aguardando revisao)
export async function listSubjectIntakes(subjectId: string): Promise<IntakeRow[]> {
  purgeExpiredIntakeLinks()
  const { data, error } = await supabase
    .from('anamnese_intakes')
    .select('*')
    .eq('subject_id', subjectId)
    .in('status', ['pending', 'submitted'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// convites de cadastro "vivos" da org (aguardando o aluno ou aguardando revisao)
export async function listRegistrationIntakes(orgId: string): Promise<IntakeRow[]> {
  purgeExpiredIntakeLinks()
  const { data, error } = await supabase
    .from('anamnese_intakes')
    .select('*')
    .eq('org_id', orgId)
    .eq('kind', 'cadastro_anamnese')
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
  const { error } = await supabase.rpc('cancel_anamnese_intake', {
    p_intake: intakeId,
  })
  if (error) throw error
  clearIntakeLinkLocal(intakeId)
}

export async function rejectIntake(intakeId: string): Promise<void> {
  const { error } = await supabase.rpc('reject_anamnese_intake', {
    p_intake: intakeId,
  })
  if (error) throw error
  clearIntakeLinkLocal(intakeId)
}

// aceita: o gate e calculado aqui no TS (modulo puro) a partir das respostas e
// passado pra RPC atomica, que cria consentimento + anamnese numa transacao.
// No intake de cadastro, `subject` (validado pelo zod do cadastro e convertido
// por formToInsert) vai junto e a RPC cria o avaliado na mesma transacao.
export type AcceptedIntake = { subjectId: string; anamneseId: string }

export async function acceptIntake(input: {
  intakeId: string
  answers: AnamnesisAnswers
  subject?: SubjectInsert
}): Promise<AcceptedIntake> {
  const gate = computeGate(input.answers)
  const { data, error } = await supabase.rpc('accept_anamnese_intake', {
    p_intake: input.intakeId,
    p_liberado: gate.liberado,
    p_nivel: gate.nivelEncaminhamento,
    p_flag: gate.flagEncaminhamento,
    ...(input.subject ? { p_subject: input.subject as unknown as Json } : {}),
  })
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new Error('aceite nao retornou os registros criados')
  clearIntakeLinkLocal(input.intakeId)
  return { subjectId: row.subject_id, anamneseId: row.anamnese_id }
}

// ---- publico (aluno, sem login) ---------------------------------------
// No intake de cadastro nao existe avaliado ainda: nome/sexo vem nulos e o
// proprio formulario coleta (o sexo escolhido decide a secao B6).
export type PublicIntake = {
  kind: IntakeKind
  orgName: string
  subjectFirstName: string | null
  subjectSex: 'M' | 'F' | null
  specVersion: string
}

export async function getIntakeByToken(token: string): Promise<PublicIntake | null> {
  const { data, error } = await supabase.rpc('get_anamnese_intake', { p_token: token })
  if (error) throw error
  const row = data?.[0]
  if (!row) return null
  const isCadastro = row.kind === 'cadastro_anamnese'
  return {
    kind: isCadastro ? 'cadastro_anamnese' : 'anamnese',
    orgName: row.org_name,
    subjectFirstName: isCadastro ? null : row.subject_first_name,
    subjectSex: isCadastro ? null : row.subject_sex === 'F' ? 'F' : 'M',
    specVersion: row.spec_version,
  }
}

export type SubmitIntakeInput = {
  token: string
  orgName: string
  answers: AnamnesisAnswers
  signerKind: SignerKind
  signerName: string
  // presente so no intake de cadastro: os valores do formulario (strings),
  // revalidados com o mesmo zod no aceite do personal
  registration?: SubjectFormValues
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
    ...(input.registration ? { p_registration: input.registration as unknown as Json } : {}),
  })
  if (error) throw error
}
