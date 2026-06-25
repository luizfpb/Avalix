import { describe, it, expect } from 'vitest'
import { daysSince, dueForReassessment, relativeDayLabel } from './reminders'

const now = new Date('2026-06-24T10:00:00')

describe('daysSince', () => {
  it('conta dias de calendário (positivo no passado)', () => {
    expect(daysSince('2026-06-24T23:00:00', now)).toBe(0) // hoje
    expect(daysSince('2026-06-20T00:00:00', now)).toBe(4)
    expect(daysSince('2026-06-25T00:00:00', now)).toBe(-1) // amanhã
  })
})

describe('relativeDayLabel', () => {
  it('hoje / amanhã / ontem / futuro / passado', () => {
    expect(relativeDayLabel('2026-06-24T18:00:00', now)).toBe('Hoje')
    expect(relativeDayLabel('2026-06-25T08:00:00', now)).toBe('Amanhã')
    expect(relativeDayLabel('2026-06-23T08:00:00', now)).toBe('Ontem')
    expect(relativeDayLabel('2026-06-27T08:00:00', now)).toBe('em 3 dias')
    expect(relativeDayLabel('2026-06-19T08:00:00', now)).toBe('há 5 dias')
  })
})

describe('dueForReassessment', () => {
  it('nunca avaliado -> sim; recente -> não; antigo -> sim', () => {
    expect(dueForReassessment(null, now)).toBe(true)
    expect(dueForReassessment('2026-06-01', now)).toBe(false) // 23 dias
    expect(dueForReassessment('2026-01-01', now)).toBe(true) // > 90 dias
  })
  it('respeita limite custom', () => {
    expect(dueForReassessment('2026-06-01', now, 14)).toBe(true) // 23 >= 14
  })
})
