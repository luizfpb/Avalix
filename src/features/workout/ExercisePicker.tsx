import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Plus, X, ChevronDown, ChevronRight, Check } from 'lucide-react'
import type { ExerciseRow } from './api'
import { MUSCLE_OPTIONS } from './schema'
import { equipmentLabel } from './volume'
import { primaryMusclesLabel, worksMuscle } from './exerciseMuscles'
import { ExerciseForm } from './ExerciseForm'
import { ExerciseDemoLink } from './ExerciseDemoLink'
import { resolveExerciseVideo } from './demo'
import { searchExercises } from './exerciseSearch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { controlClass } from '@/lib/ui'

const LIMIT = 60

// Busca/filtro do catálogo + criação rápida de exercício custom (extraído de
// TreinoNovo na v2.0).
//
// `stayOpen`: no editor de treino a busca continua aberta depois de escolher,
// com o texto limpo e o nome do que entrou, porque uma divisão tem seis, oito
// exercícios e reabrir a busca a cada um cansava. Na Execução, onde se acrescenta
// um avulso de vez em quando, ela fecha como antes.
//
// O que já está na lista (divisão ou sessão) aparece apagado com o motivo, em
// vez de sumir: sumir fazia parecer que o exercício não existia no catálogo.
export function ExercisePicker({
  exercises,
  orgId,
  excludedExerciseIds,
  excludedLabel = 'já adicionado',
  stayOpen = false,
  onPick,
}: {
  exercises: ExerciseRow[]
  orgId: string
  excludedExerciseIds?: ReadonlySet<string>
  excludedLabel?: string
  stayOpen?: boolean
  onPick: (exerciseId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState('')
  const [creating, setCreating] = useState(false)
  const [lastAdded, setLastAdded] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const hits = useMemo(
    () => searchExercises(muscle ? exercises.filter((e) => worksMuscle(e, muscle)) : exercises, search),
    [exercises, search, muscle]
  )
  const shown = hits.slice(0, LIMIT)

  function close() {
    setOpen(false)
    setSearch('')
    setLastAdded(null)
    setCreating(false)
  }

  function picked(exercise: { id: string; name: string }) {
    onPick(exercise.id)
    if (!stayOpen) return close()
    setLastAdded(exercise.name)
    setSearch('')
    setCreating(false)
    inputRef.current?.focus()
  }

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
          ref={inputRef}
          autoFocus
          placeholder="Buscar exercício (nome ou apelido)..."
          aria-label="Buscar exercício"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={`${controlClass} w-40`}
          aria-label="Filtrar por grupo muscular"
          value={muscle}
          onChange={(e) => setMuscle(e.target.value)}
        >
          <option value="">Todos os grupos</option>
          {MUSCLE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={close}
          className="text-muted-foreground"
          title="Fechar"
          aria-label="Fechar busca de exercícios"
        >
          <X className="size-4" />
        </button>
      </div>

      <p aria-live="polite" className="min-h-0 text-xs text-primary empty:hidden">
        {lastAdded ? (
          <span className="flex items-center gap-1">
            <Check className="size-3.5" aria-hidden /> {lastAdded} adicionado. Busque o próximo ou feche.
          </span>
        ) : null}
      </p>

      <ul className="max-h-64 divide-y overflow-y-auto rounded-md border bg-card">
        {shown.map(({ exercise: e, alias }) => {
          const already = excludedExerciseIds?.has(e.id) ?? false
          return (
            <li key={e.id} className={`flex items-center ${already ? '' : 'hover:bg-accent'}`}>
              <button
                type="button"
                disabled={already}
                onClick={() => picked(e)}
                className="flex flex-1 items-center justify-between gap-2 px-3 py-2 text-left text-sm disabled:cursor-default disabled:opacity-50"
              >
                <span>
                  {e.name}
                  {e.org_id ? <span className="ml-1 text-xs text-primary">(custom)</span> : null}
                  {alias ? (
                    <span className="block text-xs text-muted-foreground">também chamado: {alias}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right text-xs text-muted-foreground">
                  {already ? excludedLabel : `${primaryMusclesLabel(e)} · ${equipmentLabel(e.equipment as never)}`}
                </span>
              </button>
              <ExerciseDemoLink name={e.name} video={resolveExerciseVideo(e)} label="" className="shrink-0 px-2 text-muted-foreground hover:text-foreground" />
            </li>
          )
        })}
        {hits.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            Nenhum exercício encontrado. Tente outro nome ou crie o exercício abaixo.
          </li>
        ) : null}
        {hits.length > LIMIT ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">
            Mostrando {LIMIT} de {hits.length}. Digite mais do nome ou filtre o grupo para achar o resto.
          </li>
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
          onSaved={(row) => picked(row)}
          onCancel={() => setCreating(false)}
        />
      ) : null}
    </div>
  )
}
