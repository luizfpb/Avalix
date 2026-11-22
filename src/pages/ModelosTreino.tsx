import { useMemo, useState } from 'react'
import { Bookmark, Search, Trash2 } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import {
  useDeleteWorkoutTemplate,
  useWorkoutTemplates,
} from '../features/workout/hooks'
import type { WorkoutTemplateRow } from '../features/workout/templatesApi'
import { goalLabel } from '../features/workout/volume'
import { ReadOnlyNotice } from '../components/ReadOnlyGate'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { QueryError } from '../components/QueryError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { normalizeDbError } from '../lib/errors'

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export default function ModelosTreino() {
  const { organization } = useOrganization()
  const templatesQ = useWorkoutTemplates(organization?.id)
  const deleteMut = useDeleteWorkoutTemplate(organization?.id)
  const [busca, setBusca] = useState('')
  const [pendingDelete, setPendingDelete] = useState<WorkoutTemplateRow | null>(null)

  const filtered = useMemo(() => {
    const q = stripAccents(busca.trim())
    const list = templatesQ.data ?? []
    if (!q) return list
    return list.filter((t) => stripAccents(`${t.name} ${goalLabel(t.goal)}`).includes(q))
  }, [templatesQ.data, busca])

  async function handleDelete() {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    try {
      await deleteMut.mutateAsync(target.id)
    } catch {
      // erro exibido abaixo
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold sm:text-3xl">Modelos de treino</h1>
        <p className="text-sm text-muted-foreground">
          Salve qualquer plano como modelo na tela do treino para reaproveitar em novos alunos.
        </p>
      </header>

      <ReadOnlyNotice>
        Você pode consultar ou excluir modelos, mas não criar novos até regularizar a assinatura.
      </ReadOnlyNotice>

      {deleteMut.error ? (
        <p role="alert" className="text-sm text-destructive">
          {normalizeDbError(deleteMut.error)}
        </p>
      ) : null}

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar modelo por nome ou objetivo..."
          className="pl-9"
          aria-label="Buscar modelo de treino"
        />
      </div>

      {templatesQ.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando modelos...</p>
      ) : templatesQ.isError ? (
        <QueryError
          message="Não foi possível carregar os modelos de treino."
          onRetry={() => void templatesQ.refetch()}
        />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Bookmark className="mx-auto size-8 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium">
              {(templatesQ.data?.length ?? 0) === 0
                ? 'Nenhum modelo salvo ainda'
                : 'Nenhum modelo encontrado para esta busca'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {(templatesQ.data?.length ?? 0) === 0
                ? 'Abra qualquer plano de treino de um aluno e clique em "Salvar como modelo".'
                : 'Tente outro termo de busca.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((template) => {
            const days = template.payload?.days ?? []
            const totalExercises = days.reduce((sum, d) => sum + (d.exercises?.length ?? 0), 0)
            return (
              <Card key={template.id}>
                <CardContent className="flex items-start justify-between gap-3 pt-5">
                  <div className="min-w-0 space-y-1.5">
                    <h2 className="truncate text-base font-semibold">{template.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {goalLabel(template.goal)} · {template.weeks}{' '}
                      {template.weeks === 1 ? 'semana' : 'semanas'} · {days.length}{' '}
                      {days.length === 1 ? 'divisão' : 'divisões'} · {totalExercises}{' '}
                      {totalExercises === 1 ? 'exercício' : 'exercícios'}
                    </p>
                    {days.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {days.map((d, idx) => (
                          <Badge key={`${d.label}-${idx}`} variant="secondary">
                            {d.label}
                            {d.name ? ` · ${d.name}` : ''}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-destructive"
                    disabled={deleteMut.isPending}
                    aria-label={`Excluir modelo ${template.name}`}
                    onClick={() => setPendingDelete(template)}
                  >
                    <Trash2 />
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title="Excluir modelo de treino?"
        description={`O modelo "${pendingDelete?.name ?? ''}" será removido da biblioteca. Os planos já criados para alunos não serão alterados.`}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
