// Retry com backoff para erros transitórios (5xx/Cloudflare 52x, 408/429,
// queda de conexão ou download truncado). Erros permanentes (400/401/403/404)
// falham imediatamente sem mascarar problemas de configuração ou permissão.

const TRANSIENT_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504, 520, 522, 524])
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
])

const DEFAULT_DELAYS_MS = [5_000, 15_000, 30_000]

export function isTransientError(error) {
  if (!error || typeof error !== 'object') return false
  if (error.transient === true) return true

  const statusCandidates = [
    error.status,
    error.statusCode,
    error.originalError?.status,
    error.originalError?.statusCode,
  ]
  for (const raw of statusCandidates) {
    const code = Number(raw)
    if (Number.isInteger(code) && TRANSIENT_HTTP_STATUS.has(code)) return true
  }

  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true

  const codes = [error.code, error.cause?.code]
  if (codes.some((code) => typeof code === 'string' && TRANSIENT_NETWORK_CODES.has(code))) {
    return true
  }

  if (typeof error.message === 'string' && /fetch failed|network|socket hang up|timed out/i.test(error.message)) {
    return true
  }

  return false
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetry(label, fn, options = {}) {
  const {
    attempts = 4,
    delaysMs = DEFAULT_DELAYS_MS,
    sleep = defaultSleep,
    onRetry = (attempt, delayMs, error) => {
      const detail = error?.status ?? error?.statusCode ?? error?.code ?? error?.message ?? 'erro transitório'
      console.warn(
        `Aviso: ${label} falhou na tentativa ${attempt}/${attempts} (${detail}); tentando novamente em ${Math.round(delayMs / 1000)}s...`
      )
    },
  } = options

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt)
    } catch (error) {
      if (attempt >= attempts || !isTransientError(error)) {
        throw error
      }
      const delayMs = delaysMs[Math.min(attempt - 1, delaysMs.length - 1)] ?? 5_000
      onRetry(attempt, delayMs, error)
      await sleep(delayMs)
    }
  }
}
