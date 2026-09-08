import { Input } from '@/components/ui/input'
import type { LogRow } from './logRows'

export function SetRowFields({
  name, index, row, onChange, repsPlaceholder = '—', rirPlaceholder = '—',
  restPlaceholder = '—', disabled = false,
}: {
  name: string
  index: number
  row: LogRow
  onChange: (field: keyof LogRow, value: string | boolean) => void
  repsPlaceholder?: string
  rirPlaceholder?: string
  restPlaceholder?: string
  disabled?: boolean
}) {
  const number = index + 1
  return (
    <div className="grid grid-cols-[1.25rem_repeat(4,minmax(0,1fr))] items-center gap-x-1.5 gap-y-0.5 sm:gap-x-2">
      <span className="text-center text-xs text-muted-foreground">{number}</span>
      <Input aria-label={`Carga da série ${number} de ${name}`} className="h-9 w-full min-w-0 px-2"
        type="number" inputMode="decimal" min={0} max={1000} step="0.01" placeholder="kg"
        value={row.weight} disabled={disabled} onChange={(e) => onChange('weight', e.target.value)} />
      <Input aria-label={`Repetições da série ${number} de ${name}`} className="h-9 w-full min-w-0 px-2"
        type="number" inputMode="numeric" min={0} max={100} step={1} placeholder={repsPlaceholder}
        value={row.reps} disabled={disabled} onChange={(e) => onChange('reps', e.target.value)} />
      <Input aria-label={`RIR da série ${number} de ${name}`} className="h-9 w-full min-w-0 px-2"
        type="number" inputMode="decimal" min={0} max={10} step="0.5" placeholder={rirPlaceholder}
        value={row.rir} disabled={disabled || row.failure === true} onChange={(e) => onChange('rir', e.target.value)} />
      <Input aria-label={`Descanso da série ${number} de ${name}`} className="h-9 w-full min-w-0 px-2"
        type="number" inputMode="numeric" min={0} max={3600} step={1} placeholder={restPlaceholder}
        value={row.rest ?? ''} disabled={disabled} onChange={(e) => onChange('rest', e.target.value)} />
      <label className="col-span-2 col-start-4 flex min-h-8 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" className="size-4 accent-primary" checked={row.failure === true}
          aria-label={`Falha na série ${number} de ${name}`} disabled={disabled}
          onChange={(e) => onChange('failure', e.target.checked)} />
        Falha
      </label>
    </div>
  )
}
