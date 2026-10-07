// Links dos e-mails de autenticação (cadastro e recuperação de senha).
//
// Os templates em supabase/templates não usam {{ .ConfirmationURL }}: esse
// link consome o token no primeiro GET, e filtros de e-mail (Outlook Safe
// Links, antivírus corporativo) abrem todo link para checar antes da pessoa.
// Ela clicava e recebia "link inválido". O e-mail traz só o token_hash para
// uma página nossa, e o token só é gasto quando a pessoa toca no botão.
export type EmailLinkType = 'recovery' | 'email'
export type EmailLink = { tokenHash: string; type: EmailLinkType }

// Hash hexadecimal do Supabase, com o prefixo pkce_ quando o fluxo é PKCE.
const TOKEN_HASH = /^[A-Za-z0-9_-]{16,256}$/

export function readEmailLink(search: string, expected: EmailLinkType): EmailLink | null {
  const params = new URLSearchParams(search)
  const tokenHash = params.get('token_hash')
  if (params.get('type') !== expected || !tokenHash || !TOKEN_HASH.test(tokenHash)) return null
  return { tokenHash, type: expected }
}
