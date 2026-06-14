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
