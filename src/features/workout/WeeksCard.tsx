import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { EditorOverride, EditorPlan } from './builder'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export type WeeksCardExercise = {
  key: string
  tag: string
  name: string
  templateSets: number
  templateReps: string
  templateRir: number | null
  templateRest: number | null
}

// Overrides por semana (séries/reps/RIR/descanso/pular) + deload/rótulo
// (extraído de TreinoNovo na v2.0, sem mudança de comportamento).
export function WeeksCard({
  plan,
  flatExercises,
  onWeekMeta,
  onOverride,
}: {
  plan: EditorPlan
  flatExercises: WeeksCardExercise[]
  onWeekMeta: (week: number, patch: Partial<{ label: string | null; isDeload: boolean }>) => void
  onOverride: (week: number, exKey: string, patch: Partial<EditorOverride>) => void
}) {
  const [openWeek, setOpenWeek] = useState<number | null>(null)
  const weeks = Array.from({ length: plan.weeks }, (_, i) => i + 1)

  function metaOf(week: number) {
    return plan.weeksMeta.find((w) => w.week === week)
  }
  function overrideOf(week: number, exKey: string) {
    return plan.overrides.find((o) => o.week === week && o.exerciseKey === exKey)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Semanas e ajustes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {weeks.map((week) => {
          const meta = metaOf(week)
          const isOpen = openWeek === week
          return (
            <div key={week} className="rounded-md border">
              <div className="flex flex-wrap items-center gap-2 p-2">
                <button
                  type="button"
                  onClick={() => setOpenWeek(isOpen ? null : week)}
                  className="flex items-center gap-1 text-sm font-medium"
                >
                  {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  Semana {week}
                </button>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={meta?.isDeload ?? false}
                    onChange={(e) => onWeekMeta(week, { isDeload: e.target.checked })}
                  />
                  Deload
                </label>
                <Input
                  className="h-8 w-40"
                  placeholder="Rótulo (opcional)"
                  value={meta?.label ?? ''}
                  onChange={(e) => onWeekMeta(week, { label: e.target.value || null })}
                />
              </div>
              {isOpen ? (
                <div className="space-y-1.5 border-t p-2">
                  <p className="text-xs text-muted-foreground">
                    Ajuste séries/reps/RIR/descanso ou marque pular. Em branco = igual ao template.
                  </p>
                  <div className="hidden items-center gap-2 px-1 text-[11px] text-muted-foreground sm:flex">
                    <span className="w-36">Exercício</span>
                    <span className="w-14 text-center">séries</span>
                    <span className="w-16 text-center">reps</span>
                    <span className="w-12 text-center">RIR</span>
                    <span className="w-16 text-center">desc (s)</span>
                    <span className="w-10 text-center">pular</span>
                  </div>
                  {flatExercises.map((ex) => {
                    const ov = overrideOf(week, ex.key)
                    const skip = ov?.isSkipped ?? false
                    return (
                      <div
                        key={ex.key}
                        className="flex flex-wrap items-center gap-2 text-sm sm:flex-nowrap"
                      >
                        <span className="w-full truncate sm:w-36">
                          <span className="text-muted-foreground">{ex.tag}</span> {ex.name}
                        </span>
                        <Input
                          className="h-8 w-14"
                          type="number"
                          min={1}
                          max={20}
                          aria-label={`Séries de ${ex.name} na semana ${week}`}
                          placeholder={String(ex.templateSets)}
                          value={ov?.sets ?? ''}
                          disabled={skip}
                          onChange={(e) =>
                            onOverride(week, ex.key, {
                              sets: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                        <Input
                          className="h-8 w-16"
                          aria-label={`Reps de ${ex.name} na semana ${week}`}
                          placeholder={ex.templateReps}
                          value={ov?.reps ?? ''}
                          disabled={skip}
                          onChange={(e) => onOverride(week, ex.key, { reps: e.target.value || null })}
                        />
                        <Input
                          className="h-8 w-12"
                          type="number"
                          min={0}
                          max={10}
                          aria-label={`RIR de ${ex.name} na semana ${week}`}
                          placeholder={ex.templateRir != null ? String(ex.templateRir) : '—'}
                          value={ov?.rir ?? ''}
                          disabled={skip}
                          onChange={(e) =>
                            onOverride(week, ex.key, {
                              rir: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                        <Input
                          className="h-8 w-16"
                          type="number"
                          min={0}
                          max={600}
                          aria-label={`Descanso de ${ex.name} na semana ${week}`}
                          placeholder={ex.templateRest != null ? String(ex.templateRest) : '—'}
                          value={ov?.restSeconds ?? ''}
                          disabled={skip}
                          onChange={(e) =>
                            onOverride(week, ex.key, {
                              restSeconds: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                        <label
                          className="flex w-10 items-center justify-center"
                          title="Pular nesta semana"
                        >
                          <input
                            type="checkbox"
                            checked={skip}
                            onChange={(e) => onOverride(week, ex.key, { isSkipped: e.target.checked })}
                          />
                        </label>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
