export type LogRow = { weight: string; reps: string; rir: string }

export function ensureLogRows(
  previous: Record<string, LogRow[]>,
  exercises: { id: string; sets: number }[]
): Record<string, LogRow[]> {
  const next = { ...previous }
  for (const exercise of exercises) {
    if (!next[exercise.id]) {
      next[exercise.id] = Array.from(
        { length: Math.min(exercise.sets, 12) },
        () => ({ weight: '', reps: '', rir: '' })
      )
    }
  }
  return next
}
