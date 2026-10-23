import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router'
import { removeOrgLogo, signedLogoUrl, uploadOrgLogo } from '../features/organization/logo'
import type { Factor } from '@supabase/supabase-js'
import { Calculator, ChevronRight, CreditCard, Dumbbell, Monitor, Moon, ScrollText, ShieldCheck, Sun, type LucideIcon } from 'lucide-react'
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
import { roleLabel } from '../lib/roles'
import { SUBJECT_TERMS, subjectTermLabels } from '../lib/subjectTerm'
import { controlClass } from '@/lib/ui'
import { onRadioKeyDown, radioTabIndex } from '../lib/radioGroup'

type AreaLink = { to: string; title: string; hint: string; icon: LucideIcon }

export default function Configuracoes() {
  const { user } = useAuth()
  const { role } = useOrganization()
  const areas: AreaLink[] = [
    { to: '/configuracoes/plano', title: 'Plano e cobrança', hint: 'Assinatura, faturas e troca de plano', icon: CreditCard },
    { to: '/exercicios', title: 'Biblioteca de exercícios', hint: 'Catálogo global e os exercícios criados pela sua organização', icon: Dumbbell },
    ...(role === 'owner' || role === 'admin'
      ? [{ to: '/auditoria', title: 'Trilha de auditoria e erros', hint: 'Quem fez o quê e quando (LGPD) e os erros do aplicativo', icon: ScrollText }]
      : []),
    { to: '/ferramentas/1rm', title: 'Calculadora de carga (1RM)', hint: 'Estima o 1RM por carga×reps e gera a tabela de %1RM', icon: Calculator },
  ]
  return (
    <div className="space-y-5 lg:space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>

      {/* Duas pilhas no computador; no celular uma embaixo da outra, na mesma
          ordem de antes. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 xl:items-start xl:gap-6">
        <div className="min-w-0 space-y-5 lg:space-y-6">
          <AppearanceCard />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conta</CardTitle>
            </CardHeader>
            <CardContent>
              <Info label="E-mail" value={user?.email ?? '-'} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verificação em dois fatores (2FA)</CardTitle>
            </CardHeader>
            <CardContent>
              <MfaSettings />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Organização</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Info label="Seu papel" value={roleLabel(role)} />
            <IdentitySettings />
            <LogoSettings />
            <ContactSettings />
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Outras áreas</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {areas.map((area) => (
            <li key={area.to}>
              <Link
                to={area.to}
                className="group flex h-full items-start gap-3 rounded-lg border bg-card p-4 text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-foreground">
                  <area.icon className="size-5" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{area.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{area.hint}</span>
                </span>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
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

// Nome da organização e como ela chama quem é avaliado. Os dois eram
// escolhidos só no primeiro acesso, sem como corrigir depois; o nome sai nos
// PDFs e na página do aluno.
function IdentitySettings() {
  const { organization, role, refresh } = useOrganization()
  const canManage = role === 'owner' || role === 'admin'
  const [name, setName] = useState(organization?.name ?? '')
  const [term, setTerm] = useState(organization?.subject_term ?? 'avaliado')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty = name.trim() !== (organization?.name ?? '') || term !== (organization?.subject_term ?? 'avaliado')

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!organization) return
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Informe o nome da organização.')
      return
    }
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const { data, error: err } = await supabase
        .from('organizations')
        .update({ name: trimmed, subject_term: term })
        .eq('id', organization.id)
        .select('id')
      if (err) throw err
      // a policy recusa em silêncio (0 linhas) quem não pode editar
      if (!data?.length) throw new Error('Não foi possível salvar. Confira se a verificação em dois fatores está em dia.')
      await refresh()
      setSaved(true)
    } catch (e) {
      setError(normalizeDbError(e))
    } finally {
      setBusy(false)
    }
  }

  if (!canManage) return <Info label="Nome" value={organization?.name ?? '-'} />

  return (
    <form className="space-y-2" onSubmit={(e) => void save(e)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="org-name">Nome da organização</Label>
          <Input
            id="org-name"
            value={name}
            maxLength={120}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="org-term">Termo usado no app</Label>
          <select
            id="org-term"
            className={controlClass}
            value={term}
            disabled={busy}
            onChange={(e) => setTerm(e.target.value)}
          >
            {SUBJECT_TERMS.map((t) => (
              <option key={t} value={t}>{subjectTermLabels(t).singularCap}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        O nome aparece nos PDFs e na página do aluno. O termo (aluno, cliente...) aparece nas telas e nos PDFs.
      </p>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {saved && !dirty ? <p role="status" className="text-xs text-muted-foreground">Organização salva.</p> : null}
      <Button type="submit" size="sm" variant="outline" disabled={busy || !dirty}>
        {busy ? 'Salvando...' : 'Salvar organização'}
      </Button>
    </form>
  )
}

function contactError(email: string, phone: string): string | null {
  if (email && (email.length < 5 || email.length > 254 || email.indexOf('@') < 1)) {
    return 'Informe um e-mail válido, como contato@seuestudio.com.br.'
  }
  if (phone && (phone.length < 8 || phone.length > 30)) {
    return 'O telefone precisa ter entre 8 e 30 caracteres, com DDD.'
  }
  return null
}

// Canal de contato do Controlador (LGPD art. 9º, IV e art. 18): a quem o
// titular dirige pedido de acesso, correção, portabilidade, revogação ou
// eliminação. O termo já diz "dirija ao Controlador" e o código se recusa a
// inventar um contato quando não há — mas não existia onde informá-lo.
// Fica visível para o aluno na tela pública da anamnese.
function ContactSettings() {
  const { organization, role, refresh } = useOrganization()
  const canManage = role === 'owner' || role === 'admin'
  const [email, setEmail] = useState(organization?.contact_email ?? '')
  const [phone, setPhone] = useState(organization?.contact_phone ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty =
    email.trim() !== (organization?.contact_email ?? '') ||
    phone.trim() !== (organization?.contact_phone ?? '')

  async function save() {
    if (!organization) return
    setError(null)
    setSaved(false)
    // os mesmos limites do CHECK do banco (0024); passar deles devolvia a
    // mensagem crua do Postgres, em inglês
    const invalid = contactError(email.trim(), phone.trim())
    if (invalid) return setError(invalid)
    setBusy(true)
    try {
      const { data, error: err } = await supabase
        .from('organizations')
        .update({
          contact_email: email.trim() || null,
          contact_phone: phone.trim() || null,
        })
        .eq('id', organization.id)
        .select('id')
      if (err) throw err
      // a policy recusa em silêncio (0 linhas) quem não pode editar
      if (!data?.length) throw new Error('Não foi possível salvar. Confira se a verificação em dois fatores está em dia.')
      await refresh()
      setSaved(true)
    } catch (e) {
      setError(normalizeDbError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <span className="block text-xs text-muted-foreground">
        Contato para o titular exercer seus direitos (aparece para o aluno no link da anamnese)
      </span>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="org-contact-email">E-mail</Label>
          <Input
            id="org-contact-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="contato@seuestudio.com.br"
            maxLength={254}
            value={email}
            disabled={!canManage || busy}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="org-contact-phone">Telefone / WhatsApp</Label>
          <Input
            id="org-contact-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+55 11 90000-0000"
            maxLength={30}
            value={phone}
            disabled={!canManage || busy}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {saved && !dirty ? (
        <p role="status" className="text-xs text-muted-foreground">Contato salvo.</p>
      ) : null}
      {canManage ? (
        <Button type="button" size="sm" variant="outline" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? 'Salvando...' : 'Salvar contato'}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Só o dono ou um administrador edita o contato.</p>
      )}
    </div>
  )
}

function LogoSettings() {
  const { organization, role, refresh } = useOrganization()
  const canManage = role === 'owner' || role === 'admin'
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Trocar um PNG por outro PNG mantém o mesmo path ({org}/logo.png): sem esta
  // contagem a prévia continuaria mostrando o logo antigo.
  const [version, setVersion] = useState(0)
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
  }, [logoPath, version])

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !organization) return
    setBusy('upload')
    setError(null)
    try {
      await uploadOrgLogo(organization.id, file)
      await refresh()
      setVersion((v) => v + 1)
    } catch (err) {
      setError(normalizeDbError(err))
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    setConfirmRemove(false)
    if (!organization) return
    setBusy('remove')
    setError(null)
    try {
      await removeOrgLogo(organization.id)
      await refresh()
    } catch (err) {
      setError(normalizeDbError(err))
    } finally {
      setBusy(null)
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
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="peer sr-only"
                onChange={onFile}
                disabled={busy !== null}
              />
              {/* o input escondido recebe o foco; o anel aparece aqui (peer) */}
              <span className="inline-flex items-center rounded-md border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/35">
                {busy === 'upload' ? 'Enviando...' : logoPath ? 'Trocar logo' : 'Enviar logo'}
              </span>
            </label>
            {logoPath ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={busy !== null}
                onClick={() => setConfirmRemove(true)}
              >
                {busy === 'remove' ? 'Removendo...' : 'Remover'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmRemove}
        title="Remover o logo?"
        description="Os próximos PDFs saem sem logo. Os relatórios já baixados não mudam."
        confirmLabel="Remover"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        Ideal: PNG com fundo transparente, de preferência horizontal, com cerca de 800 × 250 px.
        Aceita PNG, JPEG ou WebP até 10 MB; imagens grandes são reduzidas antes do envio.
      </p>
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
        <CardTitle className="text-base">Aparência</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="inline-flex rounded-md bg-muted p-1" role="radiogroup" aria-label="Tema da interface">
          {THEME_OPTS.map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={theme === o.v}
              tabIndex={radioTabIndex(theme === o.v)}
              onClick={() => setTheme(o.v)}
              onKeyDown={(e) => onRadioKeyDown(e, THEME_OPTS.map((t) => t.v), theme, setTheme)}
              className={[
                'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors',
                theme === o.v
                  ? 'bg-card text-foreground shadow-sm'
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
        Não ativada. Recomendada para proteger os dados de saúde guardados na sua conta.
      </p>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button size="sm" onClick={startEnroll} disabled={busy}>
        {busy ? 'Gerando...' : 'Ativar 2FA'}
      </Button>
    </div>
  )
}
