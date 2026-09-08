import { useEffect, useId, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SetRowFields } from './SetRowFields'
import { updateLogRow, validateLogRows, type LogRow } from './logRows'

export type EditableSessionSet = {
  exerciseId: string
  exerciseName: string
  setNumber: number
  weightKg: number | null
  reps: number | null
  rir: number | null
  restSeconds?: number | null
  reachedFailure?: boolean | null
}
export type SessionEditValues = {
  performedAt: string
  notes: string | null
  sets: EditableSessionSet[]
}

type EditRow = LogRow & { key: string }
type Exercise = { id: string; name: string; rows: EditRow[] }

function initialExercises(sets: EditableSessionSet[]): Exercise[] {
  const groups = new Map<string, Exercise>()
  for (const set of [...sets].sort((a, b) => a.setNumber - b.setNumber)) {
    let group = groups.get(set.exerciseId)
    if (!group) {
      group = { id: set.exerciseId, name: set.exerciseName, rows: [] }
      groups.set(set.exerciseId, group)
    }
    group.rows.push({ key: crypto.randomUUID(), weight: String(set.weightKg ?? ''),
      reps: String(set.reps ?? ''), rir: String(set.rir ?? ''), rest: String(set.restSeconds ?? ''),
      failure: set.reachedFailure ?? null })
  }
  return [...groups.values()]
}

const numberOrNull = (value: string | undefined) => value?.trim() ? Number(value) : null

export function SessionEditForm({ sets, performedAt, notes, onSave, onCancel, exerciseOptions = [] }: {
  sets: EditableSessionSet[]
  performedAt: string
  notes: string | null
  onSave: (value: SessionEditValues) => Promise<void>
  onCancel: () => void
  exerciseOptions?: { id: string; name: string }[]
}) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const [exercises, setExercises] = useState(() => initialExercises(sets))
  const [date, setDate] = useState(performedAt)
  const [text, setText] = useState(notes ?? '')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [choice, setChoice] = useState('')
  const maxSets = Math.max(60, sets.length)
  const maxNotes = Math.max(600, notes?.length ?? 0)
  const available = [...new Map(exerciseOptions.map((ex) => [ex.id, ex])).values()]
    .filter((ex) => !exercises.some((existing) => existing.id === ex.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    if (!dirty && !saving) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty, saving])

  function cancel() {
    if (saving) return
    if (dirty) setConfirmCancel(true)
    else onCancel()
  }
  function changeRows(exerciseId: string, update: (rows: EditRow[]) => EditRow[]) {
    setDirty(true)
    setExercises((previous) => previous.map((ex) => ex.id === exerciseId ? { ...ex, rows: update(ex.rows) } : ex))
  }
  async function save() {
    if (saving) return
    setError(null)
    const rowError = validateLogRows(Object.fromEntries(exercises.map((ex) => [ex.id, ex.rows])))
    if (rowError) return setError(rowError)
    const parsed: EditableSessionSet[] = []
    for (const exercise of exercises) {
      let number = 0
      for (const row of exercise.rows) {
        const weight = numberOrNull(row.weight)
        const reps = numberOrNull(row.reps)
        const rir = numberOrNull(row.rir)
        if (weight == null && reps == null) {
          if (rir != null) return setError('Preencha a carga ou as repetições de cada série, ou remova a linha.')
          continue
        }
        if (weight != null && (!Number.isFinite(weight) || weight < 0 || weight > 1000)) {
          return setError('Informe uma carga entre 0 e 1000 kg, ou deixe em branco.')
        }
        if (reps != null && (!Number.isInteger(reps) || reps < 0 || reps > 100)) {
          return setError('Informe repetições inteiras entre 0 e 100, ou deixe em branco.')
        }
        if (rir != null && (!Number.isFinite(rir) || rir < 0 || rir > 10)) {
          return setError('Informe RIR entre 0 e 10, ou deixe em branco.')
        }
        parsed.push({ exerciseId: exercise.id, exerciseName: exercise.name, setNumber: ++number,
          weightKg: weight, reps, rir, restSeconds: numberOrNull(row.rest), reachedFailure: row.failure ?? null })
      }
    }
    if (parsed.length === 0 || parsed.length > maxSets) return setError(`Mantenha entre 1 e ${maxSets} séries no treino.`)
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Informe a data do treino.')
    setSaving(true)
    try {
      await onSave({ performedAt: date, notes: text.trim() || null, sets: parsed })
      setDirty(false)
    } catch (cause) {
      setError(cause && typeof cause === 'object' && 'message' in cause && !(cause instanceof TypeError)
        ? String(cause.message)
        : 'Não foi possível salvar as correções. O preenchimento foi mantido; tente novamente com internet.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <dialog ref={dialog} aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); cancel() }}
        className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border bg-background p-4 text-foreground shadow-xl backdrop:bg-black/50 sm:p-5">
        <form noValidate onSubmit={(event) => { event.preventDefault(); void save() }} className="space-y-4">
          <div>
            <h2 id={`${id}-title`} className="text-lg font-semibold">Editar treino</h2>
            <p className="mt-1 text-xs text-muted-foreground">As correções são salvas nesta sessão.</p>
          </div>
          <fieldset disabled={saving} className="min-w-0 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-date`}>Data do treino</Label>
              <Input id={`${id}-date`} type="date" value={date}
                onChange={(event) => { setDate(event.target.value); setDirty(true) }} />
            </div>
            <p className="text-xs text-muted-foreground">RIR 0: não faria outra repetição. Marque Falha se tentou e não conseguiu completá-la.</p>
            {exercises.map((ex) => (
              <div key={ex.id} className="rounded-md border bg-muted/20 p-2.5">
                <p className="mb-2 text-sm font-medium">{ex.name}</p>
                <div className="grid grid-cols-[1.25rem_repeat(4,minmax(0,1fr))] items-center gap-1.5 text-center text-[11px] text-muted-foreground sm:gap-2">
                  <span /><span>carga (kg)</span><span>reps</span><span>RIR</span><span>desc. (s)</span>
                </div>
                {ex.rows.map((row, index) => (
                  <div key={row.key} className="mt-1">
                    <SetRowFields name={ex.name} index={index} row={row} disabled={saving}
                      onChange={(field, value) => changeRows(ex.id, (rows) => rows.map((r) => r.key === row.key ? { ...updateLogRow(r, field, value), key: r.key } : r))} />
                    <button type="button" className="-mt-8 flex min-h-8 items-center gap-1 px-1 text-xs text-muted-foreground hover:text-destructive"
                      aria-label={`Remover série ${index + 1} de ${ex.name}`}
                      onClick={() => changeRows(ex.id, (rows) => rows.filter((r) => r.key !== row.key))}>
                      <Trash2 className="size-3" aria-hidden="true" /> Remover
                    </button>
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" className="mt-1" disabled={ex.rows.length >= 50 || exercises.reduce((sum, e) => sum + e.rows.length, 0) >= maxSets}
                  aria-label={`Adicionar série de ${ex.name}`}
                  onClick={() => changeRows(ex.id, (rows) => [...rows, { key: crypto.randomUUID(), weight: '', reps: '', rir: '', rest: '', failure: false }])}>
                  <Plus className="size-3" aria-hidden="true" /> Série
                </Button>
              </div>
            ))}
            {available.length > 0 ? (
              <div className="space-y-1.5 rounded-md border border-dashed p-2.5">
                <Label htmlFor={`${id}-exercise`}>Adicionar exercício</Label>
                <select id={`${id}-exercise`} value={choice} className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                  onChange={(event) => setChoice(event.target.value)}>
                  <option value="">Escolher exercício...</option>
                  {available.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                </select>
                <Button type="button" variant="outline" size="sm" disabled={!choice || exercises.reduce((sum, e) => sum + e.rows.length, 0) >= maxSets}
                  onClick={() => {
                    const chosen = available.find((ex) => ex.id === choice)
                    if (!chosen) return
                    setExercises((previous) => [...previous, { ...chosen, rows: [{ key: crypto.randomUUID(), weight: '', reps: '', rir: '', rest: '', failure: false }] }])
                    setChoice('')
                    setDirty(true)
                  }}><Plus className="size-3" aria-hidden="true" /> Adicionar exercício</Button>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-notes`}>Observações</Label>
              <textarea id={`${id}-notes`} value={text} maxLength={maxNotes} rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                onChange={(event) => { setText(event.target.value); setDirty(true) }} />
            </div>
          </fieldset>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" disabled={saving} onClick={cancel}>Cancelar</Button>
            <Button type="submit" disabled={saving || !dirty}>{saving ? 'Salvando...' : 'Salvar correções'}</Button>
          </div>
        </form>
      </dialog>
      <ConfirmDialog open={confirmCancel} title="Descartar as correções?" description="As alterações que você fez aqui ainda não foram salvas."
        confirmLabel="Descartar" cancelLabel="Continuar editando" onConfirm={onCancel} onCancel={() => setConfirmCancel(false)} />
    </>
  )
}
