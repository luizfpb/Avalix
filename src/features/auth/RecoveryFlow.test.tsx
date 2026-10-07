// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const authFake = vi.hoisted(() => ({
  callback: null as null | ((event: AuthChangeEvent, session: Session | null) => void),
  session: null as Session | null,
  verifyOtp: vi.fn(),
}))
vi.mock('../../lib/supabase', () => ({
  clearPersistedAuthSession: vi.fn(),
  supabase: { auth: {
    getSession: async () => ({ data: { session: authFake.session }, error: null }),
    onAuthStateChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
      authFake.callback = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    },
    verifyOtp: authFake.verifyOtp,
    mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }) },
  } },
}))
vi.mock('../../lib/errlog', () => ({ setErrlogOrg: vi.fn() }))
import { AuthProvider } from './AuthProvider'
import { clearRecoveryFlow } from './recovery'
import RecuperarSenha from '../../pages/RecuperarSenha'

function session(suffix = '1') {
  const id = '10000000-0000-0000-0000-000000000001'
  const claims = { sub: id, session_id: `20000000-0000-0000-0000-00000000000${suffix}` }
  return { user: { id, email: 'ficticio@example.test' }, access_token: `header.${btoa(JSON.stringify(claims))}.signature` } as Session
}
beforeEach(() => { clearRecoveryFlow(); authFake.session = session() })
afterEach(() => { cleanup(); clearRecoveryFlow() })

function RecoveryApp({ url = '/recuperar-senha' }: { url?: string }) {
  return <QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[url]}><AuthProvider><RecuperarSenha /></AuthProvider></MemoryRouter></QueryClientProvider>
}

it('mantém Nova senha ao restaurar a sessão da recuperação em uma nova montagem', async () => {
  const first = render(<RecoveryApp />)
  await screen.findByLabelText('E-mail')
  await act(async () => authFake.callback!('PASSWORD_RECOVERY', authFake.session))
  expect(await screen.findByLabelText('Nova senha')).toBeTruthy()
  first.unmount()
  render(<RecoveryApp />)
  expect(await screen.findByLabelText('Nova senha')).toBeTruthy()
  expect(screen.queryByLabelText('E-mail')).toBeNull()
})

it('um login novo da mesma conta não herda a etapa de recuperação', async () => {
  render(<RecoveryApp />)
  await screen.findByLabelText('E-mail')
  await act(async () => authFake.callback!('PASSWORD_RECOVERY', authFake.session))
  await screen.findByLabelText('Nova senha')
  authFake.session = session('2')
  await act(async () => authFake.callback!('SIGNED_IN', authFake.session))
  expect(await screen.findByLabelText('E-mail')).toBeTruthy()
  expect(screen.queryByLabelText('Nova senha')).toBeNull()
})

const LINK = '/recuperar-senha?token_hash=a3f1c9e07b2d4458a3f1c9e07b2d4458&type=recovery'

it('o link do e-mail só gasta o token quando a pessoa toca em Continuar', async () => {
  authFake.session = null
  authFake.verifyOtp.mockImplementation(async () => {
    authFake.session = session()
    authFake.callback!('PASSWORD_RECOVERY', authFake.session)
    return { data: { session: authFake.session }, error: null }
  })
  render(<RecoveryApp url={LINK} />)
  const continuar = await screen.findByRole('button', { name: 'Continuar' })
  expect(authFake.verifyOtp).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(continuar))
  expect(authFake.verifyOtp).toHaveBeenCalledWith({
    token_hash: 'a3f1c9e07b2d4458a3f1c9e07b2d4458',
    type: 'recovery',
  })
  expect(await screen.findByLabelText('Nova senha')).toBeTruthy()
})

it('link vencido explica e oferece pedir outro', async () => {
  authFake.session = null
  authFake.verifyOtp.mockResolvedValue({
    data: { session: null },
    error: { code: 'otp_expired', message: 'Email link is invalid or has expired' },
  })
  render(<RecoveryApp url={LINK} />)
  await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Continuar' })))
  expect((await screen.findByRole('alert')).textContent).toBe('Este link expirou ou já foi usado. Peça um novo.')
  await act(async () => fireEvent.click(screen.getByRole('link', { name: 'Pedir um novo link' })))
  expect(await screen.findByLabelText('E-mail')).toBeTruthy()
})
