import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { normalizeAuthError } from '../lib/errors'
import { useAuth } from '../features/auth/context'
import { AuthLayout } from '../components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function DesafioMfa() {
  const navigate = useNavigate()
  const { refreshMfa, signOut } = useAuth()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (!active) return
      const totp = data?.totp ?? []
      const factor = totp.find((f) => f.status === 'verified') ?? totp[0]
      setFactorId(factor?.id ?? null)
    })
    return () => {
      active = false
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!factorId) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    })
    if (error) {
      setLoading(false)
      setError(normalizeAuthError(error))
      return
    }
    await refreshMfa()
    setLoading(false)
    navigate('/dashboard', { replace: true })
  }

  return (
    <AuthLayout
      title="Verificação em dois fatores"
      subtitle="Digite o código do seu app autenticador."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="code">Código</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="000000"
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading || !factorId}>
          {loading ? 'Verificando...' : 'Verificar'}
        </Button>
      </form>
      <button
        onClick={() => signOut()}
        className="mt-4 block w-full text-center text-xs text-muted-foreground hover:text-foreground"
      >
        Sair
      </button>
    </AuthLayout>
  )
}
