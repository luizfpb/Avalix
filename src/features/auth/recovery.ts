import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

// Este marcador só restaura a etapa da interface. A troca de senha continua
// autenticada e validada pelo Supabase; nenhum token é copiado para cá.
const KEY = 'avalix:auth:password-recovery:v1'
const MAX_AGE_MS = 60 * 60 * 1000
type Flow = { userId: string; sessionId: string; startedAt: number }
let memoryFlow: Flow | null = null

function sessionId(session: Session): string | null {
  try {
    const encoded = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims: unknown = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')))
    if (!claims || typeof claims !== 'object') return null
    const value = claims as Record<string, unknown>
    return value.sub === session.user.id && typeof value.session_id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.session_id)
      ? value.session_id : null
  } catch {
    return null
  }
}

export function clearRecoveryFlow(): void {
  memoryFlow = null
  try { sessionStorage.removeItem(KEY) } catch { /* storage pode estar bloqueado */ }
}

function readFlow(): Flow | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Flow
  } catch { /* a montagem atual ainda funciona sem storage */ }
  return memoryFlow
}

export function updateRecoveryFlow(
  session: Session | null,
  event?: AuthChangeEvent,
  now = Date.now(),
): boolean {
  if (!session) {
    clearRecoveryFlow()
    return false
  }
  const id = sessionId(session)
  if (event === 'PASSWORD_RECOVERY') {
    clearRecoveryFlow()
    if (id) {
      memoryFlow = { userId: session.user.id, sessionId: id, startedAt: now }
      try { sessionStorage.setItem(KEY, JSON.stringify(memoryFlow)) } catch { /* sem persistência */ }
    }
    // O evento válido do SDK permite iniciar a tela mesmo sem sessionStorage.
    return true
  }
  const flow = readFlow()
  if (!flow || !id || flow.userId !== session.user.id || flow.sessionId !== id ||
    !Number.isFinite(flow.startedAt) || flow.startedAt > now + 60_000 ||
    now - flow.startedAt >= MAX_AGE_MS) {
    clearRecoveryFlow()
    return false
  }
  memoryFlow = flow
  return true
}
