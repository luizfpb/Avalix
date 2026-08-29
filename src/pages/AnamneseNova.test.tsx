// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import AnamneseNova from './AnamneseNova'
import { emptyAnamnesis, PARQ_ITEMS } from '../features/anamnesis/spec'

// A mesma página serve criar e editar. Os hooks de dados são mockados; o que
// se testa é a orquestração: o payload salvo volta para dentro do formulário,
// salvar chama o update (não o create) e anamnese de outro avaliado na URL não
// abre para edição.

const { useAnamneseMock, createMock, updateMock } = vi.hoisted(() => ({
  useAnamneseMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
}))

vi.mock('../features/anamnesis/hooks', () => ({
  useAnamnese: (id: string | undefined) => useAnamneseMock(id),
  useCreateAnamnese: () => ({ mutateAsync: createMock, isPending: false }),
  useUpdateAnamnese: () => ({ mutateAsync: updateMock, isPending: false }),
}))

vi.mock('../features/subjects/hooks', () => ({
  useSubject: () => ({
    data: { id: 's1', full_name: 'Maria Teste', sex: 'F' },
    isPending: false,
    isError: false,
  }),
}))

vi.mock('../features/consent/hooks', () => ({
  useActiveConsent: () => ({ data: { id: 'c1' }, isPending: false, isError: false }),
}))

vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org1' }, role: 'owner' }),
}))

function answersFixture() {
  return {
    ...emptyAnamnesis(),
    parq: Object.fromEntries(PARQ_ITEMS.map((i) => [i.key, false])),
    ativo_regular: false,
    doenca_cmr_confirmada: true,
    sinais_sintomas_confirmados: true,
    ocupacao: 'Professora',
    declaracao_veracidade: true,
    consentimento_lgpd: true,
  }
}

function anamneseFixture(over: Record<string, unknown> = {}) {
  return {
    id: 'an1',
    subject_id: 's1',
    org_id: 'org1',
    assessed_at: '2026-07-01',
    spec_version: '1.1',
    payload: answersFixture(),
    liberado: true,
    nivel_encaminhamento: 'liberado',
    flag_encaminhamento: false,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    ...over,
  }
}

function renderPage(path: string) {
  // data router (createMemoryRouter), e não MemoryRouter: é o que o app usa em
  // produção e o que a guarda de saída não salva exige (useBlocker).
  return render(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/avaliados/:id/anamnese/nova', element: <AnamneseNova /> },
          { path: '/avaliados/:id/anamnese/:anamneseId/editar', element: <AnamneseNova /> },
          { path: '/avaliados/:id/anamnese/:anamneseId', element: <div>detalhe da anamnese</div> },
        ],
        { initialEntries: [path] }
      )}
    />
  )
}

beforeEach(() => {
  createMock.mockReset().mockResolvedValue({ id: 'an-nova' })
  updateMock.mockReset().mockResolvedValue({ id: 'an1' })
  useAnamneseMock.mockReset().mockReturnValue({ data: null, isPending: false, isError: false })
})
afterEach(cleanup)

describe('AnamneseNova — edição', () => {
  it('carrega as respostas salvas e salva pelo update, preservando o que não mudou', async () => {
    useAnamneseMock.mockReturnValue({ data: anamneseFixture(), isPending: false, isError: false })
    const { container } = renderPage('/avaliados/s1/anamnese/an1/editar')

    expect(screen.getByText('Editar anamnese e triagem')).toBeTruthy()
    const date = container.querySelector('input[type="date"]') as HTMLInputElement
    expect(date.value).toBe('2026-07-01')
    // campo de texto da Camada B veio do payload
    expect((screen.getByDisplayValue('Professora') as HTMLInputElement).value).toBe('Professora')

    fireEvent.change(date, { target: { value: '2026-07-10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    expect(createMock).not.toHaveBeenCalled()
    const arg = updateMock.mock.calls[0][0]
    expect(arg.assessedAt).toBe('2026-07-10')
    expect(arg.answers.ocupacao).toBe('Professora')
    expect(arg.answers.parq.cardio_dx).toBe(false)
    expect(await screen.findByText('detalhe da anamnese')).toBeTruthy()
  })

  it('mudança na triagem vai junto no salvamento', async () => {
    useAnamneseMock.mockReturnValue({ data: anamneseFixture(), isPending: false, isError: false })
    renderPage('/avaliados/s1/anamnese/an1/editar')

    // primeiro item do PAR-Q: troca o "Não" salvo por "Sim"
    const grupos = screen.getAllByRole('group', { name: 'Resposta' })
    fireEvent.click(grupos[0].querySelector('button') as HTMLButtonElement)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    expect(updateMock.mock.calls[0][0].answers.parq[PARQ_ITEMS[0].key]).toBe(true)
  })

  // Quem responde costuma estar olhando esta tela. Ver "encaminhamento
  // recomendado" surgir ao marcar um "Sim" ensina qual resposta produz qual
  // desfecho — e a próxima resposta deixa de ser honesta.
  it('o resultado da triagem não fica aberto enquanto se responde', () => {
    useAnamneseMock.mockReturnValue({
      data: anamneseFixture({
        payload: { ...answersFixture(), parq: { ...answersFixture().parq, cardio_dx: true } },
      }),
      isPending: false,
      isError: false,
    })
    renderPage('/avaliados/s1/anamnese/an1/editar')

    const resumo = screen.getByText('Ver resultado da triagem')
    const box = resumo.closest('details') as HTMLDetailsElement
    expect(box.open).toBe(false)

    // o conteúdo só é revelado por um clique deliberado de quem prescreve
    fireEvent.click(resumo)
    expect(screen.getByText('Atenção: encaminhamento recomendado')).toBeTruthy()
  })

  it('triagem incompleta mostra a pendência de preenchimento, não o desfecho', () => {
    renderPage('/avaliados/s1/anamnese/nova')

    expect(screen.getByText(/Triagem incompleta — responda todos os itens/)).toBeTruthy()
    expect(screen.queryByText('Ver resultado da triagem')).toBeNull()
    expect(screen.queryByText(/encaminhamento recomendado/)).toBeNull()
    expect(screen.queryByText(/Nível ACSM/)).toBeNull()
  })

  it('a pergunta sobre parecer médico recente entra no payload salvo', async () => {
    useAnamneseMock.mockReturnValue({ data: anamneseFixture(), isPending: false, isError: false })
    renderPage('/avaliados/s1/anamnese/an1/editar')

    const grupo = screen.getByRole('group', {
      name: 'Declara liberação médica nos últimos 12 meses?',
    })
    fireEvent.click(grupo.querySelector('button') as HTMLButtonElement)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    expect(updateMock.mock.calls[0][0].answers.liberacao_declarada).toBe(true)
  })

  it('anamnese de outro avaliado na URL não abre para edição', () => {
    useAnamneseMock.mockReturnValue({
      data: anamneseFixture({ subject_id: 's-outro' }),
      isPending: false,
      isError: false,
    })
    renderPage('/avaliados/s1/anamnese/an1/editar')

    expect(screen.getByText('Não foi possível carregar a anamnese.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull()
  })

  it('modo criar segue chamando o create, com a triagem incompleta bloqueando o envio', async () => {
    renderPage('/avaliados/s1/anamnese/nova')

    const salvar = screen.getByRole('button', { name: 'Salvar anamnese' }) as HTMLButtonElement
    expect(salvar.disabled).toBe(true)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('associa os campos centrais e as confirmações explícitas da A2 a nomes acessíveis', () => {
    useAnamneseMock.mockReturnValue({ data: anamneseFixture(), isPending: false, isError: false })
    renderPage('/avaliados/s1/anamnese/an1/editar')

    expect(screen.getByLabelText('Data da anamnese')).toBeTruthy()
    expect(screen.getByLabelText('Nenhuma doença diagnosticada')).toBeTruthy()
    expect(screen.getByLabelText('Nenhum sinal ou sintoma atual')).toBeTruthy()
    expect(screen.getByLabelText('Esporte/modalidade (opcional)')).toBeTruthy()
    expect(screen.getByLabelText('Experiência de treino')).toBeTruthy()
  })
})
