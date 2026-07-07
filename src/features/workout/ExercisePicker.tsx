import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Plus, X, ChevronDown, ChevronRight } from 'lucide-react'
import type { ExerciseRow } from './api'
import { MUSCLE_OPTIONS } from './schema'
import { equipmentLabel, muscleLabel, type MuscleGroup } from './volume'
import { ExerciseForm } from './ExerciseForm'
import { ExerciseDemoLink } from './ExerciseDemoLink'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { controlClass } from '@/lib/ui'

// Busca/filtro do catálogo + criação rápida de exercício custom (extraído de
// TreinoNovo na v2.0; única mudança: o botão de fechar usa o ícone X, não a
// lixeira, e ganhou aria-label).
export function ExercisePicker({
  exercises,
  orgId,
  onPick,
}: {
  exercises: ExerciseRow[]
  orgId: string
  onPick: (exerciseId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState('')
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return exercises
      .filter((e) => {
        if (muscle && e.primary_muscle !== muscle && !e.secondary_muscles.includes(muscle)) return false
        if (q && !e.name.toLowerCase().includes(q)) return false
        return true
      })
      .slice(0, 60)
  }, [exercises, search, muscle])

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus /> Adicionar exercício
      </Button>
    )
  }

  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          placeholder="Buscar exercício..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={`${controlClass} w-40`} value={muscle} onChange={(e) => setMuscle(e.target.value)}>
          <option value="">Todos os grupos</option>
          {MUSCLE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground"
          title="Fechar"
          aria-label="Fechar busca de exercícios"
        >
          <X className="size-4" />
        </button>
      </div>

      <ul className="max-h-56 divide-y overflow-y-auto rounded-md border bg-card">
        {filtered.map((e) => (
          <li key={e.id} className="flex items-center hover:bg-accent">
            <button
              type="button"
              onClick={() => {
                onPick(e.id)
                setOpen(false)
              }}
              className="flex flex-1 items-center justify-between gap-2 px-3 py-2 text-left text-sm"
            >
              <span>
                {e.name}
                {e.org_id ? <span className="ml-1 text-xs text-primary">(custom)</span> : null}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {muscleLabel(e.primary_muscle as MuscleGroup)} · {equipmentLabel(e.equipment as never)}
              </span>
            </button>
            <ExerciseDemoLink name={e.name} label="" className="shrink-0 px-2 text-muted-foreground hover:text-foreground" />
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">Nenhum exercício encontrado.</li>
        ) : null}
      </ul>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {creating ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Criar exercício (está faltando no catálogo)
        </button>
        <Link to="/exercicios" className="text-xs text-muted-foreground hover:underline">
          Gerenciar biblioteca
        </Link>
      </div>
      {creating ? (
        <ExerciseForm
          orgId={orgId}
          onSaved={(row) => {
            onPick(row.id)
            setCreating(false)
            setOpen(false)
          }}
          onCancel={() => setCreating(false)}
        />
      ) : null}
    </div>
  )
}
