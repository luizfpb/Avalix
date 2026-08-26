// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import TreinoAluno from './TreinoAluno'
import type { StudentWorkout } from '../features/workout/studentApi'

// A página do aluno é a única superfície de escrita anônima do app, e a que
// tem de funcionar dentro da academia. Estes testes fixam o que não pode
// regredir: a prescrição da SEMANA escolhida aparece (não a base), sem rede o
// treino vai para a fila em vez de se perder, e o registro sai numerado por
// exercício.

const {
  getWorkoutMock,
  submitMock,
  enqueueMock,
  resolveTokenMock,
  readQueueMock,
  readDraftMock,
} = vi.hoisted(() => ({
  getWorkoutMock: vi.fn(),
  submitMock: vi.fn(),
  enqueueMock: vi.fn(),
  resolveTokenMock: vi.fn(),
  readQueueMock: vi.fn(),
  readDraftMock: vi.fn(),
}))

vi.mock('../features/workout/studentApi', async (original) => ({
  ...(await original<typeof import('../features/workout/studentApi')>()),
  getWorkoutForLink: (t: string) => getWorkoutMock(t),
  getHistoryForLink: vi.fn(async () => []),
  getPlanForLink: vi.fn(async () => null),
  submitSession: (input: unknown) => submitMock(input),
}))

vi.mock('../features/workout/studentStore', async (original) => ({
  ...(await original<typeof import('../features/workout/studentStore')>()),
  readCachedWorkout: vi.fn(async () => null),
  writeCachedWorkout: vi.fn(async () => {}),
  readCachedHistory: vi.fn(async () => null),
  writeCachedHistory: vi.fn(async () => {}),
  readCachedPlan: vi.fn(async () => null),
  writeCachedPlan: vi.fn(async () => {}),
  readQueue: () => readQueueMock(),
  enqueueSession: (scope: string, session: unknown) => enqueueMock(scope, session),
  readDraft: () => readDraftMock(),
  writeDraft: vi.fn(async () => {}),
  clearDraftSession: vi.fn(async () => {}),
  requestPersistentStorage: vi.fn(async () => {}),
  forgetStudentDevice: vi.fn(async () => {}),
}))

vi.mock('../features/workout/studentSession', async (original) => ({
  ...(await original<typeof import('../features/workout/studentSession')>()),
  resolveStudentToken: () => resolveTokenMock(),
  studentScope: vi.fn(async () => 'escopo-de-teste'),
  flushQueue: vi.fn(async () => ({ sent: 0, pending: 0, rejected: [] })),
}))

const TOKEN = 'C'.repeat(43)

function pacote(over: Partial<StudentWorkout> = {}): StudentWorkout {
  return {
    org_name: 'Estúdio Teste',
    subject_first_name: 'Marta',
    plan: {
      id: 'p1',
      name: 'Mesociclo 2',
      goal: 'hypertrophy',
      weeks: 8,
      starts_on: null,
      notes: null,
      status: 'active',
      weekly_schedule: ['A'],
    },
    days: [{ id: 'd1', label: 'A', name: 'Superiores', position: 0 }],
    exercises: [
      {
        id: 'we1',
        day_id: 'd1',
        exercise_id: 'x1',
        name: 'Supino reto',
        position: 0,
        sets: 3,
        reps: '8-12',
        rir: 2,
        rest_seconds: 90,
        tempo: null,
        notes: null,
      },
    ],
    weeks: [{ week_number: 1, label: null, is_deload: false, notes: null }],
    overrides: [],
    last_sets: [],
    history_plans: [],
    ...over,
  }
}

beforeEach(() => {
  resolveTokenMock.mockReturnValue(TOKEN)
  readQueueMock.mockResolvedValue([])
  readDraftMock.mockResolvedValue(null)
  getWorkoutMock.mockResolvedValue(pacote())
  submitMock.mockResolvedValue({ logId: 'log1' })
  enqueueMock.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function abrir() {
  render(<TreinoAluno />)
  await screen.findByText(/Olá, Marta/)
  return screen
}

// As linhas de série só aparecem depois da leitura do rascunho (assíncrona, do
// IndexedDB): esperar por elas é o que o aluno faz de qualquer jeito.
async function campoCarga() {
  return screen.findByLabelText(/Carga da série 1 de Supino reto/)
}

describe('TreinoAluno', () => {
  it('mostra o treino vigente com a prescrição do exercício', async () => {
    await abrir()
    expect(screen.getByText('Supino reto')).toBeTruthy()
    expect(screen.getByText(/3×8-12/)).toBeTruthy()
  })

  it('link sem treino publicado explica em vez de mostrar tela vazia', async () => {
    getWorkoutMock.mockResolvedValue(pacote({ plan: null, days: [], exercises: [] }))
    render(<TreinoAluno />)
    expect(await screen.findByText(/ainda não publicou um treino/)).toBeTruthy()
  })

  it('aplica a alteração da semana escolhida, e não a prescrição base', async () => {
    getWorkoutMock.mockResolvedValue(
      pacote({
        overrides: [
          {
            week_number: 2,
            workout_exercise_id: 'we1',
            sets: 5,
            reps: '6-10',
            rir: 1,
            rest_seconds: 120,
            is_skipped: false,
            notes: null,
          },
        ],
      })
    )
    await abrir()
    fireEvent.change(screen.getByLabelText('Semana'), { target: { value: '2' } })
    await waitFor(() => expect(screen.getByText(/5×6-10/)).toBeTruthy())
  })

  it('exercício pulado na semana aparece como não executar', async () => {
    getWorkoutMock.mockResolvedValue(
      pacote({
        overrides: [
          {
            week_number: 2,
            workout_exercise_id: 'we1',
            sets: null,
            reps: null,
            rir: null,
            rest_seconds: null,
            is_skipped: true,
            notes: null,
          },
        ],
      })
    )
    await abrir()
    fireEvent.change(screen.getByLabelText('Semana'), { target: { value: '2' } })
    await waitFor(() => expect(screen.getByText(/não executar/i)).toBeTruthy())
  })

  it('registra a sessão com as séries numeradas por exercício', async () => {
    await abrir()
    fireEvent.change(await campoCarga(), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText(/Repetições da série 1 de Supino reto/), {
      target: { value: '10' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar treino' }))

    await waitFor(() => expect(submitMock).toHaveBeenCalled())
    const enviado = submitMock.mock.calls[0][0]
    expect(enviado.sets).toEqual([
      { exercise_id: 'x1', set_number: 1, weight_kg: 40, reps: 10, rir: null },
    ])
    expect(enviado.dayLabel).toBe('A')
    expect(await screen.findByText(/Treino registrado/)).toBeTruthy()
  })

  it('sem internet, guarda o treino na fila em vez de perder', async () => {
    submitMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await abrir()
    fireEvent.change(await campoCarga(), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText(/Repetições da série 1 de Supino reto/), {
      target: { value: '10' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar treino' }))

    await waitFor(() => expect(enqueueMock).toHaveBeenCalled())
    const [, sessao] = enqueueMock.mock.calls[0]
    expect(sessao.sets).toHaveLength(1)
    // o client_ref é o que impede a fila de virar sessão duplicada ao subir
    expect(sessao.clientRef).toBeTruthy()
    expect(await screen.findByText(/salvo no aparelho/i)).toBeTruthy()
  })

  it('recusa do servidor não vira "salvo": o aluno precisa saber', async () => {
    submitMock.mockRejectedValue({ message: 'limite de sessoes para esta data' })
    await abrir()
    fireEvent.change(await campoCarga(), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar treino' }))

    await waitFor(() => expect(screen.getByText(/limite de sessoes/)).toBeTruthy())
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('salvar sem marcar nada avisa em vez de mandar sessão vazia', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar treino' }))
    await waitFor(() => expect(screen.getByText(/ao menos uma série/i)).toBeTruthy())
    expect(submitMock).not.toHaveBeenCalled()
  })

  it('link inválido não mostra treino nenhum', async () => {
    getWorkoutMock.mockResolvedValue(null)
    render(<TreinoAluno />)
    expect(await screen.findByText(/Link inválido ou expirado/)).toBeTruthy()
  })

  it('avisa que o registro é visível ao profissional', async () => {
    await abrir()
    expect(screen.getByText(/visível para o profissional/i)).toBeTruthy()
  })
})
