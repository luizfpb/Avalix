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

// Semana de CALENDÁRIO do plano, limitada ao tamanho do mesociclo. Complemento
// natural de completedWeeks: a primeira semana é a 1, não a 0. Plano sem data
// de início não tem semana de calendário.
//
// Depois do fim do mesociclo devolve a última semana, em vez de um número que
// não existe no plano.
//
// Atenção: isto NÃO é a semana do mesociclo em que o aluno está — é só onde o
// relógio diz que ele deveria estar. As duas divergem o tempo todo (começou
// depois de receber o plano, faltou uma semana, repetiu a semana de propósito),
// e confundi-las gravava `workout_logs.week_number` errado, o que por sua vez
// escolhia o override errado na tela. Quem pré-seleciona a semana da sessão é
// `suggestedPlanWeek`, que olha o histórico. Esta função serve para adesão e
// para medir a defasagem entre o plano no papel e o plano na vida real.
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

// =====================================================================
// SEMANA DO MESOCICLO (a que o aluno está vivendo, não a do calendário)
// =====================================================================

// Uma sessão já registrada, vista só pelo que ela diz sobre a posição no
// mesociclo. Serve tanto para `workout_logs` (tela do profissional) quanto
// para o resumo que a RPC do link devolve ao aluno — as duas telas precisam
// chegar ao MESMO número, senão professor e aluno gravam semanas diferentes
// no mesmo plano.
export type WeekLogPoint = { performed_at: string; week_number: number | null }

// De onde saiu a sugestão. A tela usa isto para explicar o número em vez de
// apenas exibi-lo: semana errada gravada em silêncio foi justamente o defeito.
//   first    — nenhuma sessão registrada ainda; começa na 1
//   continue — a semana do último treino ainda não fechou
//   advance  — a semana fechou; sugere a próxima
//   end      — a última semana do mesociclo fechou; não há próxima
export type PlanWeekBasis = 'first' | 'continue' | 'advance' | 'end'

export type PlanWeekSuggestion = {
  week: number
  basis: PlanWeekBasis
  // Semana do treino mais recente (null quando não há histórico).
  lastLoggedWeek: number | null
  // Sessões já feitas na passada atual por essa semana. "Passada", e não
  // "total": quem voltou para a semana 2 depois de ter ido para a 3 está
  // começando a semana 2 de novo, e a contagem tem que reiniciar junto.
  sessionsInCurrentPass: number
  sessionsPerWeek: number
}

// A semana do mesociclo em que o aluno está, derivada do que ele REALMENTE
// registrou — não da data.
//
// O app derivava isso do calendário (`currentWeek`), o que só acerta quando o
// aluno começa no dia em que o plano foi criado e nunca falta. Na prática ele
// recebe o plano numa segunda e começa duas semanas depois; falta uma semana
// inteira e volta; ou repete a semana 2 porque não foi bem. Em todos esses
// casos a tela oferecia uma semana que não existia na vida do aluno, e era
// esse número que ia para `workout_logs.week_number` — e daí para o override
// aplicado na tela, para o histórico e para o PDF.
//
// A regra aqui é a mesma que o app já usa para sugerir a DIVISÃO do dia
// (`suggestedWorkoutDayId`, que conta sessões feitas): continue de onde parou;
// só avance quando a semana fechar. A escolha continua editável, e quando a
// semana fecha a tela pergunta em vez de decidir sozinha — "fechou a semana"
// e "vou repetir a semana" são indistinguíveis para qualquer heurística, então
// essa é a única parte que cabe ao humano.
//
// `logs` deve vir do mais recente para o mais antigo; a função reordena por
// data por garantia, preservando a ordem recebida nos empates (várias sessões
// no mesmo dia).
export function suggestedPlanWeek(input: {
  weeks: number
  sessionsPerWeek: number
  logs: WeekLogPoint[]
}): PlanWeekSuggestion {
  const total = Math.max(1, Math.floor(input.weeks))
  const porSemana = Math.max(0, Math.floor(input.sessionsPerWeek))

  // Sessão sem semana anotada (registro antigo, ou quem deixou o campo vazio)
  // não diz nada sobre a posição no mesociclo: é ignorada em vez de zerar a
  // conta ou de interromper a passada atual.
  const comSemana = input.logs
    .filter((l): l is WeekLogPoint & { week_number: number } => l.week_number != null)
    .sort((a, b) => dataDoLog(b).localeCompare(dataDoLog(a)))

  if (comSemana.length === 0) {
    return {
      week: 1,
      basis: 'first',
      lastLoggedWeek: null,
      sessionsInCurrentPass: 0,
      sessionsPerWeek: porSemana,
    }
  }

  const ultima = comSemana[0].week_number
  // Passada atual = sessões consecutivas, a partir da mais recente, na mesma
  // semana. Para na primeira sessão de outra semana.
  let naPassada = 0
  for (const log of comSemana) {
    if (log.week_number !== ultima) break
    naPassada += 1
  }

  const fechou = porSemana > 0 && naPassada >= porSemana
  const comum = {
    lastLoggedWeek: ultima,
    sessionsInCurrentPass: naPassada,
    sessionsPerWeek: porSemana,
  }
  // O mesociclo pode ter encolhido depois que a sessão foi gravada (plano
  // reeditado de 8 para 6 semanas): o clamp evita oferecer uma semana que o
  // plano não tem mais.
  if (!fechou) return { ...comum, week: Math.min(ultima, total), basis: 'continue' }
  if (ultima >= total) return { ...comum, week: total, basis: 'end' }
  return { ...comum, week: Math.min(ultima + 1, total), basis: 'advance' }
}

function dataDoLog(log: WeekLogPoint): string {
  return log.performed_at.slice(0, 10)
}

// Início EFETIVO do plano, para medir adesão e defasagem.
//
// Antes era `starts_on ?? created_at`, ou seja: quem montou o plano em janeiro
// e viu o aluno começar em março já nascia com semanas de atraso e adesão
// arrasada, porque a conta começava no dia em que o plano foi digitado.
//
// A data informada pelo profissional continua valendo — é uma intenção
// explícita, e quem não apareceu na semana prevista realmente faltou. Mas a
// primeira sessão registrada vence quando é ANTERIOR a ela (o aluno começou
// antes do combinado) e é o que vale quando não há data informada. A criação
// do plano fica só como último recurso, para plano sem data e sem treino.
export function effectivePlanStart(
  startsOn: string | null | undefined,
  firstSessionOn: string | null | undefined,
  createdOn: string | null | undefined
): string | null {
  const candidatos = [startsOn, firstSessionOn]
    .filter((d): d is string => !!d)
    .map((d) => d.slice(0, 10))
  if (candidatos.length === 0) return createdOn ?? null
  return candidatos.reduce((menor, d) => (d < menor ? d : menor))
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
