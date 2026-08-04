import type { ActivePlanSummary, LogSummary } from './api'
import { adherencePct, plannedSessionsToDate } from './progress'
import { daysSince, dueForReassessment } from '../../lib/reminders'

// dias sem treino registrado (com plano ativo) que pedem atenção do profissional
export const QUIET_DAYS = 10

export type CarteiraRow = {
  subjectId: string
  name: string
  lastAssessedAt: string | null
  reassessDue: boolean
  planName: string | null
  adherencePct: number | null // null = sem plano ativo
  lastLogAt: string | null
  quiet: boolean // plano ativo mas sem treino registrado há QUIET_DAYS+
  attention: number // score de urgência (maior = mais urgente)
}

// Cruza alunos + última avaliação + plano ativo + execução numa linha por aluno
// ativo, ordenada por urgência. Puro e testável.
export function buildCarteira(input: {
  subjects: { id: string; full_name: string; is_active: boolean }[]
  lastAssessment: Record<string, string>
  activePlans: ActivePlanSummary[] // mais recente primeiro
  logSummary: Record<string, LogSummary>
  now: Date
  quietDays?: number
}): CarteiraRow[] {
  const quietDays = input.quietDays ?? QUIET_DAYS
  const planBySubject = new Map<string, ActivePlanSummary>()
  for (const p of input.activePlans) {
    if (!planBySubject.has(p.subjectId)) planBySubject.set(p.subjectId, p)
  }

  const rows: CarteiraRow[] = []
  for (const s of input.subjects) {
    if (!s.is_active) continue
    const lastAssessedAt = input.lastAssessment[s.id] ?? null
    const reassessDue = dueForReassessment(lastAssessedAt, input.now)
    const plan = planBySubject.get(s.id) ?? null

    let adherence: number | null = null
    let lastLogAt: string | null = null
    let quiet = false
    if (plan) {
      const summary = input.logSummary[plan.planId] ?? { count: 0, lastDate: null }
      // Denominador por semanas já fechadas: enquanto a primeira semana corre,
      // não há percentual a cobrar (null), em vez de 0%.
      const planned = plannedSessionsToDate(
        plan.weeks,
        plan.sessionsPerWeek,
        plan.startedOn,
        input.now
      )
      adherence = planned != null && planned > 0 ? adherencePct(summary.count, planned) : null
      lastLogAt = summary.lastDate
      // Sem log nenhum, o silêncio conta a partir do início do plano — antes
      // era Infinity, então um plano criado no mesmo dia já entrava como "sem
      // treino recente" e ia para o topo da lista de atenção.
      const referencia = lastLogAt ?? plan.startedOn
      const since = referencia ? daysSince(referencia, input.now) : 0
      quiet = since >= quietDays
    }

    const attention =
      (reassessDue ? 2 : 0) +
      (plan && quiet ? 2 : 0) +
      (adherence != null && adherence < 0.5 ? 1 : 0)

    rows.push({
      subjectId: s.id,
      name: s.full_name,
      lastAssessedAt,
      reassessDue,
      planName: plan?.name ?? null,
      adherencePct: adherence,
      lastLogAt,
      quiet: !!(plan && quiet),
      attention,
    })
  }
  return rows.sort((a, b) => b.attention - a.attention || a.name.localeCompare(b.name))
}
