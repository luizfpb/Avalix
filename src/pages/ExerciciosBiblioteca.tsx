import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import { useExercises, useDeleteCustomExercise } from '../features/workout/hooks'
import { ExerciseForm } from '../features/workout/ExerciseForm'
import { ExerciseDemoLink } from '../features/workout/ExerciseDemoLink'
import { equipmentLabel, muscleLabel, type Equipment, type MuscleGroup } from '../features/workout/volume'
import { MUSCLE_OPTIONS } from '../features/workout/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

import { controlClass } from '@/lib/ui'
import { normalizeDbError } from '../lib/errors'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { QueryError } from '../components/QueryError'

export default function ExerciciosBiblioteca() {
  const { organization, role } = useOrganization()
  const orgId = organization?.id
  const exercisesQuery = useExercises(orgId)
  const { data, isPending } = exercisesQuery
  const deleteMut = useDeleteCustomExercise(orgId)
  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const canDelete = role === 'owner' || role === 'admin'

  const exercises = useMemo(() => data ?? [], [data])
  const customCount = exercises.filter((e) => e.org_id).length

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return exercises.filter((e) => {
      if (muscle && e.primary_muscle !== muscle && !e.secondary_muscles.includes(muscle)) return false
      if (q && !e.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [exercises, search, muscle])

  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setConfirmId(null)
    setDeleteError(null)
    try {
      await deleteMut.mutateAsync(id)
    } catch (e) {
      setDeleteError(
        'Não foi possível excluir. O exercício pode estar em uso em algum plano de treino. ' +
          normalizeDbError(e)
      )
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to="/configuracoes" className="text-sm text-muted-foreground hover:text-foreground">
            ← Configurações
          </Link>
          <h1 className="mt-2 text-xl font-semibold">Biblioteca de exercícios</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo global + {customCount} {customCount === 1 ? 'exercício seu' : 'exercícios seus'}.
            Os globais são fixos; os seus você edita e exclui.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating((s) => !s)}>
          <Plus /> Novo
        </Button>
      </div>

      {creating && orgId ? (
        <ExerciseForm
          orgId={orgId}
          onSaved={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_11rem]">
        <div>
          <label htmlFor="exercise-search" className="sr-only">Buscar exercício</label>
          <Input id="exercise-search" placeholder="Buscar exercício..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label htmlFor="exercise-muscle" className="sr-only">Filtrar por grupo muscular</label>
          <select id="exercise-muscle" className={controlClass} value={muscle} onChange={(e) => setMuscle(e.target.value)}>
          <option value="">Todos os grupos</option>
          {MUSCLE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
          </select>
        </div>
      </div>

      {exercisesQuery.isError ? (
        <QueryError
          message="Não foi possível carregar a biblioteca de exercícios."
          onRetry={() => void exercisesQuery.refetch()}
        />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum exercício encontrado.</p>
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {filtered.map((e) => {
            const custom = !!e.org_id
            if (editingId === e.id && orgId) {
              return (
                <li key={e.id} className="p-3">
                  <ExerciseForm
                    orgId={orgId}
                    exercise={e}
                    onSaved={() => setEditingId(null)}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              )
            }
            return (
              <li key={e.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm">
                    {e.name}
                    {custom ? (
                      <Badge variant="secondary" className="shrink-0">
                        seu
                      </Badge>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {muscleLabel(e.primary_muscle as MuscleGroup)} · {equipmentLabel(e.equipment as Equipment)}
                    {e.secondary_muscles.length > 0
                      ? ` · +${e.secondary_muscles.length} secundário${e.secondary_muscles.length > 1 ? 's' : ''}`
                      : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1 text-xs sm:justify-end">
                  <ExerciseDemoLink name={e.name} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" />
                  {custom ? (
                    <>
                      <button
                        onClick={() => setEditingId(e.id)}
                        className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-primary hover:bg-primary/5 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Pencil className="size-3.5" /> Editar
                      </button>
                      {canDelete ? (
                        <button
                          onClick={() => setConfirmId(e.id)}
                          disabled={deleteMut.isPending}
                          className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-destructive hover:bg-destructive/5 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Trash2 className="size-3.5" /> Excluir
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-muted-foreground">global</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {deleteError ? <p role="alert" className="text-sm text-destructive">{deleteError}</p> : null}

      <ConfirmDialog
        open={confirmId != null}
        title="Excluir exercício custom?"
        description="Esta ação é definitiva. O banco recusa a exclusão se o exercício estiver em uso em algum plano."
        onConfirm={() => {
          if (confirmId) void handleDelete(confirmId)
        }}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  )
}
