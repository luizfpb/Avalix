import { describe, it, expect } from 'vitest'
import {
  resolveRedirect,
  isPublicPath,
  isIntakePath,
  isWorkoutLinkPath,
  isPublicTokenPath,
} from './routing'
import { isPublicIntakeLocation } from '../features/pwa/updateCheck'

describe('isPublicPath', () => {
  it('reconhece rotas públicas', () => {
    expect(isPublicPath('/login')).toBe(true)
    expect(isPublicPath('/cadastro')).toBe(true)
    expect(isPublicPath('/recuperar-senha')).toBe(true)
    expect(isPublicPath('/dashboard')).toBe(false)
  })
})

describe('isIntakePath', () => {
  // Regressão: esta função cobria só `/a/` enquanto App.tsx, o PWA e o
  // anamnesis/intake repetiam o predicado completo inline. Ou seja, o guard de
  // rota tinha uma noção de "rota pública" diferente do resto do app, e não
  // cobria `/a` — que é justamente a forma ATUAL do link (token no fragmento).
  it('cobre a forma atual (/a, token no fragmento) e a legada (/a/<token>)', () => {
    expect(isIntakePath('/a')).toBe(true)
    expect(isIntakePath('/a/token-legado')).toBe(true)
  })

  it('não confunde rotas que apenas começam com a letra a', () => {
    expect(isIntakePath('/avaliados')).toBe(false)
    expect(isIntakePath('/agenda')).toBe(false)
    expect(isIntakePath('/auditoria')).toBe(false)
    expect(isIntakePath('/dashboard')).toBe(false)
  })

  it('o predicado do PWA e o do roteamento respondem a mesma coisa', () => {
    for (const p of ['/a', '/a/x', '/avaliados', '/agenda', '/', '/login']) {
      expect(isPublicIntakeLocation(p)).toBe(isIntakePath(p))
    }
  })
})

describe('isWorkoutLinkPath / isPublicTokenPath', () => {
  it('reconhece a pagina do treino do aluno', () => {
    expect(isWorkoutLinkPath('/t')).toBe(true)
    expect(isWorkoutLinkPath('/t/qualquer')).toBe(true)
  })

  it('nao confunde rotas que apenas comecam com t', () => {
    expect(isWorkoutLinkPath('/treinos')).toBe(false)
    expect(isWorkoutLinkPath('/dashboard')).toBe(false)
    expect(isWorkoutLinkPath('/a')).toBe(false)
  })

  it('o predicado combinado cobre os dois fluxos por token', () => {
    for (const p of ['/a', '/a/x', '/t', '/t/x']) {
      expect(isPublicTokenPath(p)).toBe(true)
    }
    for (const p of ['/login', '/dashboard', '/avaliados', '/treinos']) {
      expect(isPublicTokenPath(p)).toBe(false)
    }
  })

  it('o predicado do PWA acompanha o combinado, nao so a anamnese', () => {
    // a regressao que isto trava: a pagina do aluno abrir e o PWA trata-la
    // como rota autenticada, ou o guard mandar o aluno para /login
    for (const p of ['/a', '/t', '/t/x', '/dashboard']) {
      expect(isPublicIntakeLocation(p)).toBe(isPublicTokenPath(p))
    }
  })

  it('a pagina do treino nunca redireciona, deslogado ou logado', () => {
    for (const authStatus of ['signedOut', 'signedIn'] as const) {
      expect(
        resolveRedirect({
          authStatus,
          orgStatus: 'absent',
          pathname: '/t',
          isRecovering: false,
        })
      ).toBeNull()
    }
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
