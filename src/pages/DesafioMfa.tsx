import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
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
  const [factorsLoading, setFactorsLoading] = useState(true)

  const loadFactors = useCallback(async () => {
    setFactorsLoading(true)
    setError(null)
    const { data, error: listError } = await supabase.auth.mfa.listFactors()
    if (listError) {
      setFactorId(null)
      setError(normalizeAuthError(listError))
    } else {
      const factor = (data?.totp ?? []).find((item) => item.status === 'verified')
      setFactorId(factor?.id ?? null)
      if (!factor) setError('Nenhum fator verificado foi encontrado. Saia e entre novamente ou configure o 2FA.')
    }
    setFactorsLoading(false)
  }, [])

  useEffect(() => {
    void loadFactors()
  }, [loadFactors])

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
            aria-describedby={error ? 'mfa-error' : undefined}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="000000"
          />
        </div>
        {error ? <p id="mfa-error" role="alert" className="text-sm text-destructive">{error}</p> : null}
        {!factorId && !factorsLoading ? (
          <Button type="button" variant="outline" className="w-full" onClick={() => void loadFactors()}>
            Tentar carregar novamente
          </Button>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading || factorsLoading || !factorId}>
          {factorsLoading ? 'Carregando 2FA...' : loading ? 'Verificando...' : 'Verificar'}
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
