import { useId, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { searchExercises } from './exerciseSearch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const LIMIT = 30

export type StudentExtraOption = {
  /** chave da grade: id da linha do plano ou `cat:<id do catálogo>` */
  key: string
  name: string
  aliases?: string[] | null
  /** "treino B", "Peito"... — o que ajuda a reconhecer o exercício */
  detail: string | null
  /** está em outra divisão do plano: aparece antes de qualquer busca */
  fromPlan: boolean
}

// Exercício fora da prescrição, do lado do aluno. Sem busca, mostra só o que
// está nas outras divisões do plano (a troca mais comum); digitando, procura no
// catálogo inteiro da academia por nome e apelido. Não cria exercício: isso é
// do profissional, e o aluno sem conta não tem como.
export function StudentExtraPicker({
  options,
  disabled,
  onPick,
}: {
  options: StudentExtraOption[]
  disabled?: boolean
  onPick: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputId = useId()
  const hintId = useId()

  const typed = search.trim() !== ''
  const hits = useMemo(() => {
    if (!typed) return options.filter((o) => o.fromPlan).map((exercise) => ({ exercise, alias: null }))
    return searchExercises(options, search)
  }, [options, search, typed])
  const shown = hits.slice(0, LIMIT)

  function close() {
    setOpen(false)
    setSearch('')
  }

  if (!open) {
    return (
      <div className="space-y-1.5 rounded-md border border-dashed p-2.5">
        <p className="text-xs text-muted-foreground">
          Fez algum exercício a mais, ou trocou algum? Adicione para registrar as séries.
        </p>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
          <Plus /> Adicionar exercício
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed p-2.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-xs font-medium">
          Adicionar exercício
        </label>
        <button
          type="button"
          onClick={close}
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Fechar a busca de exercício"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <Input
        id={inputId}
        type="search"
        autoFocus
        autoComplete="off"
        placeholder="Buscar pelo nome"
        aria-describedby={hintId}
        value={search}
        disabled={disabled}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
        }}
      />
      <p id={hintId} className="text-xs text-muted-foreground">
        {typed
          ? hits.length === 0
            ? 'Nenhum exercício com esse nome.'
            : hits.length > LIMIT
              ? `Mostrando ${LIMIT} de ${hits.length}. Digite mais para filtrar.`
              : null
          : shown.length > 0
            ? 'Do seu treino, em outras divisões. Digite para buscar todos os exercícios.'
            : 'Digite para buscar todos os exercícios.'}
      </p>
      {shown.length > 0 ? (
        <ul className="max-h-72 space-y-1 overflow-y-auto" aria-label="Exercícios encontrados">
          {shown.map(({ exercise, alias }) => (
            <li key={exercise.key}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onPick(exercise.key)
                  close()
                }}
                className="flex min-h-11 w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <span className="text-sm">{exercise.name}</span>
                {alias || exercise.detail ? (
                  <span className="text-xs text-muted-foreground">
                    {[alias ? `também chamado ${alias}` : null, exercise.detail].filter(Boolean).join(' · ')}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
