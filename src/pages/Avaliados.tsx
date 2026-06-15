import { Link } from 'react-router-dom'
import { useOrganization } from '../features/organization/context'
import { useSubjects } from '../features/subjects/hooks'
import { subjectTermLabels } from '../lib/subjectTerm'
import { ageFromBirthDate } from '../lib/age'
import { Button } from '@/components/ui/button'

export default function Avaliados() {
  const { organization } = useOrganization()
  const labels = subjectTermLabels(organization?.subject_term)
  const { data, isPending, isError, refetch } = useSubjects(organization?.id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{labels.pluralCap}</h1>
        <Button asChild>
          <Link to="/avaliados/novo">Novo {labels.singular}</Link>
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : isError ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">Não foi possível carregar a lista.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : data && data.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {data.map((s) => {
            const age = ageFromBirthDate(s.birth_date)
            return (
              <li key={s.id}>
                <Link
                  to={`/avaliados/${s.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{s.full_name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {age !== null ? `${age} anos` : 'idade -'} ·{' '}
                      {s.sex === 'F' ? 'Feminino' : 'Masculino'}
                    </span>
                  </span>
                  {!s.is_active ? (
                    <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Inativo
                    </span>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="rounded-md border border-dashed px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum {labels.singular} cadastrado ainda.
          </p>
          <Button asChild className="mt-3">
            <Link to="/avaliados/novo">Cadastrar {labels.singular}</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
