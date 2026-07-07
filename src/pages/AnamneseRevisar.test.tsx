// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import AnamneseRevisar from './AnamneseRevisar'

// Fluxo crítico (v2.0): o aceite de um intake de CADASTRO cria avaliado +
// consentimento + anamnese. Os hooks de dados são mockados; o que se testa é
// a orquestração da página: revalidação com zod, chamada do aceite com o
// subject convertido, recusa em duas etapas.

const { useIntakeMock, acceptMock, rejectMock } = vi.hoisted(() => ({
  useIntakeMock: vi.fn(),
  acceptMock: vi.fn(),
  rejectMock: vi.fn(),
}))

vi.mock('../features/anamnesis/intakeHooks', () => ({
  useIntake: (id: string | undefined) => useIntakeMock(id),
  useAcceptIntake: () => ({ mutateAsync: acceptMock, isPending: false }),
  useRejectIntake: () => ({ mutateAsync: rejectMock, isPending: false }),
}))

vi.mock('../features/subjects/hooks', () => ({
  useSubjects: () => ({ data: [], isPending: false }),
}))

vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org1' }, role: 'owner' }),
}))

// o resumo da anamnese é display puro; fora do escopo deste teste
vi.mock('../features/anamnesis/AnamneseResumo', () => ({
  AnamneseResumo: () => <div data-testid="resumo" />,
}))

function intakeFixture(over: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    kind: 'cadastro_anamnese',
    status: 'submitted',
    payload: { objetivo_principal: ['saude'] },
    registration: {
      full_name: 'João Teste',
      birth_date: '1990-05-10',
      sex: 'M',
      height_cm: '',
      phone: '',
      email: '',
      notes: '',
      guardian_name: '',
      guardian_relationship: '',
    },
    signer_kind: 'titular',
    signer_name: 'João Teste',
    consent_version: '1.0',
    submitted_at: '2026-07-01T10:00:00Z',
    subject_id: null,
    resulting_subject_id: null,
    resulting_anamnese_id: null,
    ...over,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/avaliados/intake/i1']}>
      <Routes>
        <Route path="/avaliados/intake/:intakeId" element={<AnamneseRevisar />} />
        <Route path="/avaliados/:id/anamnese/:anamneseId" element={<div>anamnese criada</div>} />
        <Route path="/dashboard" element={<div>dashboard</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  acceptMock.mockReset().mockResolvedValue({ subjectId: 's9', anamneseId: 'a9' })
  rejectMock.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('AnamneseRevisar — aceite de cadastro', () => {
  it('aceita: revalida o cadastro e chama a RPC com o subject convertido', async () => {
    useIntakeMock.mockReturnValue({ data: intakeFixture(), isPending: false, isError: false })
    renderPage()

    // nome aparece no cadastro e no consentimento
    expect(screen.getAllByText('João Teste').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Aceitar e cadastrar/ }))

    await waitFor(() => expect(acceptMock).toHaveBeenCalledTimes(1))
    const arg = acceptMock.mock.calls[0][0]
    expect(arg.intakeId).toBe('i1')
    expect(arg.subject).toMatchObject({
      org_id: 'org1',
      full_name: 'João Teste',
      birth_date: '1990-05-10',
      sex: 'M',
    })
    // navegou pra anamnese recém-criada
    expect(await screen.findByText('anamnese criada')).toBeTruthy()
  })

  it('cadastro inválido (sem sexo): mostra erro e NÃO chama o aceite', async () => {
    useIntakeMock.mockReturnValue({
      data: intakeFixture({
        registration: { full_name: 'João Teste', birth_date: '1990-05-10', sex: '' },
      }),
      isPending: false,
      isError: false,
    })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /Aceitar e cadastrar/ }))
    expect(await screen.findByText(/incompleto ou inválido/)).toBeTruthy()
    expect(acceptMock).not.toHaveBeenCalled()
  })

  it('recusa exige confirmação em duas etapas', async () => {
    useIntakeMock.mockReturnValue({ data: intakeFixture(), isPending: false, isError: false })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Recusar' }))
    expect(rejectMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar recusa/ }))
    await waitFor(() => expect(rejectMock).toHaveBeenCalledWith('i1'))
  })

  it('intake já aceito não mostra os botões de revisão', () => {
    useIntakeMock.mockReturnValue({
      data: intakeFixture({ status: 'accepted', resulting_anamnese_id: 'a1', resulting_subject_id: 's1' }),
      isPending: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText(/já foi aceita/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Aceitar/ })).toBeNull()
  })
})
