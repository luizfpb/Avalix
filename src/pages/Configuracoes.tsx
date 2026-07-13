import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router'
import { signedLogoUrl, uploadOrgLogo } from '../features/organization/logo'
import type { Factor } from '@supabase/supabase-js'
import { User, ShieldCheck, Building2, Palette, Sun, Moon, Monitor, Dumbbell, Calculator, ChevronRight, ScrollText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { normalizeAuthError, normalizeDbError } from '../lib/errors'
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'
import { useTheme, type Theme } from '../features/theme/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '../components/ConfirmDialog'

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
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Info label="Nome" value={organization?.name ?? '-'} />
            <Info label="Seu papel" value={role ?? '-'} />
          </div>
          <LogoSettings />
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

      {role === 'owner' || role === 'admin' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="size-4 text-muted-foreground" /> Auditoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              to="/auditoria"
              className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent"
            >
              <span>
                Trilha de auditoria e erros
                <span className="block text-xs text-muted-foreground">
                  Quem fez o quê e quando (LGPD) + erros do aplicativo
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>
      ) : null}

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

function LogoSettings() {
  const { organization, role, refresh } = useOrganization()
  const canManage = role === 'owner' || role === 'admin'
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logoPath = organization?.logo_path

  useEffect(() => {
    let active = true
    setPreview(null)
    if (logoPath) {
      void signedLogoUrl(logoPath).then((url) => {
        if (active) setPreview(url)
      })
    }
    return () => {
      active = false
    }
  }, [logoPath])

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !organization) return
    setBusy(true)
    setError(null)
    try {
      await uploadOrgLogo(organization.id, file)
      await refresh()
    } catch (err) {
      setError(normalizeDbError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <span className="block text-xs text-muted-foreground">Logo (aparece no PDF dos relatórios)</span>
      <div className="flex items-center gap-3">
        <div className="grid h-14 w-28 place-items-center overflow-hidden rounded-md border bg-card">
          {preview ? (
            <img src={preview} alt="Logo da organização" className="max-h-12 max-w-24 object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">sem logo</span>
          )}
        </div>
        {canManage ? (
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={onFile}
              disabled={busy}
            />
            <span className="inline-flex items-center rounded-md border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent">
              {busy ? 'Enviando...' : logoPath ? 'Trocar logo' : 'Enviar logo'}
            </span>
          </label>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      <p className="text-[11px] text-muted-foreground">PNG, JPEG ou WebP, até 1 MB.</p>
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
        <div className="inline-flex rounded-md border bg-card p-1" role="radiogroup" aria-label="Tema da interface">
          {THEME_OPTS.map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={theme === o.v}
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

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: listError } = await supabase.auth.mfa.listFactors()
    if (listError) {
      setFactors([])
      setError(normalizeAuthError(listError))
    } else {
      setFactors(data?.totp ?? [])
    }
    setLoading(false)
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])

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

  const [confirmRemove, setConfirmRemove] = useState(false)

  async function remove() {
    if (!verified) return
    setConfirmRemove(false)
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

  if (loading) return <p role="status" className="text-sm text-muted-foreground">Carregando...</p>

  if (error && factors.length === 0 && !enrolling) {
    return (
      <div className="space-y-3" role="alert">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>
          Tentar novamente
        </Button>
      </div>
    )
  }

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
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
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
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setConfirmRemove(true)}
          disabled={busy}
        >
          {busy ? 'Removendo...' : 'Remover 2FA'}
        </Button>
        <ConfirmDialog
          open={confirmRemove}
          title="Remover a verificação em dois fatores?"
          description="Sua conta volta a ser protegida apenas pela senha."
          confirmLabel="Remover"
          onConfirm={remove}
          onCancel={() => setConfirmRemove(false)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Não ativada. Recomendada para proteger os dados sensíveis dos avaliados.
      </p>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button size="sm" onClick={startEnroll} disabled={busy}>
        {busy ? 'Gerando...' : 'Ativar 2FA'}
      </Button>
    </div>
  )
}
