// Normaliza erros do Supabase (auth e banco/RLS) para mensagens em pt-BR.

type MaybeAuthError = {
  code?: string
  message?: string
  status?: number
}

function asAuthError(error: unknown): MaybeAuthError {
  if (typeof error === 'string') return { message: error }
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>
    return {
      code: typeof e.code === 'string' ? e.code : undefined,
      message: typeof e.message === 'string' ? e.message : undefined,
      status: typeof e.status === 'number' ? e.status : undefined,
    }
  }
  return {}
}

const MESSAGES_BY_CODE: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed:
    'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada (e o spam).',
  user_already_exists: 'Este e-mail já está cadastrado. Tente fazer login.',
  email_exists: 'Este e-mail já está cadastrado. Tente fazer login.',
  weak_password: 'Senha muito fraca. Use no mínimo 6 caracteres.',
  over_email_send_rate_limit:
    'Muitos e-mails enviados. Aguarde alguns minutos e tente de novo.',
  over_request_rate_limit:
    'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  validation_failed: 'Dados inválidos. Confira os campos e tente de novo.',
  same_password: 'A nova senha precisa ser diferente da anterior.',
}

export function normalizeAuthError(error: unknown): string {
  const { code, message } = asAuthError(error)

  if (code && MESSAGES_BY_CODE[code]) return MESSAGES_BY_CODE[code]

  const text = (message ?? '').toLowerCase()
  if (text.includes('invalid login credentials')) return MESSAGES_BY_CODE.invalid_credentials
  if (text.includes('email not confirmed')) return MESSAGES_BY_CODE.email_not_confirmed
  if (text.includes('already registered') || text.includes('already exists'))
    return MESSAGES_BY_CODE.user_already_exists
  if (text.includes('password should be at least')) return MESSAGES_BY_CODE.weak_password
  if (text.includes('rate limit')) return MESSAGES_BY_CODE.over_request_rate_limit

  return message && message.trim().length > 0
    ? message
    : 'Algo deu errado. Tente novamente em instantes.'
}

// Erros de banco (PostgREST/RLS/constraints) e de rede, traduzidos pro usuário.
// As exceções dos nossos próprios triggers já vêm em pt-BR e passam direto.
export function normalizeDbError(error: unknown): string {
  const { code, message } = asAuthError(error)
  const text = (message ?? '').toLowerCase()

  // 23505 unique / 23503 foreign key / 42501 privilégio (inclui RLS)
  if (code === '23505' || text.includes('duplicate key value')) {
    return 'Já existe um registro igual a este. Confira os dados e tente de novo.'
  }
  if (code === '23503' || text.includes('violates foreign key constraint')) {
    return 'Este registro está em uso por outro dado e não pode ser alterado ou excluído.'
  }
  if (code === '42501' || text.includes('row-level security')) {
    return 'Ação bloqueada pelas regras de acesso — confira se o consentimento está vigente e se você tem permissão.'
  }
  if (text.includes('jwt expired') || text.includes('jwt is expired')) {
    return 'Sessão expirada. Faça login de novo.'
  }
  if (
    text.includes('failed to fetch') ||
    text.includes('networkerror') ||
    text.includes('fetch failed') ||
    text.includes('load failed')
  ) {
    return 'Falha de conexão. Verifique sua internet e tente de novo.'
  }

  return message && message.trim().length > 0
    ? message
    : 'Algo deu errado. Tente novamente em instantes.'
}
