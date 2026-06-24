import type { WorkoutDayRow, WorkoutExerciseRow, WorkoutPlanRow } from './api'
import { goalLabel } from './volume'

function fmtRir(rir: number): string {
  return Number.isInteger(rir) ? String(rir) : rir.toFixed(1)
}

// Resumo do plano em texto puro, pronto pro WhatsApp (usa *negrito* do app).
export function planShareText(input: {
  orgName: string
  plan: WorkoutPlanRow
  days: WorkoutDayRow[]
  exercises: WorkoutExerciseRow[]
  exerciseNames: Record<string, string>
}): string {
  const { orgName, plan, days, exercises, exerciseNames } = input
  const lines: string[] = []
  if (orgName) lines.push(orgName)
  lines.push(`*${plan.name}*`)
  lines.push(`${goalLabel(plan.goal)} · ${plan.weeks} ${plan.weeks === 1 ? 'semana' : 'semanas'}`)

  const ordered = days.slice().sort((a, b) => a.position - b.position)
  for (const day of ordered) {
    lines.push('')
    lines.push(`*Treino ${day.label}${day.name ? ` — ${day.name}` : ''}*`)
    const rows = exercises
      .filter((e) => e.day_id === day.id)
      .slice()
      .sort((a, b) => a.position - b.position)
    rows.forEach((ex, i) => {
      const rir = ex.rir != null ? ` (RIR ${fmtRir(ex.rir)})` : ''
      lines.push(`${i + 1}. ${exerciseNames[ex.exercise_id] ?? 'Exercício'} — ${ex.sets}×${ex.reps}${rir}`)
    })
  }

  lines.push('')
  lines.push('Plano feito no Avalix.')
  return lines.join('\n')
}

// URL do WhatsApp com o texto pré-preenchido. Só usa o número quando parece
// E.164 completo (>= 12 dígitos, com código do país); caso contrário abre sem
// destinatário e o usuário escolhe o contato (mais seguro que mandar pra número
// errado).
export function whatsappUrl(text: string, phone?: string | null): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  const base = digits.length >= 12 ? `https://wa.me/${digits}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(text)}`
}
