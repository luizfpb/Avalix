import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Factor } from '@supabase/supabase-js'
import { User, ShieldCheck, Building2, Palette, Sun, Moon, Monitor, Dumbbell, Calculator, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { normalizeAuthError } from '../lib/errors'
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'
import { useTheme, type Theme } from '../features/theme/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default function Configuracoes() {
  const { user } = useAuth()
  const { organization, role } = useOrganization()
  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>

      <AppearanceCard />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="size-4 text-muted-foreground" /> Conta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Info label="E-mail" value={user?.email ?? '-'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-muted-foreground" /> Verificação em dois fatores
            (2FA)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MfaSettings />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4 text-muted-foreground" /> Organização
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Info label="Nome" value={organization?.name ?? '-'} />
          <Info label="Seu papel" value={role ?? '-'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Dumbbell className="size-4 text-muted-foreground" /> Biblioteca de exercícios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            to="/exercicios"
            className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent"
          >
            <span>
              Gerenciar exercícios
              <span className="block text-xs text-muted-foreground">
                Catálogo global + os exercícios criados pela sua organização
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="size-4 text-muted-foreground" /> Ferramentas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            to="/ferramentas/1rm"
            className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent"
          >
            <span>
              Calculadora de carga (1RM)
              <span className="block text-xs text-muted-foreground">
                Estima 1RM por carga×reps e gera a tabela de %1RM
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="block text-sm">{value}</span>
    </div>
  )
}

const THEME_OPTS: { v: Theme; label: string; icon: typeof Sun }[] = [
  { v: 'light', label: 'Claro', icon: Sun },
  { v: 'dark', label: 'Escuro', icon: Moon },
  { v: 'system', label: 'Sistema', icon: Monitor },
]

function AppearanceCard() {
  const { theme, setTheme } = useTheme()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="size-4 text-muted-foreground" /> Aparência
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="inline-flex rounded-md border bg-card p-1">
          {THEME_OPTS.map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setTheme(o.v)}
              className={[
                'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors',
                theme === o.v
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              <o.icon className="size-4" /> {o.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

type Enrolling = { factorId: string; qr: string; secret: string }

function MfaSettings() {
  const { refreshMfa } = useAuth()
  const [factors, setFactors] = useState<Factor[]>([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function reload() {
    setLoading(true)
    const { data } = await supabase.auth.mfa.listFactors()
    setFactors(data?.totp ?? [])
    setLoading(false)
  }
  useEffect(() => {
    void reload()
  }, [])

  const verified = factors.find((f) => f.status === 'verified')

  async function startEnroll() {
    setError(null)
    setBusy(true)
    try {
      // remove fatores pendentes (não verificados) pra não acumular
      for (const f of factors.filter((f) => f.status === 'unverified')) {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'AvalixFit',
      })
      if (error || !data) {
        setError(normalizeAuthError(error))
        return
      }
      setEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    } finally {
      setBusy(false)
    }
  }

  async function confirmEnroll(e: FormEvent) {
    e.preventDefault()
    if (!enrolling) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrolling.factorId,
      code: code.trim(),
    })
    setBusy(false)
    if (error) {
      setError(normalizeAuthError(error))
      return
    }
    setEnrolling(null)
    setCode('')
    await refreshMfa()
    await reload()
  }

  async function cancelEnroll() {
    if (enrolling) await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId })
    setEnrolling(null)
    setCode('')
    setError(null)
    await reload()
  }

  async function remove() {
    if (!verified) return
    if (!window.confirm('Remover a verificação em dois fatores desta conta?')) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.mfa.unenroll({ factorId: verified.id })
    setBusy(false)
    if (error) {
      setError(normalizeAuthError(error))
      return
    }
    await refreshMfa()
    await reload()
  }

  if (loading) return <p className="text-sm text-muted-foreground">Carregando...</p>

  if (enrolling) {
    return (
      <div className="max-w-sm space-y-3">
        <p className="text-sm text-muted-foreground">
          Escaneie o QR no app autenticador (Google Authenticator, Authy...) e digite o código
          gerado.
        </p>
        <img
          src={enrolling.qr}
          alt="QR code do 2FA"
          className="h-44 w-44 rounded-md border bg-white p-2"
        />
        <p className="break-all text-xs text-muted-foreground">
          Ou use a chave: <span className="font-mono">{enrolling.secret}</span>
        </p>
        <form onSubmit={confirmEnroll} className="space-y-2">
          <Label htmlFor="mfa-code">Código</Label>
          <Input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="000000"
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? 'Confirmando...' : 'Confirmar'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={cancelEnroll} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    )
  }

  if (verified) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="success">
            <ShieldCheck /> Ativada
          </Badge>
          <span className="text-sm text-muted-foreground">
            O login passa a pedir um código do app autenticador.
          </span>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button size="sm" variant="destructive" onClick={remove} disabled={busy}>
          {busy ? 'Removendo...' : 'Remover 2FA'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Não ativada. Recomendada para proteger os dados sensíveis dos avaliados.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button size="sm" onClick={startEnroll} disabled={busy}>
        {busy ? 'Gerando...' : 'Ativar 2FA'}
      </Button>
    </div>
  )
}
