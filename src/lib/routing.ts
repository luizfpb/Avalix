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
