import { describe, it, expect } from 'vitest'
import { resolveRedirect, isPublicPath } from './routing'

describe('isPublicPath', () => {
  it('reconhece rotas públicas', () => {
    expect(isPublicPath('/login')).toBe(true)
    expect(isPublicPath('/cadastro')).toBe(true)
    expect(isPublicPath('/recuperar-senha')).toBe(true)
    expect(isPublicPath('/dashboard')).toBe(false)
  })
})

describe('resolveRedirect', () => {
  const base = { isRecovering: false } as const

  it('não decide nada enquanto auth carrega', () => {
    expect(
      resolveRedirect({ ...base, authStatus: 'loading', orgStatus: 'loading', pathname: '/dashboard' })
    ).toBeNull()
  })

  it('deslogado em rota protegida vai para /login', () => {
    expect(
      resolveRedirect({ ...base, authStatus: 'signedOut', orgStatus: 'absent', pathname: '/dashboard' })
    ).toBe('/login')
  })

  it('deslogado em rota pública fica', () => {
    expect(
      resolveRedirect({ ...base, authStatus: 'signedOut', orgStatus: 'absent', pathname: '/login' })
    ).toBeNull()
  })

  it('logado sem org vai para onboarding', () => {
    expect(
      resolveRedirect({ ...base, authStatus: 'signedIn', orgStatus: 'absent', pathname: '/dashboard' })
    ).toBe('/onboarding')
  })

  it('logado sem org já no onboarding fica', () => {
    expect(
      resolveRedirect({ ...base, authStatus: 'signedIn', orgStatus: 'absent', pathname: '/onboarding' })
    ).toBeNull()
  })

  it('logado com org saindo de /login vai pro dashboard', () => {
    expect(
      resolveRedirect({ ...base, authStatus: 'signedIn', orgStatus: 'present', pathname: '/login' })
    ).toBe('/dashboard')
  })

  it('logado com org em rota protegida fica', () => {
    expect(
      resolveRedirect({ ...base, authStatus: 'signedIn', orgStatus: 'present', pathname: '/avaliados' })
    ).toBeNull()
  })

  it('raiz vai pro destino certo conforme estado', () => {
    expect(resolveRedirect({ ...base, authStatus: 'signedOut', orgStatus: 'absent', pathname: '/' })).toBe('/login')
    expect(resolveRedirect({ ...base, authStatus: 'signedIn', orgStatus: 'absent', pathname: '/' })).toBe('/onboarding')
    expect(resolveRedirect({ ...base, authStatus: 'signedIn', orgStatus: 'present', pathname: '/' })).toBe('/dashboard')
  })

  it('logado com 2FA pendente vai para /mfa', () => {
    expect(
      resolveRedirect({
        ...base,
        authStatus: 'signedIn',
        orgStatus: 'present',
        pathname: '/dashboard',
        mfaRequired: true,
      })
    ).toBe('/mfa')
  })

  it('logado com 2FA pendente já no /mfa fica', () => {
    expect(
      resolveRedirect({
        ...base,
        authStatus: 'signedIn',
        orgStatus: 'present',
        pathname: '/mfa',
        mfaRequired: true,
      })
    ).toBeNull()
  })

  it('sai do /mfa quando o 2FA não é mais necessário', () => {
    expect(
      resolveRedirect({
        ...base,
        authStatus: 'signedIn',
        orgStatus: 'present',
        pathname: '/mfa',
        mfaRequired: false,
      })
    ).toBe('/dashboard')
  })

  it('modo recuperação segura na tela de nova senha', () => {
    expect(
      resolveRedirect({ authStatus: 'signedIn', orgStatus: 'present', pathname: '/dashboard', isRecovering: true })
    ).toBe('/recuperar-senha')
    expect(
      resolveRedirect({ authStatus: 'signedIn', orgStatus: 'present', pathname: '/recuperar-senha', isRecovering: true })
    ).toBeNull()
  })
})
