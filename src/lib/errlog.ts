import { supabase } from './supabase'

// Observabilidade mínima sem serviço externo (free tier): erros de runtime do
// front vão pra tabela client_errors (RLS: insert do próprio usuário; leitura
// owner/admin na página /auditoria). Sem payload de formulário — só mensagem,
// stack, rota e user agent.
//
// A org vem por um setter (o OrganizationProvider chama setErrlogOrg) porque
// este módulo roda fora do React. Sem org conhecida, não grava: a linha seria
// ilegível pra todo mundo (a policy de leitura é por org).

const MAX_PER_SESSION = 8

let orgId: string | null = null
let sent = 0
const seen = new Set<string>()

// Capability tokens nunca podem sair do dispositivo por observabilidade.
// Cobre o path legado, o fragmento novo caso apareca numa mensagem/stack e
// parametros comuns adicionados por clientes externos.
export function sanitizeClientErrorText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/(\/a(?:\/|#|%23))[A-Za-z0-9_-]{20,}/gi, '$1[redacted]')
    .replace(/([?&](?:token|access_token|apikey)=)[^&#\s]+/gi, '$1[redacted]')
    .slice(0, maxLength)
}

export function sanitizedClientPath(pathname: string): string {
  return /^\/a(?:\/|$)/.test(pathname) ? '/a' : sanitizeClientErrorText(pathname, 300)
}

export function setErrlogOrg(id: string | null): void {
  orgId = id
}

export function reportClientError(message: string, stack?: string | null): void {
  try {
    const msg = sanitizeClientErrorText(message, 600)
    if (!msg || !orgId || sent >= MAX_PER_SESSION) return
    // dedup por mensagem: um render quebrado em loop não vira flood
    if (seen.has(msg)) return
    seen.add(msg)
    sent += 1
    const org = orgId
    void (async () => {
      const { data } = await supabase.auth.getSession()
      const uid = data.session?.user.id
      if (!uid) return
      await supabase.from('client_errors').insert({
        org_id: org,
        user_id: uid,
        message: msg,
        stack: stack ? sanitizeClientErrorText(stack, 4000) : null,
        url: typeof location !== 'undefined' ? sanitizedClientPath(location.pathname) : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : null,
      })
    })().catch(() => undefined)
  } catch {
    // logging nunca pode quebrar o app
  }
}

// window.onerror / unhandledrejection: erros fora do React (listeners, async)
export function installGlobalErrorLog(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('error', (e) => {
    reportClientError(e.message, e.error instanceof Error ? e.error.stack : null)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    if (r instanceof Error) reportClientError(r.message, r.stack)
    else reportClientError(typeof r === 'string' ? r : 'unhandledrejection')
  })
}
