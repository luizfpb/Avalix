// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import TreinoAluno from './TreinoAluno'
import { STUDENT_TOKEN_KEY } from '../features/workout/studentStore'

// Arquivo próprio porque o token é capturado uma vez por carga do módulo: aqui
// a página nasce num aparelho sem link nenhum. É o caso do app instalado na
// tela de início do iPhone, que não enxerga o armazenamento do Safari, e do
// Safari que apagou os dados do site depois de sete dias sem uso.

const mocks = vi.hoisted(() => ({
  getWorkout: vi.fn(),
  scope: vi.fn(async () => 'escopo-de-teste'),
}))

vi.mock('../features/workout/studentSession', async (original) => ({
  ...(await original<typeof import('../features/workout/studentSession')>()),
  resolveStudentToken: () => null,
  studentScope: mocks.scope,
  flushQueue: vi.fn(async () => ({ sent: 0, pending: 0, rejected: [] })),
}))

vi.mock('../features/workout/studentApi', async (original) => ({
  ...(await original<typeof import('../features/workout/studentApi')>()),
  getWorkoutForLink: mocks.getWorkout,
}))

vi.mock('../features/workout/studentStore', async (original) => ({
  ...(await original<typeof import('../features/workout/studentStore')>()),
  captureStudentStorageAccess: vi.fn(async () => ({ generation: '', localGeneration: 0, active: true })),
  readCachedWorkout: vi.fn(async () => null),
  writeCachedWorkout: vi.fn(async () => {}),
  readQueue: vi.fn(async () => []),
  requestPersistentStorage: vi.fn(async () => {}),
}))

const TOKEN = 'C'.repeat(43)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
})

describe('aparelho sem o link do treino', () => {
  it('não acusa link inválido e aceita o link colado da mensagem do treinador', async () => {
    mocks.getWorkout.mockReturnValue(new Promise(() => {}))
    render(<TreinoAluno />)

    expect(screen.getByText('Abra o seu treino')).toBeTruthy()
    expect(screen.queryByText(/Link inválido ou expirado/)).toBeNull()

    const campo = screen.getByLabelText('Link do treino')
    fireEvent.change(campo, { target: { value: 'Seu treino: https://avalixfit.com.br/a#' + TOKEN } })
    fireEvent.click(screen.getByRole('button', { name: 'Abrir treino' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Não encontramos o link do treino/)
    expect(mocks.getWorkout).not.toHaveBeenCalled()

    fireEvent.change(campo, { target: { value: `Oi! Seu treino: https://avalixfit.com.br/t#${TOKEN} até mais` } })
    fireEvent.click(screen.getByRole('button', { name: 'Abrir treino' }))

    expect(await screen.findByText('Carregando seu treino...')).toBeTruthy()
    expect(localStorage.getItem(STUDENT_TOKEN_KEY)).toBe(TOKEN)
    await vi.waitFor(() => expect(mocks.getWorkout).toHaveBeenCalledWith(TOKEN))
  })
})
