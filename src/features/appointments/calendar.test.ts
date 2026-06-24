import { describe, it, expect } from 'vitest'
import { googleCalendarUrl, icsContent, type CalendarEvent } from './calendar'

const ev: CalendarEvent = {
  title: 'Avaliação física',
  startsAt: '2026-06-24T13:30:00.000Z',
  durationMin: 60,
  location: 'Studio X',
  details: 'Aluno: Fulano',
}

describe('googleCalendarUrl', () => {
  it('monta o link TEMPLATE com início/fim (fim = início + duração)', () => {
    const url = googleCalendarUrl(ev)
    expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(true)
    expect(url).toContain('action=TEMPLATE')
    expect(url).toContain('dates=20260624T133000Z%2F20260624T143000Z')
    expect(url).toContain('text=Avalia') // título codificado
    expect(url).toContain('location=Studio')
  })
})

describe('icsContent', () => {
  const ics = icsContent(ev, 'appt-1@avalix')
  it('é um VEVENT válido com início, fim e título', () => {
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('UID:appt-1@avalix')
    expect(ics).toContain('DTSTART:20260624T133000Z')
    expect(ics).toContain('DTEND:20260624T143000Z')
    expect(ics).toContain('SUMMARY:Avaliação física')
    expect(ics).toContain('LOCATION:Studio X')
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
  })
  it('usa CRLF entre as linhas (exigência do formato)', () => {
    expect(ics.includes('\r\n')).toBe(true)
  })
})
