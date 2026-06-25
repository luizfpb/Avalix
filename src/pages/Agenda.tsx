import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarPlus, Download, Trash2 } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import { useSubjects } from '../features/subjects/hooks'
import {
  useAppointments,
  useCreateAppointment,
  useDeleteAppointment,
} from '../features/appointments/hooks'
import type { AppointmentWithSubject } from '../features/appointments/api'
import {
  googleCalendarUrl,
  icsContent,
  type CalendarEvent,
} from '../features/appointments/calendar'
import { downloadBlob } from '../features/reports/download'
import { relativeDayLabel } from '../lib/reminders'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const controlClass =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function defaultLocal(): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function toEvent(a: AppointmentWithSubject): CalendarEvent {
  const details = [a.subjectName ? `Avaliado: ${a.subjectName}` : '', a.notes ?? '']
    .filter(Boolean)
    .join('\n')
  return {
    title: a.title,
    startsAt: a.starts_at,
    durationMin: a.duration_min,
    location: a.location ?? undefined,
    details: details || undefined,
  }
}

export default function Agenda() {
  const { organization } = useOrganization()
  const orgId = organization?.id
  const [params] = useSearchParams()
  const subjectsQuery = useSubjects(orgId)
  const apptsQuery = useAppointments(orgId)
  const createMut = useCreateAppointment(orgId)
  const deleteMut = useDeleteAppointment(orgId)

  const [subjectId, setSubjectId] = useState(params.get('subject') ?? '')
  const [when, setWhen] = useState(defaultLocal())
  const [duration, setDuration] = useState('60')
  const [title, setTitle] = useState('Avaliação física')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)

  const { upcoming, past } = useMemo(() => {
    const all = apptsQuery.data ?? []
    const now = Date.now()
    const up: AppointmentWithSubject[] = []
    const pa: AppointmentWithSubject[] = []
    for (const a of all) {
      if (new Date(a.starts_at).getTime() >= now) up.push(a)
      else pa.push(a)
    }
    pa.reverse() // passados: mais recente primeiro
    return { upcoming: up, past: pa }
  }, [apptsQuery.data])

  async function create() {
    setError(null)
    if (!orgId) return setError('Organização não carregada.')
    if (!subjectId) return setError('Escolha o avaliado.')
    if (!when) return setError('Escolha a data e hora.')
    const startsAt = new Date(when)
    if (Number.isNaN(startsAt.getTime())) return setError('Data/hora inválida.')
    const dur = Number(duration)
    if (!(dur >= 5 && dur <= 1440)) return setError('Duração entre 5 e 1440 minutos.')
    try {
      await createMut.mutateAsync({
        orgId,
        subjectId,
        title: title.trim() || 'Avaliação física',
        startsAt: startsAt.toISOString(),
        durationMin: dur,
        location: location.trim() || null,
        notes: notes.trim() || null,
      })
      setNotes('')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function downloadIcs(a: AppointmentWithSubject) {
    const ics = icsContent(toEvent(a), `${a.id}@avalix`)
    downloadBlob(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), `avaliacao-${a.id.slice(0, 8)}.ics`)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Agenda</h1>
        <p className="text-sm text-muted-foreground">
          Marque sessões de avaliação e adicione ao seu Google Agenda, Apple ou Outlook.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo agendamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Avaliado</Label>
              <select
                className={controlClass}
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
              >
                <option value="">Selecione</option>
                {(subjectsQuery.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data e hora</Label>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Duração (min)</Label>
              <Input
                type="number"
                min={5}
                max={1440}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Local (opcional)</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Observações (opcional)</Label>
              <textarea
                rows={2}
                className={controlClass}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button size="sm" onClick={create} disabled={createMut.isPending}>
            <CalendarPlus /> {createMut.isPending ? 'Agendando...' : 'Agendar'}
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Próximos</h2>
        {apptsQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum agendamento futuro.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((a) => (
              <AppointmentItem
                key={a.id}
                appt={a}
                onDelete={() => {
                  if (window.confirm('Excluir este agendamento?')) deleteMut.mutate(a.id)
                }}
                onIcs={() => downloadIcs(a)}
                deleting={deleteMut.isPending}
              />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 ? (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setShowPast((s) => !s)}
            className="text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            {showPast ? 'Ocultar anteriores' : `Ver anteriores (${past.length})`}
          </button>
          {showPast ? (
            <ul className="space-y-2">
              {past.map((a) => (
                <AppointmentItem
                  key={a.id}
                  appt={a}
                  onDelete={() => {
                    if (window.confirm('Excluir este agendamento?')) deleteMut.mutate(a.id)
                  }}
                  onIcs={() => downloadIcs(a)}
                  deleting={deleteMut.isPending}
                  muted
                />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

function AppointmentItem({
  appt,
  onDelete,
  onIcs,
  deleting,
  muted,
}: {
  appt: AppointmentWithSubject
  onDelete: () => void
  onIcs: () => void
  deleting: boolean
  muted?: boolean
}) {
  return (
    <li className={`rounded-md border bg-card p-3 ${muted ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            {fmtDateTime(appt.starts_at)}
            {(() => {
              const rel = relativeDayLabel(appt.starts_at, new Date())
              const soon = rel === 'Hoje' || rel === 'Amanhã'
              return (
                <span
                  className={`text-xs ${soon ? 'font-semibold text-primary' : 'font-normal text-muted-foreground'}`}
                >
                  · {rel}
                </span>
              )
            })()}
          </p>
          <p className="truncate text-sm">
            {appt.subjectName}
            <span className="text-muted-foreground"> · {appt.title}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {appt.duration_min} min{appt.location ? ` · ${appt.location}` : ''}
          </p>
        </div>
        <button onClick={onDelete} disabled={deleting} className="shrink-0 text-destructive" title="Excluir">
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <a
          href={googleCalendarUrl(toEvent(appt))}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Adicionar ao Google Agenda
        </a>
        <button onClick={onIcs} className="inline-flex items-center gap-1 text-primary hover:underline">
          <Download className="size-3.5" /> .ics (Apple/Outlook)
        </button>
      </div>
    </li>
  )
}
