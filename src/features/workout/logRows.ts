// Rascunhos anteriores ao campo de descanso continuam legíveis.
export type LogRow = { weight: string; reps: string; rir: string; rest?: string; failure?: boolean | null }

export function updateLogRow(row: LogRow, field: keyof LogRow, value: string | boolean): LogRow {
  if (field === 'failure') {
    const failure = value === true
    return { ...row, failure, ...(failure ? { rir: '0' } : {}) }
  }
  return typeof value === 'string' ? { ...row, [field]: value } : row
}

export function validateLogRows(rows: Record<string, LogRow[]>): string | null {
  const restError = validateRestRows(rows)
  if (restError) return restError
  for (const row of Object.values(rows).flat()) {
    if (row.failure !== true) continue
    if (!row.weight.trim() && !row.reps.trim()) {
      return 'Preencha a carga ou as repetições da série em que marcou falha.'
    }
    if (!row.rir.trim() || Number(row.rir) !== 0) {
      return 'Uma série marcada com falha deve ter RIR 0.'
    }
  }
  return null
}

export function validateRestRows(rows: Record<string, LogRow[]>): string | null {
  for (const row of Object.values(rows).flat()) {
    const rest = row.rest?.trim() ?? ''
    if (!rest) continue
    const seconds = Number(rest)
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) {
      return 'Informe o descanso em segundos inteiros, de 0 a 3600, ou deixe em branco.'
    }
    if (!row.weight.trim() && !row.reps.trim()) {
      return 'Preencha a carga ou as repetições da série em que registrou descanso.'
    }
  }
  return null
}

export function ensureLogRows(
  previous: Record<string, LogRow[]>,
  exercises: { id: string; sets: number }[]
): Record<string, LogRow[]> {
  const next = { ...previous }
  for (const exercise of exercises) {
    if (!next[exercise.id]) {
      next[exercise.id] = Array.from(
        { length: Math.min(exercise.sets, 12) },
        () => ({ weight: '', reps: '', rir: '', rest: '', failure: false })
      )
    }
  }
  return next
}
