import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Plus, Search, Users, ChevronRight, Copy, MessageCircle, Send } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import { useSubjects } from '../features/subjects/hooks'
import {
  useRegistrationIntakes,
  useGenerateRegistrationLink,
  useCancelRegistrationIntake,
} from '../features/anamnesis/intakeHooks'
import { IntakeLinkButtons } from '../features/anamnesis/IntakeLinkButtons'
import { subjectTermLabels } from '../lib/subjectTerm'
import { ageFromBirthDate } from '../lib/age'
import { initials } from '../lib/initials'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { controlClass } from '@/lib/ui'
import { normalizeDbError } from '../lib/errors'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR')
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Avaliados() {
  const { organization } = useOrganization()
  const labels = subjectTermLabels(organization?.subject_term)
  const { data, isPending, isError, refetch } = useSubjects(organization?.id)
  const [q, setQ] = useState('')

  // Convite de cadastro pelo link: o aluno preenche os proprios dados +
  // anamnese e tudo fica pendente ate o personal aceitar (vira avaliado so no
  // aceite). Mesma UX do link de anamnese do perfil.
  const intakesQuery = useRegistrationIntakes(organization?.id)
  const generate = useGenerateRegistrationLink(organization?.id)
  const cancel = useCancelRegistrationIntake(organization?.id)
  const intakes = intakesQuery.data ?? []
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  async function handleGenerate() {
    setGenError(null)
    setCopied(false)
    if (!organization) return
    try {
      const res = await generate.mutateAsync({ orgId: organization.id })
      setGeneratedUrl(res.url)
    } catch (e) {
      setGenError(normalizeDbError(e))
    }
  }

  async function copyLink() {
    if (!generatedUrl) return
    try {
      await navigator.clipboard.writeText(generatedUrl)
      setCopied(true)
    } catch {
      // clipboard bloqueado: o campo fica selecionável para copiar manualmente
    }
  }

  const waHref = generatedUrl
    ? `https://wa.me/?text=${encodeURIComponent(
        `Olá! Faça seu cadastro e preencha a anamnese para começarmos: ${generatedUrl}`
      )}`
    : '#'

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return data ?? []
    return (data ?? []).filter((s) => s.full_name.toLowerCase().includes(term))
  }, [data, q])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{labels.pluralCap}</h1>
          {data && data.length > 0 ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {data.length} {data.length === 1 ? 'cadastrado' : 'cadastrados'}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={handleGenerate}
            disabled={generate.isPending || !organization}
          >
            <Send /> {generate.isPending ? 'Gerando...' : 'Convidar por link'}
          </Button>
          <Button asChild>
            <Link to="/avaliados/novo">
              <Plus /> Novo {labels.singular}
            </Link>
          </Button>
        </div>
      </div>

      {genError ? <p className="text-sm text-destructive">{genError}</p> : null}

      {generatedUrl ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="space-y-2 py-3 text-sm">
            <p className="font-medium">
              Link gerado — o {labels.singular} se cadastra e já responde a anamnese
            </p>
            <input
              readOnly
              value={generatedUrl}
              onFocus={(e) => e.currentTarget.select()}
              className={controlClass}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={copyLink}>
                <Copy /> {copied ? 'Copiado!' : 'Copiar'}
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={waHref} target="_blank" rel="noreferrer">
                  <MessageCircle /> WhatsApp
                </a>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setGeneratedUrl(null)}>
                Fechar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Válido por 7 dias e de uso único (um link por pessoa). Nada entra no sistema sem a sua
              revisão. O link fica disponível na lista abaixo (neste aparelho) enquanto o convite
              estiver ativo.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {intakes.length > 0 ? (
        <ul className="divide-y rounded-md border bg-card">
          {intakes.map((it) =>
            it.status === 'submitted' ? (
              <li key={it.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Badge variant="warn">Aguardando revisão</Badge>
                  <span className="truncate text-muted-foreground">
                    {((it.registration as { full_name?: string } | null)?.full_name ?? '').trim() ||
                      'Sem nome'}
                  </span>
                </span>
                <Button asChild size="sm">
                  <Link to={`/avaliados/intake/${it.id}`}>Revisar</Link>
                </Button>
              </li>
            ) : (
              <li
                key={it.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5 text-sm"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge variant="secondary">Convite aguardando resposta</Badge>
                  <span className="text-xs text-muted-foreground">
                    gerado {formatDateTime(it.created_at)} · expira {formatDate(it.expires_at)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <IntakeLinkButtons
                    intakeId={it.id}
                    waMessage="Olá! Faça seu cadastro e preencha a anamnese para começarmos:"
                  />
                  <button
                    onClick={() => cancel.mutate(it.id)}
                    disabled={cancel.isPending}
                    className="text-xs text-destructive hover:underline disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </span>
              </li>
            )
          )}
        </ul>
      ) : null}

      {data && data.length > 0 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Buscar ${labels.singular}...`}
            className="pl-9"
          />
        </div>
      ) : null}

      {isPending ? (
        <ul className="divide-y rounded-xl border bg-card">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <span className="size-9 animate-pulse rounded-full bg-muted" />
              <span className="h-4 w-40 animate-pulse rounded bg-muted" />
            </li>
          ))}
        </ul>
      ) : isError ? (
        <div className="space-y-2 rounded-xl border border-dashed px-4 py-8 text-center">
          <p className="text-sm text-destructive">Não foi possível carregar a lista.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : filtered.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {filtered.map((s) => {
            const age = ageFromBirthDate(s.birth_date)
            return (
              <li key={s.id}>
                <Link
                  to={`/avaliados/${s.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {initials(s.full_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.full_name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {age !== null ? `${age} anos` : 'idade -'} ·{' '}
                      {s.sex === 'F' ? 'Feminino' : 'Masculino'}
                    </span>
                  </span>
                  {!s.is_active ? <Badge variant="secondary">Inativo</Badge> : null}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            )
          })}
        </ul>
      ) : data && data.length > 0 ? (
        <p className="px-1 py-8 text-center text-sm text-muted-foreground">
          Nenhum resultado para “{q}”.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Users className="size-6" />
          </span>
          <p className="text-sm text-muted-foreground">
            Nenhum {labels.singular} cadastrado ainda. Cadastre você mesmo ou use “Convidar por
            link” — o {labels.singular} preenche o próprio cadastro e a anamnese.
          </p>
          <Button asChild>
            <Link to="/avaliados/novo">
              <Plus /> Cadastrar {labels.singular}
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
