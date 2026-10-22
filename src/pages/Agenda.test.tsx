// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Agenda from './Agenda'

const { updateMock, createMock } = vi.hoisted(() => ({
  updateMock: vi.fn(),
  createMock: vi.fn(),
}))

vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org-1', name: 'Estúdio', subject_term: 'aluno' }, role: 'owner' }),
}))

vi.mock('../features/subjects/hooks', () => ({
  useSubjects: () => ({
    isPending: false,
    isError: false,
    data: [{ id: 's-1', full_name: 'Ana Souza' }],
  }),
}))

const NOW = Date.now()
const APPOINTMENTS = [
  {
    // começou há 10 minutos e dura uma hora: ainda está acontecendo
    id: 'a-agora',
    org_id: 'org-1',
    subject_id: 's-1',
    subjectName: 'Ana Souza',
    title: 'Reavaliação',
    starts_at: new Date(NOW - 10 * 60_000).toISOString(),
    duration_min: 60,
    location: 'Sala 2',
    notes: 'Trazer exames',
  },
  {
    id: 'a-passado',
    org_id: 'org-1',
    subject_id: 's-1',
    subjectName: 'Ana Souza',
    title: 'Avaliação física',
    starts_at: new Date(NOW - 3 * 86_400_000).toISOString(),
    duration_min: 60,
    location: null,
    notes: null,
  },
]

vi.mock('../features/appointments/hooks', () => ({
  useAppointments: () => ({ isPending: false, isError: false, data: APPOINTMENTS }),
  useCreateAppointment: () => ({ mutateAsync: createMock, isPending: false }),
  useUpdateAppointment: () => ({ mutateAsync: updateMock, isPending: false }),
  useDeleteAppointment: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/agenda']}>
      <Agenda />
    </MemoryRouter>
  )
}

describe('Agenda', () => {
  it('compromisso em andamento fica em Próximos, não em anteriores', () => {
    renderPage()
    const proximos = screen.getByRole('heading', { name: 'Próximos' }).parentElement!
    expect(within(proximos).getByText(/Reavaliação/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver anteriores (1)' })).toBeTruthy()
  })

  it('o evento do Google Agenda usa o termo da organização', () => {
    renderPage()
    const href = screen.getAllByRole('link', { name: 'Adicionar ao Google Agenda' })[0].getAttribute('href')!
    expect(new URL(href).searchParams.get('details')).toContain('Aluno: Ana Souza')
  })

  it('edita um compromisso sem trocar o aluno', async () => {
    window.scrollTo = vi.fn()
    updateMock.mockResolvedValue({})
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Editar agendamento de Ana Souza' }))

    expect(screen.getByText('Editar agendamento')).toBeTruthy()
    expect((screen.getByLabelText('Aluno') as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Reavaliação')
    expect((screen.getByLabelText('Local (opcional)') as HTMLInputElement).value).toBe('Sala 2')

    fireEvent.change(screen.getByLabelText('Duração (min)'), { target: { value: '90' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a-agora', title: 'Reavaliação', durationMin: 90, location: 'Sala 2', notes: 'Trazer exames' })
      )
    )
    expect(createMock).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('Novo agendamento')).toBeTruthy())
  })
})
