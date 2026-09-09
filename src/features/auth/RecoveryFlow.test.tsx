// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const authFake = vi.hoisted(() => ({
  callback: null as null | ((event: AuthChangeEvent, session: Session | null) => void),
  session: null as Session | null,
}))
vi.mock('../../lib/supabase', () => ({
  clearPersistedAuthSession: vi.fn(),
  supabase: { auth: {
    getSession: async () => ({ data: { session: authFake.session }, error: null }),
    onAuthStateChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
      authFake.callback = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    },
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

function RecoveryApp() {
  return <QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/recuperar-senha']}><AuthProvider><RecuperarSenha /></AuthProvider></MemoryRouter></QueryClientProvider>
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
