// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Dashboard from './Dashboard'

const {
  useAuthMock,
  useOrganizationMock,
  useSubjectsMock,
  usePendingIntakesMock,
  useUpcomingAppointmentsMock,
  useLastAssessmentBySubjectMock,
  useOrgActivePlansMock,
  useOrgWorkoutLogSummaryMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useOrganizationMock: vi.fn(),
  useSubjectsMock: vi.fn(),
  usePendingIntakesMock: vi.fn(),
  useUpcomingAppointmentsMock: vi.fn(),
  useLastAssessmentBySubjectMock: vi.fn(),
  useOrgActivePlansMock: vi.fn(),
  useOrgWorkoutLogSummaryMock: vi.fn(),
}))

vi.mock('../features/auth/context', () => ({
  useAuth: useAuthMock,
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

  useAuthMock.mockReturnValue({ user: { id: 'user-1', factors: [] } })
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
          startsOn: '2026-06-01',
          createdOn: '2026-05-20T10:00:00Z',
        },
      ])
    )
    useOrgWorkoutLogSummaryMock.mockReturnValue(
      query({ 'plan-1': { count: 1, lastDate: '2026-07-01', firstDate: '2026-06-02' } })
    )

    renderDashboard()

    const section = screen.getByRole('heading', { name: 'Precisam de atenção' }).closest('section')
    expect(section).not.toBeNull()
    const attention = within(
      within(section as HTMLElement).getByRole('list', { name: 'Alunos que precisam de atenção' })
    )
    expect(attention.getByText('Ana Souza')).toBeTruthy()
    expect(attention.getByText('Reavaliar')).toBeTruthy()
    expect(attention.getByText('Sem treino recente')).toBeTruthy()
    expect(attention.getByText(/\d+% de adesão/)).toBeTruthy()
    expect(attention.getByRole('link', { name: /Execução/ }).getAttribute('href')).toBe(
      '/avaliados/subject-1/treinos/plan-1/execucao'
    )
  })

  it('os números viram filtros da lista de atenção', () => {
    useSubjectsMock.mockReturnValue(
      query([subject, { id: 'subject-2', full_name: 'Bruno Lima', is_active: true }])
    )
    useLastAssessmentBySubjectMock.mockReturnValue(
      query({ 'subject-1': '2025-01-10', 'subject-2': '2025-01-10' })
    )
    useOrgActivePlansMock.mockReturnValue(
      query([
        {
          planId: 'plan-1',
          subjectId: 'subject-1',
          name: 'Plano força',
          weeks: 16,
          sessionsPerWeek: 3,
          startsOn: '2026-06-01',
          createdOn: '2026-05-20T10:00:00Z',
        },
      ])
    )
    useOrgWorkoutLogSummaryMock.mockReturnValue(
      query({ 'plan-1': { count: 1, lastDate: '2026-07-01', firstDate: '2026-06-02' } })
    )

    renderDashboard()

    const lista = () => screen.getByRole('list', { name: 'Alunos que precisam de atenção' })
    expect(within(lista()).getByText('Bruno Lima')).toBeTruthy()
    const filtro = screen.getByRole('button', { name: /Sem treino recente/ })
    expect(filtro.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(filtro)

    expect(filtro.getAttribute('aria-pressed')).toBe('true')
    expect(within(lista()).getByText('Ana Souza')).toBeTruthy()
    expect(within(lista()).queryByText('Bruno Lima')).toBeNull()
  })

  it('mostra quantos alunos estão ativos e quantos estão em dia fora da lista', () => {
    useSubjectsMock.mockReturnValue(
      query([subject, { id: 'subject-2', full_name: 'Bruno Lima', is_active: true }])
    )
    useLastAssessmentBySubjectMock.mockReturnValue(
      query({ 'subject-1': '2025-01-10', 'subject-2': '2026-08-01' })
    )

    renderDashboard()

    expect(screen.getByText(/2 alunos ativos/)).toBeTruthy()
    const lista = screen.getByRole('list', { name: 'Alunos que precisam de atenção' })
    expect(within(lista).getByText('Ana Souza')).toBeTruthy()
    expect(within(lista).queryByText('Bruno Lima')).toBeNull()
    expect(screen.getByText('O outro aluno ativo está em dia.')).toBeTruthy()
  })

  it('lembra da verificação em dois fatores só para quem ainda não ativou', () => {
    renderDashboard()
    expect(screen.getByRole('link', { name: 'Ativar em Ajustes' }).getAttribute('href')).toBe(
      '/configuracoes'
    )
    cleanup()

    useAuthMock.mockReturnValue({
      user: { id: 'user-1', factors: [{ id: 'f1', status: 'verified' }] },
    })
    renderDashboard()
    expect(screen.queryByRole('link', { name: 'Ativar em Ajustes' })).toBeNull()
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

    const heading = screen.getByRole('heading', { name: 'Próximos compromissos' })
    const card = heading.closest('[data-slot="card"]') ?? heading.parentElement?.parentElement
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByRole('link', { name: /Ana Souza/ }).getAttribute('href')).toBe(
      '/avaliados/subject-1'
    )
  })

  it('sem compromisso não exibe nenhuma chamada visual para a Agenda', () => {
    renderDashboard()

    expect(screen.queryByRole('heading', { name: 'Próximos compromissos' })).toBeNull()
    expect(screen.queryByRole('link', { name: /agenda/i })).toBeNull()
    expect(screen.queryByLabelText('Abrir agenda completa')).toBeNull()
  })

  it('falha só de compromissos preserva o resumo principal e oferece retry isolado', () => {
    const retryAppointments = vi.fn()
    useUpcomingAppointmentsMock.mockReturnValue(
      query(undefined, { isError: true, refetch: retryAppointments })
    )

    renderDashboard()

    expect(screen.getByRole('heading', { name: 'Precisam de atenção' })).toBeTruthy()

    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('Não foi possível verificar os próximos compromissos.')).toBeTruthy()
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    expect(retryAppointments).toHaveBeenCalledTimes(1)
  })
})
