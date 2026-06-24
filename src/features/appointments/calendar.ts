// Geração de evento de calendário SEM OAuth: link "Adicionar ao Google Agenda"
// (abre o Google pré-preenchido) e conteúdo .ics (Apple/Outlook/qualquer um).
// Puro e testável; nenhuma credencial, nenhum token guardado.

export type CalendarEvent = {
  title: string
  startsAt: string // ISO
  durationMin: number
  details?: string
  location?: string
}

// formato de calendário em UTC compacto: 2026-06-24T13:30:00.000Z -> 20260624T133000Z
function toCalUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function endIso(startIso: string, durationMin: number): string {
  return new Date(new Date(startIso).getTime() + durationMin * 60000).toISOString()
}

export function googleCalendarUrl(ev: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${toCalUtc(ev.startsAt)}/${toCalUtc(endIso(ev.startsAt, ev.durationMin))}`,
  })
  if (ev.details) params.set('details', ev.details)
  if (ev.location) params.set('location', ev.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function icsContent(ev: CalendarEvent, uid: string): string {
  const esc = (s: string) => s.replace(/([\\,;])/g, '\\$1').replace(/\n/g, '\\n')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Avalix//Agenda//PT',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toCalUtc(new Date().toISOString())}`,
    `DTSTART:${toCalUtc(ev.startsAt)}`,
    `DTEND:${toCalUtc(endIso(ev.startsAt, ev.durationMin))}`,
    `SUMMARY:${esc(ev.title)}`,
  ]
  if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`)
  if (ev.details) lines.push(`DESCRIPTION:${esc(ev.details)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}
