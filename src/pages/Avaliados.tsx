import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Plus, Search, Users, ChevronRight } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import { useSubjects } from '../features/subjects/hooks'
import { subjectTermLabels } from '../lib/subjectTerm'
import { ageFromBirthDate } from '../lib/age'
import { initials } from '../lib/initials'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

export default function Avaliados() {
  const { organization } = useOrganization()
  const labels = subjectTermLabels(organization?.subject_term)
  const { data, isPending, isError, refetch } = useSubjects(organization?.id)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return data ?? []
    return (data ?? []).filter((s) => s.full_name.toLowerCase().includes(term))
  }, [data, q])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{labels.pluralCap}</h1>
          {data && data.length > 0 ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {data.length} {data.length === 1 ? 'cadastrado' : 'cadastrados'}
            </p>
          ) : null}
        </div>
        <Button asChild>
          <Link to="/avaliados/novo">
            <Plus /> Novo {labels.singular}
          </Link>
        </Button>
      </div>

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
            Nenhum {labels.singular} cadastrado ainda.
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
