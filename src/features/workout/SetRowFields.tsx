import { Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { LogRow } from './logRows'

// Uma série da sessão em execução. É o componente que a mão suada usa no meio
// da academia, então os alvos são de 44 px e o número da série é, ele mesmo, o
// botão de "feita": marcar não custa um campo a mais na linha, e a linha
// inteira muda de cor para dizer o que já passou.
export function SetRowFields({
  name, index, row, onChange, repsPlaceholder = '—', rirPlaceholder = '—',
  restPlaceholder = '—', disabled = false, markable = true,
}: {
  name: string
  index: number
  row: LogRow
  onChange: (field: keyof LogRow, value: string | boolean) => void
  repsPlaceholder?: string
  rirPlaceholder?: string
  restPlaceholder?: string
  disabled?: boolean
  /**
   * Marcar "feita" só faz sentido enquanto a sessão está acontecendo. Na
   * correção de uma sessão já enviada o número volta a ser só o número.
   */
  markable?: boolean
}) {
  const number = index + 1
  const done = row.done === true
  return (
    <div
      className={`grid grid-cols-[2.75rem_repeat(4,minmax(0,1fr))] items-center gap-x-1.5 gap-y-0.5 rounded-md sm:gap-x-2 ${
        done ? 'bg-success/[0.07]' : ''
      }`}
    >
      {markable ? (
      <button
        type="button"
        aria-label={`Série ${number} de ${name} feita`}
        aria-pressed={done}
        disabled={disabled}
        onClick={() => onChange('done', !done)}
        className={`grid h-11 w-11 place-items-center justify-self-center rounded-md border text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
          done
            ? 'border-success bg-success/15 font-semibold text-success'
            : 'border-input text-muted-foreground hover:bg-accent'
        }`}
      >
        {done ? <Check className="size-5" aria-hidden="true" /> : number}
      </button>
      ) : (
        <span className="text-center text-xs text-muted-foreground">{number}</span>
      )}
      <Input aria-label={`Carga da série ${number} de ${name}`} className="h-11 w-full min-w-0 px-2"
        type="number" inputMode="decimal" min={0} max={1000} step="0.01" placeholder="kg"
        value={row.weight} disabled={disabled} onChange={(e) => onChange('weight', e.target.value)} />
      <Input aria-label={`Repetições da série ${number} de ${name}`} className="h-11 w-full min-w-0 px-2"
        type="number" inputMode="numeric" min={0} max={100} step={1} placeholder={repsPlaceholder}
        value={row.reps} disabled={disabled} onChange={(e) => onChange('reps', e.target.value)} />
      <Input aria-label={`RIR da série ${number} de ${name}`} className="h-11 w-full min-w-0 px-2"
        type="number" inputMode="decimal" min={0} max={10} step="0.5" placeholder={rirPlaceholder}
        value={row.rir} disabled={disabled || row.failure === true} onChange={(e) => onChange('rir', e.target.value)} />
      <Input aria-label={`Descanso da série ${number} de ${name}`} className="h-11 w-full min-w-0 px-2"
        type="number" inputMode="numeric" min={0} max={3600} step={1} placeholder={restPlaceholder}
        value={row.rest ?? ''} disabled={disabled} onChange={(e) => onChange('rest', e.target.value)} />
      <label className="col-span-2 col-start-4 flex min-h-11 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" className="size-5 accent-primary" checked={row.failure === true}
          aria-label={`Falha na série ${number} de ${name}`} disabled={disabled}
          onChange={(e) => onChange('failure', e.target.checked)} />
        Falha
      </label>
    </div>
  )
}
