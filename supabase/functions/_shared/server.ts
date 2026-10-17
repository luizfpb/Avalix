// Infra das Edge Functions de cobrança: variáveis, chamadas ao PostgREST e
// ao Asaas. Sem supabase-js: duas chamadas fetch bastam e não há dependência
// para baixar no deploy.

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function env(name: string, fallback?: string): string {
  const value = Deno.env.get(name)?.trim() || fallback
  if (!value) throw new HttpError(500, `variável ${name} não configurada`)
  return value
}

const SUPABASE_URL = () => env('SUPABASE_URL')
const SERVICE_KEY = () =>
  Deno.env.get('BILLING_SERVICE_KEY')?.trim() || env('SUPABASE_SERVICE_ROLE_KEY')
const PUBLIC_KEY = () =>
  Deno.env.get('BILLING_PUBLISHABLE_KEY')?.trim() || env('SUPABASE_ANON_KEY')

// Chave nova (sb_secret_/sb_publishable_) vai só no apikey; chave JWT antiga
// também vai no Authorization, como o PostgREST espera.
function keyHeaders(key: string): Record<string, string> {
  return key.startsWith('eyJ')
    ? { apikey: key, Authorization: `Bearer ${key}` }
    : { apikey: key }
}

async function postgrestRpc<T>(
  fn: string,
  args: Record<string, unknown>,
  headers: Record<string, string>
): Promise<T> {
  const response = await fetch(`${SUPABASE_URL()}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(args),
  })
  const text = await response.text()
  let data: { message?: unknown; code?: unknown } | null = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!response.ok) {
    const message = typeof data?.message === 'string' ? data.message : `falha em ${fn}`
    // P0001 = exceção das nossas funções, já em pt-BR e feita para o usuário
    const status = data?.code === 'P0001' ? 409 : response.status === 401 ? 401 : 500
    throw new HttpError(status, message)
  }
  return data as T
}

export function rpcService<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  return postgrestRpc<T>(fn, args, keyHeaders(SERVICE_KEY()))
}

export function rpcAsUser<T>(
  authorization: string,
  fn: string,
  args: Record<string, unknown>
): Promise<T> {
  return postgrestRpc<T>(fn, args, { apikey: PUBLIC_KEY(), Authorization: authorization })
}

export function asaasEnv(): 'sandbox' | 'production' {
  return env('ASAAS_ENV', 'sandbox') === 'production' ? 'production' : 'sandbox'
}

function asaasBase(): string {
  return asaasEnv() === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3'
}

export function asaasCheckoutUrl(id: string): string {
  const host = asaasEnv() === 'production' ? 'https://www.asaas.com' : 'https://sandbox.asaas.com'
  return `${host}/checkoutSession/show?id=${encodeURIComponent(id)}`
}

export async function asaas<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${asaasBase()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'Avalix',
      access_token: env('ASAAS_API_KEY'),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  const text = await response.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!response.ok) {
    const errors = (data as { errors?: { description?: string }[] } | null)?.errors
    const detail = errors?.map((e) => e.description).filter(Boolean).join('; ')
    console.error(`asaas ${method} ${path} -> ${response.status} ${detail ?? ''}`)
    throw new HttpError(response.status === 404 ? 404 : 502,
      detail ? `Asaas recusou: ${detail}` : 'O serviço de pagamento não respondeu. Tente de novo em instantes.')
  }
  return data as T
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}
