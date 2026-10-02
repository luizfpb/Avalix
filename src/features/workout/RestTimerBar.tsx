import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// O cronômetro de descanso de uma série. Guarda o INSTANTE do início, não um
// contador: a tela pode apagar e o app ir para segundo plano, e o tempo
// continua certo quando ele volta.
export type RestTimer = {
  rowId: string
  index: number
  name: string
  targetSeconds: number | null
  // instante do início (ms)
  startedAt: number
}

// A faixa do cronômetro, com o próprio tique de 1 s: só ela re-renderiza a
// cada segundo, e não o formulário com todas as séries.
//
// Fixa na tela, e não no fim do formulário: durante a sessão quem treina está
// no meio da lista de exercícios, e um cronômetro que só aparece rolando até o
// rodapé não serve para nada. Usada na Execução do profissional e na tela do
// aluno; a altura vem de quem usa (`className`), porque só a primeira tem a
// barra de navegação do celular embaixo.
export function RestTimerBar({
  timer,
  onRegister,
  onDiscard,
  className = 'bottom-[calc(1rem+env(safe-area-inset-bottom))]',
}: {
  timer: RestTimer
  onRegister: () => void
  onDiscard: () => void
  className?: string
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const seconds = Math.max(0, Math.floor((now - timer.startedAt) / 1000))
  const done = timer.targetSeconds != null && seconds >= timer.targetSeconds
  return (
    <div
      className={`fixed inset-x-3 z-30 mx-auto flex max-w-2xl items-center gap-2 rounded-xl border px-3 py-2 shadow-lg backdrop-blur sm:gap-3 ${className} ${
        done ? 'border-success bg-success/15' : 'border-border bg-background/95'
      }`}
    >
      <span
        className={`shrink-0 text-xl font-semibold tabular-nums ${done ? 'text-success' : ''}`}
        role="timer"
        aria-live="off"
      >
        {formatRest(seconds)}
      </span>
      <span className="min-w-0 flex-1 text-xs leading-tight text-muted-foreground">
        <span className="block truncate">
          descanso · série {timer.index + 1} de {timer.name}
        </span>
        {timer.targetSeconds != null ? (
          <span className={`block ${done ? 'font-medium text-success' : ''}`}>
            {done ? `alvo de ${timer.targetSeconds}s cumprido` : `alvo ${timer.targetSeconds}s`}
          </span>
        ) : null}
      </span>
      <Button
        size="sm"
        className="shrink-0"
        variant={done ? 'default' : 'outline'}
        onClick={onRegister}
      >
        Começou a série
      </Button>
      <button
        type="button"
        onClick={onDiscard}
        aria-label="Descartar o cronômetro sem registrar o descanso"
        className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

// mm:ss a partir dos segundos corridos. Passa de 60 minutos? O problema é
// maior que a formatação.
function formatRest(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
