import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { normalizeDbError } from '../../lib/errors'
import { canonicalYoutubeUrl } from './demo'
import { useSetExerciseVideo } from './hooks'

// Vídeo que a organização escolhe para um exercício (0042). Vale para todos os
// planos: detalhe do plano, PDF e página do aluno passam a abrir este vídeo em
// vez do curado do catálogo ou da busca pelo nome.
export function ExerciseVideoEditor({
  orgId,
  exerciseId,
  exerciseName,
  current,
  onDone,
}: {
  orgId: string
  exerciseId: string
  exerciseName: string
  current: string | null
  onDone: () => void
}) {
  const mut = useSetExerciseVideo(orgId)
  const [value, setValue] = useState(current ?? '')
  const [error, setError] = useState<string | null>(null)
  const inputId = `video-${exerciseId}`

  async function salvar(videoUrl: string | null) {
    setError(null)
    try {
      await mut.mutateAsync({ exerciseId, videoUrl })
      onDone()
    } catch (e) {
      setError(normalizeDbError(e))
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const canonico = canonicalYoutubeUrl(value)
    if (!canonico) {
      setError('Cole o link de um vídeo do YouTube (youtube.com/watch, youtu.be ou shorts).')
      return
    }
    void salvar(canonico)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-md border bg-muted/30 p-3">
      <label htmlFor={inputId} className="block text-xs font-medium">
        Vídeo de “{exerciseName}”
      </label>
      <Input
        id={inputId}
        inputMode="url"
        autoComplete="off"
        autoFocus
        placeholder="https://www.youtube.com/watch?v=..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${inputId}-hint`}
      />
      <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
        Só YouTube. Vale para todos os planos da sua equipe: detalhe do plano, PDF e página do aluno.
      </p>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={mut.isPending}>
          {mut.isPending ? 'Salvando...' : 'Salvar vídeo'}
        </Button>
        {current ? (
          <Button type="button" size="sm" variant="outline" disabled={mut.isPending} onClick={() => void salvar(null)}>
            Tirar meu vídeo
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" disabled={mut.isPending} onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
