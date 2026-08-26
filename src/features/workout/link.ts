import { supabase } from '../../lib/supabase'
import { sha256Hex } from '../../lib/hash'
import type { Database } from '../../lib/database.types'
import { saveWorkoutLinkLocal, clearWorkoutLinkLocal } from './linkStore'

export type WorkoutLinkRow = Database['public']['Tables']['workout_links']['Row']

// O link do treino é do ALUNO, não do plano: ele aponta para o avaliado e
// resolve o plano vigente no momento do acesso. Por isso a validade é longa —
// o aluno salva na tela do celular e abre por meses. O teto de 180 dias é
// garantido pelo banco (check da 0027), não por esta constante.
const LINK_TTL_DAYS = 180

// token = 256 bits aleatórios em base64url, igual ao link de anamnese. O banco
// guarda só o sha256; o cru só existe dentro da URL. Vazamento do banco não
// revela token usável.
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const WORKOUT_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function isValidWorkoutToken(value: string | null | undefined): value is string {
  return typeof value === 'string' && WORKOUT_TOKEN_RE.test(value)
}

export function workoutLinkUrl(token: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  // Fragmento: não é enviado no request HTTP, não entra em Referer nem em log
  // de servidor. Nasce só nesta forma — a variante com token no path, que a
  // anamnese ainda aceita por links já distribuídos, não existe aqui.
  return `${base}/t#${token}`
}

function expiresAtIso(now = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + LINK_TTL_DAYS)
  return d.toISOString()
}

export async function getWorkoutLink(subjectId: string): Promise<WorkoutLinkRow | null> {
  const { data, error } = await supabase
    .from('workout_links')
    .select('*')
    .eq('subject_id', subjectId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return data
}

export type IssuedWorkoutLink = { row: WorkoutLinkRow; url: string }

// Emite (ou reemite) o link do aluno. A RPC revoga o ativo anterior e insere o
// novo na mesma transação — reemitir não perde histórico nenhum, porque as
// sessões pertencem ao plano, não ao token.
export async function issueWorkoutLink(subjectId: string): Promise<IssuedWorkoutLink> {
  const token = randomToken()
  const tokenHash = await sha256Hex(token)
  const expiresAt = expiresAtIso()

  const { data, error } = await supabase.rpc('issue_workout_link', {
    p_subject: subjectId,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  })
  if (error) throw error

  const row = data as unknown as WorkoutLinkRow
  const url = workoutLinkUrl(token)
  // A URL crua fica só neste aparelho, para reexibir Copiar/WhatsApp. Em outro
  // aparelho o segredo nunca existiu: lá o caminho é reemitir.
  saveWorkoutLinkLocal(subjectId, url, row.expires_at)
  return { row, url }
}

export async function revokeWorkoutLink(linkId: string, subjectId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_workout_link', { p_link: linkId })
  if (error) throw error
  clearWorkoutLinkLocal(subjectId)
}
