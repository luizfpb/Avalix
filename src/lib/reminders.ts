// Lógica pura de lembretes/pendências: rótulo relativo de dia e gatilho de
// reavaliação. Sem push nativo (custaria infra); são avisos in-app baseados nos
// dados que já existem (agenda + avaliações). Testável.

export const REASSESS_DAYS = 90

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// dias de calendário entre `iso` e `now` (positivo = no passado).
export function daysSince(iso: string, now: Date): number {
  const then = startOfDay(new Date(iso)).getTime()
  const today = startOfDay(now).getTime()
  return Math.round((today - then) / 86400000)
}

// rótulo relativo de um momento (por dia de calendário).
export function relativeDayLabel(iso: string, now: Date): string {
  const diff = -daysSince(iso, now) // positivo = futuro
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  if (diff === -1) return 'Ontem'
  if (diff > 1) return `em ${diff} dias`
  return `há ${-diff} dias`
}

// aluno precisa reavaliar? null = nunca avaliado (sim).
export function dueForReassessment(
  lastAssessedAt: string | null,
  now: Date,
  thresholdDays = REASSESS_DAYS
): boolean {
  if (!lastAssessedAt) return true
  return daysSince(lastAssessedAt, now) >= thresholdDays
}
