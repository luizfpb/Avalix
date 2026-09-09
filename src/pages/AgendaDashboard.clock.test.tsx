// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Agenda from './Agenda'
import Dashboard from './Dashboard'

const { appointments, upcoming } = vi.hoisted(() => ({ appointments: vi.fn(), upcoming: vi.fn() }))
const subject = { id: 's1', full_name: 'Mariana de Teste', is_active: true }
const subjects = [subject]
const query = (data: unknown) => ({ data, isPending: false, isError: false })
vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org-audit', name: 'Estúdio Audit', subject_term: 'aluno' } }),
}))
vi.mock('../features/subjects/hooks', () => ({ useSubjects: () => query(subjects) }))
vi.mock('../features/appointments/hooks', () => ({
  useAppointments: appointments, useUpcomingAppointments: upcoming,
  useCreateAppointment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAppointment: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../features/anamnesis/intakeHooks', () => ({ usePendingIntakes: () => query([]) }))
vi.mock('../features/assessment/hooks', () => ({ useLastAssessmentBySubject: () => query({ s1: '2026-09-01' }) }))
vi.mock('../features/workout/hooks', () => ({ useOrgActivePlans: () => query([]), useOrgWorkoutLogSummary: () => query({}) }))
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 8, 10, 0))
  appointments.mockReturnValue(query([{
    id: 'a1', subject_id: 's1', subjectName: subject.full_name, title: 'Sessão às 10:05',
    starts_at: new Date(2026, 8, 8, 10, 5).toISOString(), duration_min: 10,
  }]))
  upcoming.mockReturnValue(query([]))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

it('atualiza o dia e a janela ao retomar o Dashboard no dia seguinte', () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>)
  const previousWindow = upcoming.mock.calls.at(-1)!.slice(1)
  vi.setSystemTime(new Date(2026, 8, 9, 10, 0))
  act(() => window.dispatchEvent(new Event('focus')))
  expect(screen.getByText(/Visão de hoje/).textContent).toContain('09 de setembro')
  expect(upcoming.mock.calls.at(-1)!.slice(1)).not.toEqual(previousWindow)
})

it('reclassifica compromissos sem depender de novos dados da query', () => {
  render(<MemoryRouter><Agenda /></MemoryRouter>)
  act(() => vi.advanceTimersByTime(20 * 60_000))
  const section = screen.getByRole('heading', { name: 'Próximos' }).closest('section')!
  expect(within(section).queryByText(/Sessão às 10:05/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Ver anteriores/ }))
  expect(screen.getByText(/Sessão às 10:05/)).toBeTruthy()
})

it('a passagem de um minuto não cria outra janela de consulta no mesmo dia', () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>)
  const previousWindow = upcoming.mock.calls.at(-1)!.slice(1)
  act(() => vi.advanceTimersByTime(60_000))
  expect(upcoming.mock.calls.at(-1)!.slice(1)).toEqual(previousWindow)
})
