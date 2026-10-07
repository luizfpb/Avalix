import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { normalizeAuthError } from '../lib/errors'
import { useAuth } from '../features/auth/context'
import { readEmailLink } from '../features/auth/emailLink'
import { EmailLinkStep } from '../features/auth/EmailLinkStep'
import { AuthLayout } from '../components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function RecuperarSenha() {
  const { isRecovering, signOut } = useAuth()
  const { search } = useLocation()
  const navigate = useNavigate()
  if (isRecovering) return <DefinirNovaSenha onDone={signOut} />
  const link = readEmailLink(search, 'recovery')
  if (link) {
    return (
      <EmailLinkStep
        link={link}
        title="Redefinir senha"
        subtitle="Toque em continuar para escolher uma nova senha."
        actionLabel="Continuar"
        failureHelp={
          <Link to="/recuperar-senha" className="font-medium text-primary hover:underline">
            Pedir um novo link
          </Link>
        }
        onDone={() => navigate('/recuperar-senha', { replace: true })}
      />
    )
  }
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
        subtitle="Se este e-mail tiver conta, enviamos um link para redefinir a senha. Ele vale por 1 hora."
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
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2.5 text-sm leading-relaxed text-destructive"
          >
            {error}
          </p>
        ) : null}
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
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2.5 text-sm leading-relaxed text-destructive"
          >
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Salvando...' : 'Salvar nova senha'}
        </Button>
      </form>
    </AuthLayout>
  )
}
