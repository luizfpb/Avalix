import type {
  WorkoutDayRow,
  WorkoutExerciseRow,
  WorkoutPlanRow,
  WorkoutWeekOverrideRow,
} from './api'
import { goalLabel } from './volume'

function fmtRir(rir: number): string {
  return Number.isInteger(rir) ? String(rir) : rir.toFixed(1)
}

function fmtRest(seconds: number | null): string {
  if (seconds == null) return ''
  return ` · ${seconds}s`
}

// Resumo do plano em texto puro, pronto pro WhatsApp (usa *negrito* do app).
//
// Este texto e o PDF são os DOIS documentos oficiais do mesmo plano, e eles
// divergiam: aqui só saía `séries×reps (RIR)` da linha base, sem os overrides
// semanais (workout_week_overrides), sem a sequência da semana
// (weekly_schedule) e sem descanso/cadência. Num mesociclo com progressão, o
// aluno que recebia pelo WhatsApp — justamente o canal do celular — executava
// a semana 1 durante as 8 semanas, e sem saber a ordem A/B/C. Prescrição em
// dois canais não pode dizer coisas diferentes.
export function planShareText(input: {
  orgName: string
  plan: WorkoutPlanRow
  days: WorkoutDayRow[]
  exercises: WorkoutExerciseRow[]
  exerciseNames: Record<string, string>
  overrides?: WorkoutWeekOverrideRow[]
}): string {
  const { orgName, plan, days, exercises, exerciseNames } = input
  const overrides = input.overrides ?? []
  const lines: string[] = []
  if (orgName) lines.push(orgName)
  lines.push(`*${plan.name}*`)
  lines.push(`${goalLabel(plan.goal)} · ${plan.weeks} ${plan.weeks === 1 ? 'semana' : 'semanas'}`)
  // A coluna é NOT NULL no banco, mas defensivo: um plano antigo carregado por
  // um select parcial não pode derrubar o compartilhamento.
  const sequencia = plan.weekly_schedule ?? []
  if (sequencia.length > 0) {
    lines.push(`Sequência da semana: ${sequencia.join(' · ')}`)
  }

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
      const extra = `${fmtRest(ex.rest_seconds)}${ex.tempo ? ` · cadência ${ex.tempo}` : ''}`
      lines.push(
        `${i + 1}. ${exerciseNames[ex.exercise_id] ?? 'Exercício'} — ${ex.sets}×${ex.reps}${rir}${extra}`
      )
    })
  }

  // Ajustes por semana, agrupados como no PDF. Sem isto o plano enviado
  // congelava a semana 1.
  const porSemana = new Map<number, string[]>()
  const nomeDoExercicio = new Map(
    exercises.map((e) => [e.id, exerciseNames[e.exercise_id] ?? 'Exercício'])
  )
  for (const o of overrides.slice().sort((a, b) => a.week_number - b.week_number)) {
    const nome = nomeDoExercicio.get(o.workout_exercise_id)
    if (!nome) continue
    const partes: string[] = []
    if (o.is_skipped) {
      partes.push('não fazer nesta semana')
    } else {
      if (o.sets != null) partes.push(`${o.sets} séries`)
      if (o.reps) partes.push(`${o.reps} reps`)
      if (o.rir != null) partes.push(`RIR ${fmtRir(o.rir)}`)
      if (o.rest_seconds != null) partes.push(`${o.rest_seconds}s`)
    }
    if (o.notes) partes.push(o.notes)
    if (partes.length === 0) continue
    const atual = porSemana.get(o.week_number) ?? []
    atual.push(`- ${nome}: ${partes.join(' · ')}`)
    porSemana.set(o.week_number, atual)
  }
  if (porSemana.size > 0) {
    lines.push('')
    lines.push('*Ajustes por semana*')
    for (const semana of [...porSemana.keys()].sort((a, b) => a - b)) {
      lines.push('')
      lines.push(`*Semana ${semana}*`)
      lines.push(...(porSemana.get(semana) ?? []))
    }
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
