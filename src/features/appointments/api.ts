import { supabase } from '../../lib/supabase'
import type { Database } from '../../lib/database.types'

export type AppointmentRow = Database['public']['Tables']['appointments']['Row']
export type AppointmentWithSubject = AppointmentRow & { subjectName: string }

export type CreateAppointmentInput = {
  orgId: string
  subjectId: string
  title: string
  startsAt: string // ISO
  durationMin: number
  location: string | null
  notes: string | null
}

// Agenda da org com o nome do avaliado (via join), ordenada por horário. RLS já
// restringe; o filtro por org usa o índice e deixa explícito.
export async function listAppointments(orgId: string): Promise<AppointmentWithSubject[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, subjects!inner(full_name)')
    .eq('org_id', orgId)
    .order('starts_at', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<
    AppointmentRow & { subjects: { full_name: string } | { full_name: string }[] }
  >
  return rows.map((r) => {
    const { subjects: _subjects, ...appt } = r
    const s = Array.isArray(r.subjects) ? r.subjects[0] : r.subjects
    return { ...(appt as AppointmentRow), subjectName: s?.full_name ?? '' }
  })
}

// evaluator_id é omitido: default auth.uid() assume e o trigger check_evaluator
// valida; org_id é recopiado do subject pelo trigger b1.
export async function createAppointment(input: CreateAppointmentInput): Promise<AppointmentRow> {
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      org_id: input.orgId,
      subject_id: input.subjectId,
      title: input.title,
      starts_at: input.startsAt,
      duration_min: input.durationMin,
      location: input.location,
      notes: input.notes,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteAppointment(id: string): Promise<void> {
  const { error } = await supabase.from('appointments').delete().eq('id', id)
  if (error) throw error
}
