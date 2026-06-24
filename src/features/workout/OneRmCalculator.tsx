import { useState, type ReactNode } from 'react'
import {
  ONE_RM_FORMULA_LABELS,
  estimateOneRm,
  percentTable,
  roundToIncrement,
  type OneRmFormula,
} from './oneRm'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const controlClass =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

export function OneRmCalculator() {
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [formula, setFormula] = useState<OneRmFormula>('epley')

  const w = Number(weight)
  const r = Number(reps)
  const e1rm = estimateOneRm(w, r, formula)
  const table = e1rm > 0 ? percentTable(e1rm) : []

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Carga (kg)">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </Field>
        <Field label="Repetições">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={reps}
            onChange={(e) => setReps(e.target.value)}
          />
        </Field>
        <Field label="Fórmula">
          <select
            className={controlClass}
            value={formula}
            onChange={(e) => setFormula(e.target.value as OneRmFormula)}
          >
            {(Object.keys(ONE_RM_FORMULA_LABELS) as OneRmFormula[]).map((f) => (
              <option key={f} value={f}>
                {ONE_RM_FORMULA_LABELS[f]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {e1rm > 0 ? (
        <>
          <div className="rounded-md border bg-primary/5 p-3">
            <span className="text-xs text-muted-foreground">
              1RM estimado ({ONE_RM_FORMULA_LABELS[formula]})
            </span>
            <p className="text-2xl font-semibold text-primary">
              {roundToIncrement(e1rm).toFixed(1)} kg{' '}
              <span className="text-sm font-normal text-muted-foreground">
                (~{e1rm.toFixed(1)})
              </span>
            </p>
          </div>

          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-3 py-1.5 text-left font-medium">%1RM</th>
                  <th className="px-3 py-1.5 text-right font-medium">Carga (kg)</th>
                  <th className="px-3 py-1.5 text-right font-medium">~reps</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row) => (
                  <tr key={row.pct} className="border-t">
                    <td className="px-3 py-1 tabular-nums">{row.pct}%</td>
                    <td className="px-3 py-1 text-right font-medium tabular-nums">
                      {roundToIncrement(row.load).toFixed(1)}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums text-muted-foreground">
                      {row.reps}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Estimativa (cargas arredondadas para 2,5 kg). A precisão cai acima de ~10–12
            repetições — use uma série mais pesada para um 1RM mais confiável.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Informe a carga e as repetições de uma série para estimar o 1RM e a tabela de %.
        </p>
      )}
    </div>
  )
}
