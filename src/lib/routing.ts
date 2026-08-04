export const PUBLIC_ROUTES = ['/login', '/cadastro', '/recuperar-senha'] as const
export const PROTECTED_ROUTES = [
  '/dashboard',
  '/avaliados',
  '/configuracoes',
  '/onboarding',
] as const

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn'
export type OrgStatus = 'loading' | 'absent' | 'present'

export function isPublicPath(pathname: string): boolean {
  return (PUBLIC_ROUTES as readonly string[]).includes(pathname)
}

// Página pública da anamnese respondida pelo aluno (link com token). Fica fora
// de toda a lógica de auth/org: qualquer visitante, logado ou não, acessa.
//
// Duas formas de URL, ambas públicas:
//   /a          -> forma ATUAL, com o token no fragmento (#), que não é enviado
//                  ao servidor nem entra em log/Referer.
//   /a/<token>  -> forma LEGADA, ainda aceita para links já distribuídos.
//
// Esta função é a definição única de "rota pública do aluno". Ela existia aqui
// cobrindo só `/a/`, enquanto App.tsx, features/pwa/updateCheck e
// anamnesis/intake repetiam o predicado completo inline — ou seja, o guard de
// rota tinha uma noção de rota pública DIFERENTE da do resto do app, sem cobrir
// a forma que é a atual. Consolidado aqui para não haver duas respostas para a
// mesma pergunta.
export function isIntakePath(pathname: string): boolean {
  return pathname === '/a' || pathname.startsWith('/a/')
}

export type RedirectInput = {
  authStatus: AuthStatus
  orgStatus: OrgStatus
  pathname: string
  isRecovering: boolean
  mfaRequired?: boolean
}

// Decide para onde mandar o usuário. null = fica onde está.
export function resolveRedirect(input: RedirectInput): string | null {
  const { authStatus, orgStatus, pathname, isRecovering, mfaRequired = false } = input

  if (isIntakePath(pathname)) return null
  if (authStatus === 'loading') return null

  if (isRecovering) {
    return pathname === '/recuperar-senha' ? null : '/recuperar-senha'
  }

  if (authStatus === 'signedOut') {
    return isPublicPath(pathname) ? null : '/login'
  }

  // autenticado, mas com 2FA pendente: bloqueia tudo até concluir o desafio
  if (mfaRequired) {
    return pathname === '/mfa' ? null : '/mfa'
  }
  if (pathname === '/mfa') {
    return '/dashboard'
  }

  if (orgStatus === 'loading') return null

  if (orgStatus === 'absent') {
    return pathname === '/onboarding' ? null : '/onboarding'
  }

  if (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/cadastro' ||
    pathname === '/onboarding'
  ) {
    return '/dashboard'
  }

  return null
}
