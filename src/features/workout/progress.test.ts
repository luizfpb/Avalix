import { describe, it, expect } from 'vitest'
import {
  adherencePct,
  completedWeeks,
  currentWeek,
  effectivePlanStart,
  exerciseProgression,
  plannedSessions,
  plannedSessionsToDate,
  sessionsPerWeek,
  suggestedPlanWeek,
  weekSessionLabels,
} from './progress'
import type { SetHistoryPoint } from './api'

describe('plannedSessions / adherencePct', () => {
  it('sessões previstas = semanas × dias (plano inteiro, só para legenda)', () => {
    expect(plannedSessions(4, 3)).toBe(12)
    expect(plannedSessions(0, 3)).toBe(0)
  })
  it('adesão limitada a 1 e 0 quando nada previsto', () => {
    expect(adherencePct(6, 12)).toBe(0.5)
    expect(adherencePct(15, 12)).toBe(1)
    expect(adherencePct(3, 0)).toBe(0)
  })
})

describe('sessões da semana (regra que estava duplicada em 3 arquivos)', () => {
  it('weekly_schedule vazio = cada divisão uma vez, na ordem', () => {
    expect(weekSessionLabels([], ['A', 'B', 'C'])).toEqual(['A', 'B', 'C'])
    expect(weekSessionLabels(null, ['A', 'B'])).toEqual(['A', 'B'])
    expect(sessionsPerWeek([], 3)).toBe(3)
    expect(sessionsPerWeek(undefined, 2)).toBe(2)
  })

  it('divisão repetida na semana conta em dobro (ABA = 3 sessões)', () => {
    expect(weekSessionLabels(['A', 'B', 'A'], ['A', 'B'])).toEqual(['A', 'B', 'A'])
    expect(sessionsPerWeek(['A', 'B', 'A'], 2)).toBe(3)
  })
})

describe('currentWeek', () => {
  const agora = new Date('2026-06-24T10:00:00')

  it('a primeira semana e a 1, nao a 0', () => {
    expect(currentWeek(8, '2026-06-24', agora)).toBe(1)
    expect(currentWeek(8, '2026-06-18', agora)).toBe(1)
  })

  it('avanca a cada semana fechada', () => {
    expect(currentWeek(8, '2026-06-17', agora)).toBe(2)
    expect(currentWeek(8, '2026-06-10', agora)).toBe(3)
  })

  it('nao passa do tamanho do mesociclo', () => {
    // quem continua treinando o plano vencido esta repetindo a ultima semana,
    // e e ela que a tela do aluno deve mostrar - nao uma semana inexistente
    expect(currentWeek(2, '2026-01-01', agora)).toBe(2)
  })

  it('sem data de inicio nao ha semana corrente', () => {
    expect(currentWeek(8, null, agora)).toBeNull()
  })

  it('plano agendado para o futuro comeca na semana 1', () => {
    expect(currentWeek(8, '2026-07-01', agora)).toBe(1)
  })
})

describe('semanas decorridas', () => {
  const agora = new Date('2026-06-24T10:00:00')

  it('só conta semana fechada', () => {
    expect(completedWeeks('2026-06-24', agora)).toBe(0) // dia 1
    expect(completedWeeks('2026-06-18', agora)).toBe(0) // 6 dias
    expect(completedWeeks('2026-06-17', agora)).toBe(1) // 7 dias
    expect(completedWeeks('2026-06-10', agora)).toBe(2)
  })

  it('plano agendado para o futuro não conta semana negativa', () => {
    expect(completedWeeks('2026-07-01', agora)).toBe(0)
  })

  it('sem data de início não há como saber', () => {
    expect(completedWeeks(null, agora)).toBeNull()
    expect(plannedSessionsToDate(8, 3, null, agora)).toBeNull()
  })

  it('cobra só as semanas fechadas e nunca mais que o plano inteiro', () => {
    // Semana 1 correndo: nada a cobrar ainda (era 0/24 = 0% antes).
    expect(plannedSessionsToDate(8, 3, '2026-06-22', agora)).toBeNull()
    // 1 semana fechada de 8 -> 3 sessões.
    expect(plannedSessionsToDate(8, 3, '2026-06-15', agora)).toBe(3)
    // 2 semanas fechadas -> 6.
    expect(plannedSessionsToDate(8, 3, '2026-06-10', agora)).toBe(6)
    // Plano de 4 semanas iniciado há 20 semanas: limita ao total do plano.
    expect(plannedSessionsToDate(4, 3, '2026-02-01', agora)).toBe(12)
  })

  it('aceita timestamp completo além de data pura', () => {
    expect(completedWeeks('2026-06-10T08:30:00Z', agora)).toBe(2)
  })
})

describe('exerciseProgression', () => {
  const history: SetHistoryPoint[] = [
    // supino, sessão 1: melhor série 100x5 -> e1RM 116.67
    { exerciseId: 'sup', performedAt: '2026-01-01', weightKg: 90, reps: 8, rir: 3 },
    { exerciseId: 'sup', performedAt: '2026-01-01', weightKg: 100, reps: 5, rir: 1 },
    // supino, sessão 2: 105x5 -> 122.5
    { exerciseId: 'sup', performedAt: '2026-01-08', weightKg: 105, reps: 5, rir: 1 },
    // agacho, uma sessão
    { exerciseId: 'agacho', performedAt: '2026-01-02', weightKg: 140, reps: 5, rir: 2 },
    // série sem carga/reps é ignorada
    { exerciseId: 'abdominal', performedAt: '2026-01-02', weightKg: null, reps: 20, rir: null },
  ]

  it('agrupa por exercício e guarda o melhor e1RM por dia', () => {
    const prog = exerciseProgression(history)
    const sup = prog.find((p) => p.exerciseId === 'sup')!
    expect(sup.points).toHaveLength(2)
    expect(sup.points[0].e1rm).toBeCloseTo(116.67, 1) // 100x5 > 90x8 no dia 1
    expect(sup.points[1].e1rm).toBeCloseTo(122.5, 1)
    expect(sup.latestE1rm).toBeCloseTo(122.5, 1)
    expect(sup.bestE1rm).toBeCloseTo(122.5, 1)
    expect(sup.sessions).toBe(2)
  })

  it('ignora séries sem carga ou reps e ordena por nº de sessões', () => {
    const prog = exerciseProgression(history)
    expect(prog.map((p) => p.exerciseId)).not.toContain('abdominal')
    expect(prog[0].exerciseId).toBe('sup') // 2 sessões antes do agacho (1)
  })
})

describe('suggestedPlanWeek — a semana vem do histórico, não do relógio', () => {
  // Sessões sempre do mais recente para o mais antigo, como as telas recebem.
  const log = (performed_at: string, week_number: number | null) => ({ performed_at, week_number })

  it('plano sem nenhuma sessão começa na semana 1', () => {
    expect(suggestedPlanWeek({ weeks: 8, sessionsPerWeek: 3, logs: [] })).toEqual({
      week: 1,
      basis: 'first',
      lastLoggedWeek: null,
      sessionsInCurrentPass: 0,
      sessionsPerWeek: 3,
    })
  })

  it('quem recebeu o plano em janeiro e começou em março também começa na semana 1', () => {
    // é o caso que o calendário errava: currentWeek diria semana 9
    const s = suggestedPlanWeek({ weeks: 8, sessionsPerWeek: 3, logs: [] })
    expect(s.week).toBe(1)
  })

  it('continua na semana do último treino enquanto ela não fecha', () => {
    const s = suggestedPlanWeek({
      weeks: 8,
      sessionsPerWeek: 3,
      logs: [log('2026-06-24', 2), log('2026-06-22', 2)],
    })
    expect(s).toMatchObject({ week: 2, basis: 'continue', sessionsInCurrentPass: 2 })
  })

  it('avança quando a semana fecha', () => {
    const s = suggestedPlanWeek({
      weeks: 8,
      sessionsPerWeek: 3,
      logs: [log('2026-06-24', 2), log('2026-06-22', 2), log('2026-06-20', 2)],
    })
    expect(s).toMatchObject({ week: 3, basis: 'advance', lastLoggedWeek: 2, sessionsInCurrentPass: 3 })
  })

  it('faltar uma semana não pula semana do mesociclo', () => {
    // três semanas sem treinar e ele volta: continua na 2, não na 5
    const s = suggestedPlanWeek({
      weeks: 8,
      sessionsPerWeek: 3,
      logs: [log('2026-06-01', 2), log('2026-05-30', 2)],
    })
    expect(s).toMatchObject({ week: 2, basis: 'continue' })
  })

  it('quem retrocedeu conta a passada nova, não a antiga', () => {
    // fez a semana 2 inteira, entrou na 3, voltou para a 2: a semana 2
    // recomeça do zero — somar as duas passadas mandaria ele para a 3 já na
    // primeira sessão da repetição
    const s = suggestedPlanWeek({
      weeks: 8,
      sessionsPerWeek: 3,
      logs: [
        log('2026-06-24', 2),
        log('2026-06-17', 3),
        log('2026-06-15', 3),
        log('2026-06-13', 3),
        log('2026-06-10', 2),
        log('2026-06-08', 2),
        log('2026-06-06', 2),
      ],
    })
    expect(s).toMatchObject({ week: 2, basis: 'continue', sessionsInCurrentPass: 1 })
  })

  it('a última semana fechada não vira semana 9 de 8', () => {
    const s = suggestedPlanWeek({
      weeks: 8,
      sessionsPerWeek: 2,
      logs: [log('2026-06-24', 8), log('2026-06-22', 8)],
    })
    expect(s).toMatchObject({ week: 8, basis: 'end' })
  })

  it('sessão sem semana anotada é ignorada, e não interrompe a passada', () => {
    const s = suggestedPlanWeek({
      weeks: 8,
      sessionsPerWeek: 3,
      logs: [log('2026-06-24', null), log('2026-06-22', 2), log('2026-06-20', 2)],
    })
    expect(s).toMatchObject({ week: 2, basis: 'continue', sessionsInCurrentPass: 2 })
  })

  it('histórico só com sessões sem semana equivale a histórico vazio', () => {
    const s = suggestedPlanWeek({
      weeks: 8,
      sessionsPerWeek: 3,
      logs: [log('2026-06-24', null), log('2026-06-22', null)],
    })
    expect(s).toMatchObject({ week: 1, basis: 'first' })
  })

  it('reordena por data quando a lista chega fora de ordem', () => {
    const s = suggestedPlanWeek({
      weeks: 8,
      sessionsPerWeek: 3,
      logs: [log('2026-06-10', 2), log('2026-06-24', 3), log('2026-06-12', 2)],
    })
    expect(s).toMatchObject({ week: 3, lastLoggedWeek: 3, sessionsInCurrentPass: 1 })
  })

  it('data com hora não confunde a ordenação', () => {
    const s = suggestedPlanWeek({
      weeks: 8,
      sessionsPerWeek: 3,
      logs: [log('2026-06-24T22:00:00Z', 3), log('2026-06-24T08:00:00Z', 2)],
    })
    expect(s.lastLoggedWeek).toBe(3)
  })

  it('plano encolhido não oferece semana que não existe mais', () => {
    // mesociclo reeditado de 8 para 4 semanas depois de a sessão ser gravada
    const s = suggestedPlanWeek({
      weeks: 4,
      sessionsPerWeek: 3,
      logs: [log('2026-06-24', 7)],
    })
    expect(s).toMatchObject({ week: 4, basis: 'continue' })
  })

  it('sem sessões por semana conhecidas, nunca avança sozinho', () => {
    // plano sem divisões: não há como saber quando a semana fechou
    const s = suggestedPlanWeek({
      weeks: 8,
      sessionsPerWeek: 0,
      logs: [log('2026-06-24', 2), log('2026-06-22', 2)],
    })
    expect(s).toMatchObject({ week: 2, basis: 'continue' })
  })
})

describe('effectivePlanStart', () => {
  it('sem data informada, o plano começa no primeiro treino', () => {
    // o defeito antigo: a conta começava na criação do plano, então quem
    // demorou dois meses para começar já nascia com adesão arrasada
    expect(effectivePlanStart(null, '2026-03-02', '2026-01-10T12:00:00Z')).toBe('2026-03-02')
  })

  it('a data informada pelo profissional vale quando o aluno começou depois', () => {
    // faltar às semanas combinadas é falta de verdade, e a adesão deve cobrar
    expect(effectivePlanStart('2026-03-01', '2026-03-20', null)).toBe('2026-03-01')
  })

  it('treino anterior à data informada antecipa o início', () => {
    expect(effectivePlanStart('2026-03-01', '2026-02-20', null)).toBe('2026-02-20')
  })

  it('sem data e sem treino, sobra a criação do plano', () => {
    expect(effectivePlanStart(null, null, '2026-01-10T12:00:00Z')).toBe('2026-01-10T12:00:00Z')
    expect(effectivePlanStart(null, null, null)).toBeNull()
  })

  it('normaliza timestamp para data', () => {
    expect(effectivePlanStart(null, '2026-03-02T10:00:00Z', null)).toBe('2026-03-02')
  })
})
