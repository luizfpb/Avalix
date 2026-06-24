import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import { useExercises, useDeleteCustomExercise } from '../features/workout/hooks'
import { ExerciseForm } from '../features/workout/ExerciseForm'
import { equipmentLabel, muscleLabel, type Equipment, type MuscleGroup } from '../features/workout/volume'
import { MUSCLE_OPTIONS } from '../features/workout/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const controlClass =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

export default function ExerciciosBiblioteca() {
  const { organization, role } = useOrganization()
  const orgId = organization?.id
  const { data, isPending } = useExercises(orgId)
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

  async function handleDelete(id: string) {
    if (!window.confirm('Excluir este exercício custom? Esta ação é definitiva.')) return
    try {
      await deleteMut.mutateAsync(id)
    } catch (e) {
      window.alert(
        'Não foi possível excluir. O exercício pode estar em uso em algum plano de treino.\n\n' +
          (e as Error).message
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

      <div className="flex items-center gap-2">
        <Input placeholder="Buscar exercício..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={`${controlClass} w-44`} value={muscle} onChange={(e) => setMuscle(e.target.value)}>
          <option value="">Todos os grupos</option>
          {MUSCLE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {isPending ? (
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
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
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
                {custom ? (
                  <div className="flex shrink-0 items-center gap-3 text-xs">
                    <button
                      onClick={() => setEditingId(e.id)}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Pencil className="size-3.5" /> Editar
                    </button>
                    {canDelete ? (
                      <button
                        onClick={() => handleDelete(e.id)}
                        disabled={deleteMut.isPending}
                        className="inline-flex items-center gap-1 text-destructive hover:underline"
                      >
                        <Trash2 className="size-3.5" /> Excluir
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">global</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
