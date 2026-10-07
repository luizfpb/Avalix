import { useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { normalizeAuthError } from '../../lib/errors'
import { AuthLayout } from '../../components/AuthLayout'
import { Button } from '@/components/ui/button'
import type { EmailLink } from './emailLink'

// Tela intermediária do link do e-mail: o token só é validado no toque do
// botão (ver emailLink.ts). Sucesso emite PASSWORD_RECOVERY ou SIGNED_IN pelo
// SDK, e o AuthProvider/RouteGuard seguem dali como em qualquer login.
export function EmailLinkStep({
  link,
  title,
  subtitle,
  actionLabel,
  failureHelp,
  onDone,
}: {
  link: EmailLink
  title: string
  subtitle: string
  actionLabel: string
  failureHelp: ReactNode
  onDone?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type })
    setLoading(false)
    if (error) {
      setError(normalizeAuthError(error))
      return
    }
    onDone?.()
  }

  return (
    <AuthLayout title={title} subtitle={subtitle}>
      {error ? (
        <div className="space-y-4">
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2.5 text-sm leading-relaxed text-destructive"
          >
            {error}
          </p>
          <div className="text-center text-sm">{failureHelp}</div>
        </div>
      ) : (
        <Button type="button" className="w-full" disabled={loading} onClick={() => void confirm()}>
          {loading ? 'Verificando...' : actionLabel}
        </Button>
      )}
    </AuthLayout>
  )
}
