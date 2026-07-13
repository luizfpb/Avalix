import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import App from '../../App'
import { startDraftHousekeeping } from '../../lib/draft'
import { OrganizationProvider } from '../organization/OrganizationProvider'
import { useOrganization } from '../organization/context'
import { PwaUpdatePrompt } from '../pwa/PwaUpdatePrompt'
import { isPublicIntakeLocation } from '../pwa/updateCheck'
import { AuthProvider } from './AuthProvider'
import { setPrivateClientScope } from './clientPrivacy'
import { useAuth } from './context'

function PrivateScope({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { organization } = useOrganization()
  const desiredScope = `${user?.id ?? ''}:${organization?.id ?? ''}`
  const [appliedScope, setAppliedScope] = useState<string | null>(null)

  useEffect(() => {
    setPrivateClientScope(user?.id ?? null, organization?.id ?? null)
    setAppliedScope(desiredScope)
  }, [desiredScope, user?.id, organization?.id])

  if (appliedScope !== desiredScope) {
    return <p role="status" className="p-4 text-sm text-muted-foreground">Preparando sessão...</p>
  }
  return children
}

function PublicScope({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setPrivateClientScope(null, null)
    setReady(true)
  }, [])
  return ready ? children : null
}

export function AppProviders() {
  const location = useLocation()
  const isPublicIntake = isPublicIntakeLocation(location.pathname)

  useEffect(() => startDraftHousekeeping(), [])

  if (isPublicIntake) {
    return <PublicScope><App /></PublicScope>
  }

  return (
    <AuthProvider>
      <OrganizationProvider>
        <PrivateScope>
          <App />
          <PwaUpdatePrompt />
        </PrivateScope>
      </OrganizationProvider>
    </AuthProvider>
  )
}
