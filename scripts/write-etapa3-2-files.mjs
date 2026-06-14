#!/usr/bin/env node
// scripts/write-etapa3-2-files.mjs
// Cria/substitui os arquivos da Etapa 3.2 do BodyTrack.
// Assume estar em <raiz-do-projeto>/scripts/. Escreve relativo a essa raiz,
// entao funciona independente de onde voce rodar (desde que esteja em scripts/).
// NAO toca em vite.config.ts, package.json, nem nas migrations 0001/0002.
// NAO usa service_role em lugar nenhum.

import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

// Arquivos que substituem versoes existentes (apenas informativo no log).
const REPLACED = new Set(['src/vite-env.d.ts', 'src/main.tsx', 'src/App.tsx'])

// Cada conteudo comeca com uma quebra de linha (por causa da crase na linha de cima);
// normalize() remove so essa primeira quebra e mantem a quebra final.
function normalize(s) {
  return s.replace(/^\n/, '')
}

const files = {
  'src/lib/supabase.ts': `
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não encontradas. ' +
      'Confira o arquivo .env.local na raiz do projeto.'
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
`,

  'src/lib/errors.ts': `
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
`,

  'src/lib/errors.test.ts': `
import { describe, it, expect } from 'vitest'
import { normalizeAuthError } from './errors'

describe('normalizeAuthError', () => {
  it('mapeia code invalid_credentials', () => {
    expect(normalizeAuthError({ code: 'invalid_credentials' })).toMatch(/incorretos/i)
  })
  it('mapeia email_not_confirmed', () => {
    expect(normalizeAuthError({ code: 'email_not_confirmed' })).toMatch(/confirme/i)
  })
  it('cai para o texto quando não há code', () => {
    expect(normalizeAuthError({ message: 'Invalid login credentials' })).toMatch(/incorretos/i)
  })
  it('aceita string', () => {
    expect(normalizeAuthError('Email not confirmed')).toMatch(/confirme/i)
  })
  it('tem fallback genérico', () => {
    expect(normalizeAuthError(null)).toMatch(/errado/i)
    expect(normalizeAuthError({})).toMatch(/errado/i)
  })
  it('preserva mensagem desconhecida não vazia', () => {
    expect(normalizeAuthError({ message: 'Coisa estranha' })).toBe('Coisa estranha')
  })
})
`,

  'src/lib/routing.ts': `
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
}

// Decide para onde mandar o usuário. null = fica onde está.
export function resolveRedirect(input: RedirectInput): string | null {
  const { authStatus, orgStatus, pathname, isRecovering } = input

  if (authStatus === 'loading') return null

  if (isRecovering) {
    return pathname === '/recuperar-senha' ? null : '/recuperar-senha'
  }

  if (authStatus === 'signedOut') {
    return isPublicPath(pathname) ? null : '/login'
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
`,

  'src/lib/routing.test.ts': `
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

  it('modo recuperação segura na tela de nova senha', () => {
    expect(
      resolveRedirect({ authStatus: 'signedIn', orgStatus: 'present', pathname: '/dashboard', isRecovering: true })
    ).toBe('/recuperar-senha')
    expect(
      resolveRedirect({ authStatus: 'signedIn', orgStatus: 'present', pathname: '/recuperar-senha', isRecovering: true })
    ).toBeNull()
  })
})
`,

  'src/features/auth/context.ts': `
import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { AuthStatus } from '../../lib/routing'

export interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  user: User | null
  isRecovering: boolean
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.')
  return ctx
}
`,

  'src/features/auth/AuthProvider.tsx': `
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { AuthContext, type AuthContextValue } from './context'
import type { AuthStatus } from '../../lib/routing'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [isRecovering, setIsRecovering] = useState(false)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setStatus(data.session ? 'signedIn' : 'signedOut')
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY') setIsRecovering(true)
      if (event === 'SIGNED_OUT') setIsRecovering(false)
      setSession(newSession)
      setStatus(newSession ? 'signedIn' : 'signedOut')
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      isRecovering,
      signOut: async () => {
        await supabase.auth.signOut()
        setIsRecovering(false)
      },
    }),
    [status, session, isRecovering]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
`,

  'src/features/organization/context.ts': `
import { createContext, useContext } from 'react'
import type { Database } from '../../database.types'

// ATENÇÃO (Ponto 1): confira estes nomes no database.types.ts (seção Tables).
// Se o TS sublinhar 'organizations' ou 'memberships', troque pelos nomes reais.
export type OrganizationRow = Database['public']['Tables']['organizations']['Row']
export type MembershipRow = Database['public']['Tables']['memberships']['Row']

export type OrgStatus = 'loading' | 'absent' | 'present' | 'error'

export interface OrganizationContextValue {
  status: OrgStatus
  organization: OrganizationRow | null
  membership: MembershipRow | null
  role: string | null
  refresh: () => Promise<void>
}

export const OrganizationContext = createContext<OrganizationContextValue | null>(null)

export function useOrganization(): OrganizationContextValue {
  const ctx = useContext(OrganizationContext)
  if (!ctx) throw new Error('useOrganization precisa estar dentro de <OrganizationProvider>.')
  return ctx
}
`,

  'src/features/organization/OrganizationProvider.tsx': `
import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/context'
import {
  OrganizationContext,
  type OrganizationContextValue,
  type OrganizationRow,
  type MembershipRow,
  type OrgStatus,
} from './context'

// ATENÇÃO (Ponto 1): 'memberships', 'organizations' e 'user_id' precisam bater
// com o seu schema. Se a relação for ambígua, use 'organizations!nome_da_fk(*)'.
async function fetchMembership(userId: string): Promise<{
  membership: MembershipRow | null
  organization: OrganizationRow | null
}> {
  const { data, error } = await supabase
    .from('memberships')
    .select('*, organizations(*)')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return { membership: null, organization: null }

  const row = data as MembershipRow & {
    organizations: OrganizationRow | OrganizationRow[] | null
  }
  const organization = Array.isArray(row.organizations)
    ? row.organizations[0] ?? null
    : row.organizations ?? null

  const { organizations: _ignored, ...membership } = row
  return { membership: membership as MembershipRow, organization }
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, status: authStatus } = useAuth()
  const userId = user?.id ?? null

  const query = useQuery({
    queryKey: ['organization', userId],
    queryFn: () => fetchMembership(userId as string),
    enabled: authStatus === 'signedIn' && !!userId,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  })

  const status: OrgStatus = useMemo(() => {
    if (authStatus !== 'signedIn') return 'absent'
    if (query.isError) return 'error'
    if (query.isPending) return 'loading'
    return query.data?.organization ? 'present' : 'absent'
  }, [authStatus, query.isError, query.isPending, query.data])

  const value = useMemo<OrganizationContextValue>(
    () => ({
      status,
      organization: query.data?.organization ?? null,
      membership: query.data?.membership ?? null,
      role:
        (query.data?.membership as { role?: string | null } | null | undefined)?.role ?? null,
      refresh: async () => {
        await query.refetch()
      },
    }),
    [status, query]
  )

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>
}
`,

  'src/routes/RouteGuard.tsx': `
import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'
import { resolveRedirect } from '../lib/routing'

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      {children}
    </div>
  )
}

export function RouteGuard({ children }: { children: ReactNode }) {
  const { status: authStatus, isRecovering } = useAuth()
  const org = useOrganization()
  const location = useLocation()

  const authLoading = authStatus === 'loading'
  const orgLoading = authStatus === 'signedIn' && org.status === 'loading'

  if (authLoading || orgLoading) {
    return (
      <FullScreen>
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </FullScreen>
    )
  }

  if (authStatus === 'signedIn' && org.status === 'error') {
    return (
      <FullScreen>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar sua organização.
          </p>
          <button
            onClick={() => org.refresh()}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Tentar de novo
          </button>
        </div>
      </FullScreen>
    )
  }

  const orgStatus = org.status === 'present' ? 'present' : 'absent'

  const target = resolveRedirect({
    authStatus,
    orgStatus,
    pathname: location.pathname,
    isRecovering,
  })

  if (target && target !== location.pathname) {
    return <Navigate to={target} replace />
  }

  return <>{children}</>
}
`,

  'src/components/AuthLayout.tsx': `
import type { ReactNode } from 'react'

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold">BodyTrack</h1>
          <p className="mt-1 text-sm font-medium">{title}</p>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </div>
  )
}
`,

  'src/components/AppShell.tsx': `
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/avaliados', label: 'Avaliados' },
  { to: '/configuracoes', label: 'Configurações' },
]

export function AppShell() {
  const { user, signOut } = useAuth()
  const { organization } = useOrganization()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none">BodyTrack</p>
            <p className="truncate text-xs text-muted-foreground">
              {organization?.name ?? 'Sem organização'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <button
              onClick={() => signOut()}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              Sair
            </button>
          </div>
        </div>
        <nav className="mx-auto max-w-5xl px-4">
          <ul className="flex gap-1 overflow-x-auto">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      'inline-block whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
                      isActive
                        ? 'border-foreground text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
`,

  'src/pages/Login.tsx': `
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { normalizeAuthError } from '../lib/errors'
import { AuthLayout } from '../components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setLoading(false)
    if (error) {
      setError(normalizeAuthError(error))
      return
    }
    // Sucesso: o RouteGuard redireciona quando a sessão muda.
  }

  return (
    <AuthLayout title="Entrar">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>
      <div className="mt-4 flex items-center justify-between text-xs">
        <Link to="/recuperar-senha" className="text-muted-foreground hover:text-foreground">
          Esqueci minha senha
        </Link>
        <Link to="/cadastro" className="text-muted-foreground hover:text-foreground">
          Criar conta
        </Link>
      </div>
    </AuthLayout>
  )
}
`,

  'src/pages/Cadastro.tsx': `
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { normalizeAuthError } from '../lib/errors'
import { AuthLayout } from '../components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Cadastro() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin + '/login' },
    })
    setLoading(false)
    if (error) {
      setError(normalizeAuthError(error))
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <AuthLayout
        title="Confirme seu e-mail"
        subtitle="Enviamos um link de confirmação. Abra seu e-mail (cheque o spam) e clique no link para ativar a conta."
      >
        <Link
          to="/login"
          className="block text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Voltar para o login
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Criar conta">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres.</p>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Criando...' : 'Criar conta'}
        </Button>
      </form>
      <div className="mt-4 text-center text-xs">
        <Link to="/login" className="text-muted-foreground hover:text-foreground">
          Já tenho conta
        </Link>
      </div>
    </AuthLayout>
  )
}
`,

  'src/pages/RecuperarSenha.tsx': `
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { normalizeAuthError } from '../lib/errors'
import { useAuth } from '../features/auth/context'
import { AuthLayout } from '../components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function RecuperarSenha() {
  const { isRecovering, signOut } = useAuth()
  if (isRecovering) return <DefinirNovaSenha onDone={signOut} />
  return <PedirReset />
}

function PedirReset() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + '/recuperar-senha',
    })
    setLoading(false)
    if (error) {
      setError(normalizeAuthError(error))
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout
        title="Verifique seu e-mail"
        subtitle="Se este e-mail tiver conta, enviamos um link para redefinir a senha. O link abre esta tela já no modo de nova senha."
      >
        <Link
          to="/login"
          className="block text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Voltar para o login
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Informe seu e-mail para receber o link de redefinição."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Enviando...' : 'Enviar link'}
        </Button>
      </form>
      <div className="mt-4 text-center text-xs">
        <Link to="/login" className="text-muted-foreground hover:text-foreground">
          Voltar para o login
        </Link>
      </div>
    </AuthLayout>
  )
}

function DefinirNovaSenha({ onDone }: { onDone: () => Promise<void> }) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setLoading(false)
      setError(normalizeAuthError(error))
      return
    }
    await onDone()
    setLoading(false)
    navigate('/login', { replace: true })
  }

  return (
    <AuthLayout title="Definir nova senha" subtitle="Escolha uma nova senha para sua conta.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">Nova senha</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres.</p>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Salvando...' : 'Salvar nova senha'}
        </Button>
      </form>
    </AuthLayout>
  )
}
`,

  'src/pages/Onboarding.tsx': `
import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeAuthError } from '../lib/errors'
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const SUBJECT_TERMS = [
  { value: 'aluno', label: 'Aluno' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'paciente', label: 'Paciente' },
  { value: 'atleta', label: 'Atleta' },
  { value: 'avaliado', label: 'Avaliado' },
] as const

export default function Onboarding() {
  const { signOut } = useAuth()
  const { refresh } = useOrganization()
  const [nome, setNome] = useState('')
  const [termo, setTermo] = useState<string>('aluno')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    // ATENÇÃO (Ponto 2): nomes dos parâmetros devem bater com a função no banco.
    const { error } = await supabase.rpc('create_organization', {
      org_name: nome.trim(),
      subject_term: termo,
    })
    if (error) {
      setLoading(false)
      setError(normalizeAuthError(error))
      return
    }
    await refresh() // recarrega a org -> o RouteGuard manda pro dashboard
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold">Quase lá</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie sua organização para começar a usar o BodyTrack.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome da organização ou profissional</Label>
            <Input
              id="nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Estúdio Corpo & Movimento"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="termo">Como você chama quem é avaliado?</Label>
            <select
              id="termo"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {SUBJECT_TERMS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Esse termo aparece nas telas do app (ex.: lista de {termo}s).
            </p>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button
            type="submit"
            className="w-full"
            disabled={loading || nome.trim().length === 0}
          >
            {loading ? 'Criando...' : 'Criar organização'}
          </Button>
        </form>
        <button
          onClick={() => signOut()}
          className="mt-4 block w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Sair
        </button>
      </div>
    </div>
  )
}
`,

  'src/pages/Dashboard.tsx': `
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'

const cards = [
  { title: 'Avaliados', desc: 'Cadastro e histórico de quem você avalia.', to: '/avaliados', ready: true },
  { title: 'Nova avaliação', desc: 'Dobras, circunferências e composição.', to: null, ready: false },
  { title: 'Postural', desc: 'Captura e comparação de fotos posturais.', to: null, ready: false },
  { title: 'Relatórios', desc: 'PDF e exportações.', to: null, ready: false },
  { title: 'Configurações', desc: 'Conta, organização e preferências.', to: '/configuracoes', ready: true },
]

export default function Dashboard() {
  const { user } = useAuth()
  const { organization, role } = useOrganization()

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {organization?.name ?? 'Organização'} {' · '} {user?.email}
          {role ? ' · ' + role : ''}
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const inner = (
            <Card
              className={c.ready ? 'h-full transition-colors hover:bg-accent' : 'h-full opacity-60'}
            >
              <CardHeader>
                <CardTitle className="text-base">{c.title}</CardTitle>
                <CardDescription>{c.desc}</CardDescription>
              </CardHeader>
              {!c.ready ? (
                <CardContent className="text-xs text-muted-foreground">Em breve</CardContent>
              ) : null}
            </Card>
          )
          return c.to ? (
            <Link key={c.title} to={c.to} className="block">
              {inner}
            </Link>
          ) : (
            <div key={c.title}>{inner}</div>
          )
        })}
      </section>
    </div>
  )
}
`,

  'src/pages/Avaliados.tsx': `
import { useOrganization } from '../features/organization/context'

export default function Avaliados() {
  const { organization } = useOrganization()
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Avaliados</h1>
      <p className="text-sm text-muted-foreground">
        Aqui vai ficar a lista de avaliados de {organization?.name ?? 'sua organização'}. O
        cadastro real entra numa próxima etapa.
      </p>
    </div>
  )
}
`,

  'src/pages/Configuracoes.tsx': `
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'

export default function Configuracoes() {
  const { user } = useAuth()
  const { organization, role } = useOrganization()
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Configurações</h1>

      <section className="space-y-1">
        <h2 className="text-sm font-medium">Conta</h2>
        <p className="text-sm text-muted-foreground">E-mail: {user?.email}</p>
        <p className="text-sm text-muted-foreground">
          Autenticação em dois fatores (MFA): será adicionada na próxima etapa.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="text-sm font-medium">Organização</h2>
        <p className="text-sm text-muted-foreground">Nome: {organization?.name ?? '-'}</p>
        <p className="text-sm text-muted-foreground">Seu papel: {role ?? '-'}</p>
      </section>
    </div>
  )
}
`,

  'src/vite-env.d.ts': `
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
`,

  'src/main.tsx': `
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { AuthProvider } from './features/auth/AuthProvider'
import { OrganizationProvider } from './features/organization/OrganizationProvider'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <OrganizationProvider>
            <App />
          </OrganizationProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
`,

  'src/App.tsx': `
import { Navigate, Route, Routes } from 'react-router-dom'
import { RouteGuard } from './routes/RouteGuard'
import { AppShell } from './components/AppShell'
import Login from './pages/Login'
import Cadastro from './pages/Cadastro'
import RecuperarSenha from './pages/RecuperarSenha'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Avaliados from './pages/Avaliados'
import Configuracoes from './pages/Configuracoes'

export default function App() {
  return (
    <RouteGuard>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/recuperar-senha" element={<RecuperarSenha />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/avaliados" element={<Avaliados />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
        </Route>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RouteGuard>
  )
}
`,
}

let created = 0
let replaced = 0

for (const [rel, content] of Object.entries(files)) {
  const abs = join(root, rel)
  const existed = existsSync(abs)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, normalize(content), 'utf8')
  if (existed || REPLACED.has(rel)) {
    replaced++
    console.log('substituido: ' + rel)
  } else {
    created++
    console.log('criado:      ' + rel)
  }
}

console.log('')
console.log('Resumo: ' + created + ' criado(s), ' + replaced + ' substituido(s).')
console.log('Raiz usada: ' + root)
console.log('')
console.log('=== ACAO MANUAL (o script NAO altera estes dois arquivos) ===')
console.log('')
console.log('1) vite.config.ts')
console.log('   a) troque o import do defineConfig:')
console.log("        de:   import { defineConfig } from 'vite'")
console.log("        para: import { defineConfig } from 'vitest/config'")
console.log('   b) adicione o bloco test dentro do objeto de config:')
console.log('        test: {')
console.log("          environment: 'node',")
console.log("          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],")
console.log('        },')
console.log('')
console.log('2) package.json -> dentro de "scripts", adicione:')
console.log('        "test": "vitest run",')
console.log('        "test:watch": "vitest"')
console.log('')
console.log('Depois: npm install / npx shadcn add / npm run test / npm run dev / npm run build')
