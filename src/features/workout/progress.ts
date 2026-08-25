import type { SetHistoryPoint } from './api'
import { estimateOneRm } from './oneRm'

// Análise de execução: adesão (sessões feitas x previstas) e progressão de
// carga por exercício (melhor e1RM por dia ao longo do tempo). Puro e testável;
// reusa o motor de e1RM da calculadora (Etapa F).

// Sequência de sessões de uma semana, por rótulo de divisão (ex.: A·B·A·C).
// weekly_schedule permite repetir uma divisão na semana; vazio significa "cada
// divisão uma vez, na ordem".
//
// Esta regra estava reescrita inline em três lugares (PDF de treino, tela de
// execução e detalhe do plano), duas devolvendo rótulos e uma devolvendo só a
// contagem. É regra de negócio — uma divisão repetida conta em dobro no volume
// e na adesão — e por isso passa a morar num lugar só, testável.
export function weekSessionLabels(
  weeklySchedule: string[] | null | undefined,
  dayLabelsInOrder: string[]
): string[] {
  const schedule = weeklySchedule ?? []
  return schedule.length > 0 ? schedule : dayLabelsInOrder
}

export function sessionsPerWeek(
  weeklySchedule: string[] | null | undefined,
  dayCount: number
): number {
  const schedule = weeklySchedule ?? []
  return schedule.length > 0 ? schedule.length : dayCount
}

// Total de sessões do plano inteiro. Serve para a legenda ("previsto = 8
// semanas x 3 sessões"), NÃO para medir adesão — ver plannedSessionsToDate.
export function plannedSessions(weeks: number, dayCount: number): number {
  return Math.max(0, Math.floor(weeks)) * Math.max(0, Math.floor(dayCount))
}

export function adherencePct(done: number, planned: number): number {
  if (planned <= 0) return 0
  return Math.min(1, done / planned)
}

const MS_POR_DIA = 86_400_000

// Semanas JÁ CONCLUÍDAS desde o início do plano. Durante a primeira semana
// devolve 0: uma semana só pode ser cobrada depois de terminar.
export function completedWeeks(startedOn: string | null, now: Date): number | null {
  if (!startedOn) return null
  const inicio = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(startedOn) ? `${startedOn}T00:00:00` : startedOn
  )
  if (!Number.isFinite(inicio)) return null
  const dias = Math.floor((now.getTime() - inicio) / MS_POR_DIA)
  if (dias < 0) return 0 // plano agendado para o futuro
  return Math.floor(dias / 7)
}

// Semana do mesociclo que está correndo agora, limitada ao tamanho do plano.
// É a semana que a página do aluno pré-seleciona, e o complemento natural de
// completedWeeks: a primeira semana é a 1, não a 0. Plano sem data de início
// não tem semana corrente — aí quem escolhe é o aluno.
//
// Depois do fim do mesociclo devolve a última semana, em vez de um número que
// não existe no plano: quem continua treinando o plano vencido está repetindo
// a última semana, e é isso que a tela deve mostrar.
export function currentWeek(
  weeks: number,
  startedOn: string | null,
  now: Date
): number | null {
  const fechadas = completedWeeks(startedOn, now)
  if (fechadas == null) return null
  const total = Math.max(1, Math.floor(weeks))
  return Math.min(fechadas + 1, total)
}

// Sessões esperadas ATÉ AGORA, e não no plano inteiro.
//
// O denominador antigo era `weeks * dayCount`, o plano completo, o que fazia
// todo aluno em dia parecer relapso: quem não faltou a nada na semana 2 de um
// plano de 8 semanas aparecia com 25% e barra laranja, e um plano criado hoje
// já nascia com 0% e alerta. Como quase todo plano ativo está na primeira
// metade, o sinal ficava sistematicamente errado justamente na tela de
// retenção. `starts_on` era capturado no builder e impresso no PDF, mas não
// entrava em cálculo nenhum.
//
// Devolve null quando ainda não há semana fechada (ou não dá para saber a
// data de início): aí não se exibe percentual, em vez de exibir 0%.
export function plannedSessionsToDate(
  weeks: number,
  dayCount: number,
  startedOn: string | null,
  now: Date
): number | null {
  const fechadas = completedWeeks(startedOn, now)
  if (fechadas == null) return null
  const cobraveis = Math.min(fechadas, Math.max(0, Math.floor(weeks)))
  if (cobraveis <= 0) return null
  return cobraveis * Math.max(0, Math.floor(dayCount))
}

export type ExerciseProgress = {
  exerciseId: string
  points: { date: string; e1rm: number }[] // melhor e1RM por dia, ordem cronológica
  latestE1rm: number
  bestE1rm: number
  sessions: number
}

// Agrupa o histórico por exercício e, dentro de cada um, por dia, guardando o
// MELHOR e1RM do dia (a série mais forte). Séries sem carga+reps são ignoradas
// (bodyweight/tempo não geram e1RM).
export function exerciseProgression(history: SetHistoryPoint[]): ExerciseProgress[] {
  const byExercise = new Map<string, Map<string, number>>()
  for (const h of history) {
    if (!(h.weightKg && h.weightKg > 0) || !(h.reps && h.reps > 0)) continue
    const e1 = estimateOneRm(h.weightKg, h.reps)
    if (!(e1 > 0)) continue
    const dates = byExercise.get(h.exerciseId) ?? new Map<string, number>()
    dates.set(h.performedAt, Math.max(dates.get(h.performedAt) ?? 0, e1))
    byExercise.set(h.exerciseId, dates)
  }

  const out: ExerciseProgress[] = []
  for (const [exerciseId, dates] of byExercise) {
    const points = [...dates.entries()]
      .map(([date, e1rm]) => ({ date, e1rm }))
      .sort((a, b) => a.date.localeCompare(b.date))
    if (points.length === 0) continue
    out.push({
      exerciseId,
      points,
      latestE1rm: points[points.length - 1].e1rm,
      bestE1rm: Math.max(...points.map((p) => p.e1rm)),
      sessions: points.length,
    })
  }
  // mais sessões primeiro (exercícios mais acompanhados no topo)
  return out.sort((a, b) => b.sessions - a.sessions)
}
