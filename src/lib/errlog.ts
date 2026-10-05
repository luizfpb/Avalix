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

type LinkKind = 'treino' | 'anamnese'

let orgId: string | null = null
// Páginas públicas do aluno (treino e anamnese): sem usuário nem organização,
// o erro vai pelo token do link e o banco resolve a organização dona dele
// (RPC report_link_error, 0043). Antes eles simplesmente não eram gravados.
let linkContext: { kind: LinkKind; token: string } | null = null
let sent = 0
const seen = new Set<string>()

// Capability tokens nunca podem sair do dispositivo por observabilidade.
// Cobre a anamnese (/a/<token> legado e /a#<token>), o treino do aluno
// (/t#<token>) caso apareca numa mensagem/stack e parametros comuns
// adicionados por clientes externos.
export function sanitizeClientErrorText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/(\/[at](?:\/|#|%23))[A-Za-z0-9_-]{20,}/gi, '$1[redacted]')
    .replace(
      /([?&#](?:token|access_token|refresh_token|provider_token|id_token|apikey|code)=)[^&#\s]+/gi,
      '$1[redacted]',
    )
    .slice(0, maxLength)
}

export function sanitizedClientPath(pathname: string): string {
  return /^\/a(?:\/|$)/.test(pathname) ? '/a' : sanitizeClientErrorText(pathname, 300)
}

export function setErrlogOrg(id: string | null): void {
  orgId = id
}

export function setErrlogLink(kind: LinkKind | null, token: string | null): void {
  linkContext = kind && token ? { kind, token } : null
}

// Erro que a tela tratou e mostrou à pessoa (aviso vermelho, falha ao salvar).
// Não é exceção solta, então nada o registraria — e foi assim que o defeito do
// iPhone só apareceu quando uma aluna reclamou. O contexto diz onde aconteceu.
export function reportHandledError(context: string, error: unknown): void {
  const message = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : String(error ?? '')
  const name = error instanceof Error && error.name !== 'Error' ? `${error.name}: ` : ''
  reportClientError(`${context}: ${name}${message || 'sem mensagem'}`, error instanceof Error ? error.stack : null)
}

export function reportClientError(message: string, stack?: string | null): void {
  try {
    const msg = sanitizeClientErrorText(message, 600)
    if (!msg || (!orgId && !linkContext) || sent >= MAX_PER_SESSION) return
    // dedup por mensagem: um render quebrado em loop não vira flood
    if (seen.has(msg)) return
    seen.add(msg)
    sent += 1
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : null
    if (linkContext) {
      const { kind, token } = linkContext
      // Contrato restrito até regenerar database.types após a 0043.
      const client = supabase as unknown as {
        rpc(name: 'report_link_error', args: {
          p_kind: LinkKind
          p_token: string
          p_message: string
          p_stack?: string
          p_user_agent?: string
        }): PromiseLike<unknown>
      }
      void Promise.resolve(client.rpc('report_link_error', {
        p_kind: kind,
        p_token: token,
        p_message: msg,
        ...(stack ? { p_stack: sanitizeClientErrorText(stack, 4000) } : {}),
        ...(userAgent ? { p_user_agent: userAgent } : {}),
      })).catch(() => undefined)
      return
    }
    if (!orgId) return
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
        user_agent: userAgent,
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
