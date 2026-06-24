import { useState } from 'react'
import { useAuth } from '../auth/context'
import { useCreateCustomExercise, useUpdateCustomExercise } from './hooks'
import type { ExerciseRow } from './api'
import {
  EQUIPMENT_OPTIONS,
  MOVEMENT_OPTIONS,
  MUSCLE_OPTIONS,
  emptyExerciseForm,
  exerciseFormSchema,
  exerciseFormToInput,
  exerciseFormToUpdate,
  exerciseRowToForm,
  type ExerciseFormValues,
} from './schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const controlClass =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

// Form único de exercício custom, usado na biblioteca (criar/editar) e no picker
// do builder (criar e adicionar). Valida pelo zod do schema; metadados de
// músculo/equipamento/padrão são obrigatórios — sem eles o volume não significa
// nada (mesma regra do banco).
export function ExerciseForm({
  orgId,
  exercise,
  onSaved,
  onCancel,
}: {
  orgId: string
  exercise?: ExerciseRow
  onSaved: (row: ExerciseRow) => void
  onCancel?: () => void
}) {
  const { user } = useAuth()
  const createMut = useCreateCustomExercise(orgId)
  const updateMut = useUpdateCustomExercise(orgId)
  const isEdit = !!exercise
  const [v, setV] = useState<ExerciseFormValues>(() =>
    exercise ? exerciseRowToForm(exercise) : emptyExerciseForm()
  )
  const [error, setError] = useState<string | null>(null)
  const busy = createMut.isPending || updateMut.isPending

  function set<K extends keyof ExerciseFormValues>(k: K, val: ExerciseFormValues[K]) {
    setV((p) => ({ ...p, [k]: val }))
  }
  function toggleSecondary(m: string) {
    setV((p) => ({
      ...p,
      secondary_muscles: p.secondary_muscles.includes(m as never)
        ? p.secondary_muscles.filter((x) => x !== m)
        : [...p.secondary_muscles, m as never],
    }))
  }

  async function submit() {
    setError(null)
    const parsed = exerciseFormSchema.safeParse(v)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os campos.')
      return
    }
    try {
      if (isEdit) {
        const row = await updateMut.mutateAsync({ id: exercise.id, input: exerciseFormToUpdate(parsed.data) })
        onSaved(row)
      } else {
        const row = await createMut.mutateAsync(exerciseFormToInput(parsed.data, orgId, user?.id ?? null))
        onSaved(row)
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <Input
        placeholder="Nome do exercício"
        value={v.name}
        onChange={(e) => set('name', e.target.value)}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select className={controlClass} value={v.primary_muscle} onChange={(e) => set('primary_muscle', e.target.value)}>
          <option value="">Músculo principal *</option>
          {MUSCLE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select className={controlClass} value={v.equipment} onChange={(e) => set('equipment', e.target.value)}>
          <option value="">Equipamento *</option>
          {EQUIPMENT_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select className={controlClass} value={v.movement_pattern} onChange={(e) => set('movement_pattern', e.target.value)}>
          <option value="">Padrão de movimento *</option>
          {MOVEMENT_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={v.is_unilateral ?? false}
            onChange={(e) => set('is_unilateral', e.target.checked)}
          />
          Exercício unilateral
        </label>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Músculos secundários (entram no volume com peso 0,5)</Label>
        <div className="flex flex-wrap gap-1">
          {MUSCLE_OPTIONS.map((m) => {
            const on = (v.secondary_muscles as string[]).includes(m.value)
            const isPrimary = v.primary_muscle === m.value
            return (
              <button
                key={m.value}
                type="button"
                disabled={isPrimary}
                onClick={() => toggleSecondary(m.value)}
                className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                  on
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                } ${isPrimary ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      <textarea
        rows={2}
        className={controlClass}
        placeholder="Dicas de execução (opcional)"
        value={v.cues ?? ''}
        onChange={(e) => set('cues', e.target.value)}
      />

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={submit} disabled={busy}>
          {busy ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar exercício'}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </div>
  )
}
