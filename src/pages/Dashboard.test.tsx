// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Dashboard from './Dashboard'

const {
  useOrganizationMock,
  useSubjectsMock,
  usePendingIntakesMock,
  useUpcomingAppointmentsMock,
  useLastAssessmentBySubjectMock,
  useOrgActivePlansMock,
  useOrgWorkoutLogSummaryMock,
} = vi.hoisted(() => ({
  useOrganizationMock: vi.fn(),
  useSubjectsMock: vi.fn(),
  usePendingIntakesMock: vi.fn(),
  useUpcomingAppointmentsMock: vi.fn(),
  useLastAssessmentBySubjectMock: vi.fn(),
  useOrgActivePlansMock: vi.fn(),
  useOrgWorkoutLogSummaryMock: vi.fn(),
}))

vi.mock('../features/organization/context', () => ({
  useOrganization: useOrganizationMock,
}))

vi.mock('../features/subjects/hooks', () => ({
  useSubjects: useSubjectsMock,
}))

vi.mock('../features/anamnesis/intakeHooks', () => ({
  usePendingIntakes: usePendingIntakesMock,
}))

vi.mock('../features/appointments/hooks', () => ({
  useUpcomingAppointments: useUpcomingAppointmentsMock,
}))

vi.mock('../features/assessment/hooks', () => ({
  useLastAssessmentBySubject: useLastAssessmentBySubjectMock,
}))

vi.mock('../features/workout/hooks', () => ({
  useOrgActivePlans: useOrgActivePlansMock,
  useOrgWorkoutLogSummary: useOrgWorkoutLogSummaryMock,
}))

function query<T>(data: T, overrides: Record<string, unknown> = {}) {
  return {
    data,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  }
}

const subject = {
  id: 'subject-1',
  full_name: 'Ana Souza',
  is_active: true,
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-27T12:00:00.000Z'))

  useOrganizationMock.mockReturnValue({
    organization: { id: 'org-1', name: 'Estúdio Teste', subject_term: 'aluno' },
  })
  useSubjectsMock.mockReturnValue(query([subject]))
  usePendingIntakesMock.mockReturnValue(query([]))
  useUpcomingAppointmentsMock.mockReturnValue(query([]))
  useLastAssessmentBySubjectMock.mockReturnValue(query({ 'subject-1': '2026-08-01' }))
  useOrgActivePlansMock.mockReturnValue(query([]))
  useOrgWorkoutLogSummaryMock.mockReturnValue(query({}))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Dashboard', () => {
  it('leva os sinais operacionais da antiga Carteira para Precisam de atenção', () => {
    useLastAssessmentBySubjectMock.mockReturnValue(
      query({ 'subject-1': '2025-01-10' })
    )
    useOrgActivePlansMock.mockReturnValue(
      query([
        {
          planId: 'plan-1',
          subjectId: 'subject-1',
          name: 'Plano força',
          weeks: 16,
          sessionsPerWeek: 3,
          startedOn: '2026-06-01',
        },
      ])
    )
    useOrgWorkoutLogSummaryMock.mockReturnValue(
      query({ 'plan-1': { count: 1, lastDate: '2026-07-01' } })
    )

    renderDashboard()

    const section = screen.getByRole('heading', { name: 'Precisam de atenção' }).closest('section')
    expect(section).not.toBeNull()
    const attention = within(section as HTMLElement)
    expect(attention.getByText('Ana Souza')).toBeTruthy()
    expect(attention.getByText('Reavaliar')).toBeTruthy()
    expect(attention.getByText('Sem treino recente')).toBeTruthy()
    expect(attention.getByText(/\d+% de adesão/)).toBeTruthy()
    expect(attention.getByRole('link', { name: /Execução/ }).getAttribute('href')).toBe(
      '/avaliados/subject-1/treinos/plan-1/execucao'
    )
  })

  it('mostra Compromissos somente com compromisso futuro e leva ao aluno', () => {
    useUpcomingAppointmentsMock.mockReturnValue(
      query([
        {
          id: 'appointment-1',
          subject_id: 'subject-1',
          subjectName: 'Ana Souza',
          title: 'Reavaliação física',
          starts_at: '2026-08-29T14:30:00.000Z',
        },
      ])
    )

    renderDashboard()

    const heading = screen.getByRole('heading', { name: 'Compromissos' })
    const card = heading.closest('[data-slot="card"]') ?? heading.parentElement?.parentElement
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByRole('link', { name: /Ana Souza/ }).getAttribute('href')).toBe(
      '/avaliados/subject-1'
    )
  })

  it('sem compromisso não exibe nenhuma chamada visual para a Agenda', () => {
    renderDashboard()

    expect(screen.queryByRole('heading', { name: 'Compromissos' })).toBeNull()
    expect(screen.queryByRole('link', { name: /agenda/i })).toBeNull()
    expect(screen.queryByLabelText('Abrir agenda completa')).toBeNull()
  })

  it('falha só de compromissos preserva o resumo principal e oferece retry isolado', () => {
    const retryAppointments = vi.fn()
    useUpcomingAppointmentsMock.mockReturnValue(
      query(undefined, { isError: true, refetch: retryAppointments })
    )

    renderDashboard()

    expect(screen.getByRole('region', { name: 'Resumo da operação' })).toBeTruthy()
    expect(screen.getByText('Alunos cadastrados')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Precisam de atenção' })).toBeTruthy()

    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('Não foi possível verificar os próximos compromissos.')).toBeTruthy()
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    expect(retryAppointments).toHaveBeenCalledTimes(1)
  })
})
