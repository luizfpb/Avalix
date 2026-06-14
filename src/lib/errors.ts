// Normaliza erros de autenticação do Supabase para mensagens em pt-BR.

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
