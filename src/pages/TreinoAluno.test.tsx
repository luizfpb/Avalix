// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import TreinoAluno from './TreinoAluno'
import type {
  StudentHistorySession,
  StudentPlanDetail,
  StudentWorkout,
} from '../features/workout/studentApi'

// A página do aluno é a única superfície de escrita anônima do app, e a que
// tem de funcionar dentro da academia. Estes testes fixam o que não pode
// regredir: a prescrição da SEMANA escolhida aparece (não a base), sem rede o
// treino vai para a fila em vez de se perder, e o registro sai numerado por
// exercício.

const {
  getWorkoutMock,
  getHistoryPageMock,
  getPlanMock,
  submitMock,
  enqueueMock,
  dequeueMock,
  flushQueueMock,
  resolveTokenMock,
  readQueueMock,
  readDraftMock,
  writeDraftMock,
  reserveDraftRevisionMock,
  clearDraftMock,
  readCachedWorkoutMock,
  writeCachedWorkoutMock,
  readCachedHistoryMock,
  readCachedPlanMock,
  removeCachedPlanMock,
  purgeRevokedMock,
} = vi.hoisted(() => ({
  getWorkoutMock: vi.fn(),
  getHistoryPageMock: vi.fn(),
  getPlanMock: vi.fn(),
  submitMock: vi.fn(),
  enqueueMock: vi.fn(),
  dequeueMock: vi.fn(),
  flushQueueMock: vi.fn(),
  resolveTokenMock: vi.fn(),
  readQueueMock: vi.fn(),
  readDraftMock: vi.fn(),
  writeDraftMock: vi.fn(),
  reserveDraftRevisionMock: vi.fn(),
  clearDraftMock: vi.fn(),
  readCachedWorkoutMock: vi.fn(),
  writeCachedWorkoutMock: vi.fn(),
  readCachedHistoryMock: vi.fn(),
  readCachedPlanMock: vi.fn(),
  removeCachedPlanMock: vi.fn(),
  purgeRevokedMock: vi.fn(),
}))

vi.mock('../features/workout/studentApi', async (original) => ({
  ...(await original<typeof import('../features/workout/studentApi')>()),
  getWorkoutForLink: (t: string) => getWorkoutMock(t),
  getHistoryPageForLink: (t: string, options: unknown) => getHistoryPageMock(t, options),
  getPlanForLink: (t: string, planId: string) => getPlanMock(t, planId),
  submitSession: (input: unknown) => submitMock(input),
}))

vi.mock('../features/workout/studentStore', async (original) => ({
  ...(await original<typeof import('../features/workout/studentStore')>()),
  readCachedWorkout: () => readCachedWorkoutMock(),
  writeCachedWorkout: (scope: string, data: unknown) => writeCachedWorkoutMock(scope, data),
  readCachedHistory: () => readCachedHistoryMock(),
  writeCachedHistory: vi.fn(async () => {}),
  readCachedPlan: (_scope: string, planId: string) => readCachedPlanMock(planId),
  writeCachedPlan: vi.fn(async () => {}),
  removeCachedPlan: (scope: string, planId: string) => removeCachedPlanMock(scope, planId),
  readQueue: () => readQueueMock(),
  dequeueSession: (scope: string, clientRef: string) => dequeueMock(scope, clientRef),
  enqueueSession: (scope: string, session: unknown) => enqueueMock(scope, session),
  readDraft: () => readDraftMock(),
  writeDraft: (scope: string, draft: unknown, required?: boolean) => writeDraftMock(scope, draft, required),
  reserveDraftRevision: (scope: string, draft: { revision?: number }, required?: boolean) =>
    reserveDraftRevisionMock(scope, draft, required),
  clearDraftSession: (scope: string, planId: string, dayId?: string, performedAt?: string) =>
    clearDraftMock(scope, planId, dayId, performedAt),
  requestPersistentStorage: vi.fn(async () => {}),
  forgetStudentDevice: vi.fn(async () => {}),
  purgeRevokedStudentDevice: () => purgeRevokedMock(),
}))

vi.mock('../features/workout/studentSession', async (original) => ({
  ...(await original<typeof import('../features/workout/studentSession')>()),
  resolveStudentToken: () => resolveTokenMock(),
  studentScope: vi.fn(async () => 'escopo-de-teste'),
  flushQueue: (token: string, scope: string) => flushQueueMock(token, scope),
}))

const TOKEN = 'C'.repeat(43)

function pacote(over: Partial<StudentWorkout> = {}): StudentWorkout {
  return {
    org_name: 'Estúdio Teste',
    subject_first_name: 'Marta',
    link_expires_at: '2099-08-26T12:00:00.000Z',
    current_plan_sessions: 0,
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
  writeDraftMock.mockResolvedValue(undefined)
  reserveDraftRevisionMock.mockImplementation(
    async (_scope: string, draft: { revision?: number }) => (draft.revision ?? 0) + 1
  )
  clearDraftMock.mockResolvedValue(undefined)
  readCachedWorkoutMock.mockResolvedValue(null)
  writeCachedWorkoutMock.mockResolvedValue(undefined)
  readCachedHistoryMock.mockResolvedValue(null)
  readCachedPlanMock.mockResolvedValue(null)
  removeCachedPlanMock.mockResolvedValue(undefined)
  getWorkoutMock.mockResolvedValue(pacote())
  getHistoryPageMock.mockResolvedValue({ items: [], next_cursor: null })
  getPlanMock.mockResolvedValue(null)
  submitMock.mockResolvedValue({ logId: 'log1' })
  enqueueMock.mockResolvedValue(undefined)
  dequeueMock.mockResolvedValue(undefined)
  flushQueueMock.mockResolvedValue({ sent: 0, pending: 0, rejected: [] })
  purgeRevokedMock.mockResolvedValue(undefined)
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
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
    expect(screen.getAllByLabelText(/Carga da série .* de Supino reto/)).toHaveLength(5)
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
    fireEvent.click(screen.getByRole('button', { name: 'Concluir treino' }))

    await waitFor(() => expect(submitMock).toHaveBeenCalled())
    const enviado = submitMock.mock.calls[0][0]
    expect(enviado.sets).toEqual([
      { exercise_id: 'x1', set_number: 1, weight_kg: 40, reps: 10, rir: null },
    ])
    expect(enviado.dayLabel).toBe('A')
    expect(await screen.findByText(/Treino concluído/)).toBeTruthy()
  })

  it('salva progresso e conclui a mesma sessão com client_ref estável', async () => {
    await abrir()
    const carga = await campoCarga()
    fireEvent.change(carga, { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar progresso' }))

    expect(await screen.findByText(/Progresso salvo/)).toBeTruthy()
    expect((carga as HTMLInputElement).value).toBe('40')
    const concluir = screen.getByRole('button', { name: 'Concluir treino' }) as HTMLButtonElement
    await waitFor(() => expect(concluir.disabled).toBe(false))
    fireEvent.click(concluir)
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(2))

    expect(submitMock.mock.calls[0][0].clientRef).toBe(submitMock.mock.calls[1][0].clientRef)
    expect(submitMock.mock.calls.map(([input]) => input.revision)).toEqual([1, 2])
    expect(reserveDraftRevisionMock).toHaveBeenCalledWith(
      'escopo-de-teste',
      expect.objectContaining({ revision: 0, clientRef: submitMock.mock.calls[0][0].clientRef }),
      true
    )
  })

  it('sem internet, guarda o treino na fila em vez de perder', async () => {
    submitMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await abrir()
    fireEvent.change(await campoCarga(), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText(/Repetições da série 1 de Supino reto/), {
      target: { value: '10' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Concluir treino' }))

    await waitFor(() => expect(enqueueMock).toHaveBeenCalled())
    const [, sessao] = enqueueMock.mock.calls[0]
    expect(sessao.sets).toHaveLength(1)
    // o client_ref é o que impede a fila de virar sessão duplicada ao subir
    expect(sessao.clientRef).toBeTruthy()
    expect(await screen.findByText(/salvo no aparelho/i)).toBeTruthy()
  })

  it('não confirma salvamento offline quando o armazenamento falha', async () => {
    reserveDraftRevisionMock.mockRejectedValue(new Error('Não foi possível salvar no aparelho.'))
    await abrir()
    const carga = await campoCarga()
    fireEvent.change(carga, { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar progresso' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/não foi possível salvar no aparelho/i)
    expect(screen.queryByText(/Progresso salvo no aparelho/)).toBeNull()
    expect((carga as HTMLInputElement).value).toBe('40')
    expect(submitMock).not.toHaveBeenCalled()
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('recusa do servidor não vira "salvo": o aluno precisa saber', async () => {
    submitMock.mockRejectedValue({ message: 'limite de sessoes para esta data' })
    await abrir()
    fireEvent.change(await campoCarga(), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Concluir treino' }))

    await waitFor(() => expect(screen.getByText(/limite de sessoes/)).toBeTruthy())
    // O outbox é gravado antes da rede, mas a recusa definitiva o remove para
    // não prometer sincronização futura de algo que o servidor rejeitou.
    expect(enqueueMock).toHaveBeenCalledTimes(1)
    expect(dequeueMock).toHaveBeenCalled()
  })

  it('salvar sem marcar nada avisa em vez de mandar sessão vazia', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Concluir treino' }))
    await waitFor(() => expect(screen.getByText(/ao menos uma série/i)).toBeTruthy())
    expect(submitMock).not.toHaveBeenCalled()
  })

  it('link inválido não mostra treino nenhum', async () => {
    getWorkoutMock.mockResolvedValue(null)
    render(<TreinoAluno />)
    expect(await screen.findByText(/Link inválido ou expirado/)).toBeTruthy()
    expect(purgeRevokedMock).toHaveBeenCalled()
  })

  it('não renderiza cache expirado nem cache legado sem validade', async () => {
    const expired = pacote({ link_expires_at: '2000-01-01T00:00:00.000Z' })
    readCachedWorkoutMock.mockResolvedValue({ at: '2000-01-01T00:00:00.000Z', data: expired })
    render(<TreinoAluno />)
    expect(await screen.findByText(/Link inválido ou expirado/)).toBeTruthy()
    expect(screen.queryByText('Supino reto')).toBeNull()
    cleanup()

    const legacy = { ...pacote() } as Partial<StudentWorkout>
    delete legacy.link_expires_at
    const network = deferred<StudentWorkout>()
    readCachedWorkoutMock.mockResolvedValue({
      at: '2026-08-26T10:00:00.000Z',
      data: legacy as StudentWorkout,
    })
    getWorkoutMock.mockReturnValue(network.promise)
    render(<TreinoAluno />)
    expect(screen.queryByText('Supino reto')).toBeNull()
    network.resolve(pacote())
    expect(await screen.findByText('Supino reto')).toBeTruthy()
  })

  it('não ressuscita pacote nem cache após outra aba trocar a credencial', async () => {
    const cached = pacote()
    const network = deferred<StudentWorkout>()
    readCachedWorkoutMock.mockResolvedValue({ at: '2026-08-26T10:00:00.000Z', data: cached })
    getWorkoutMock.mockReturnValue(network.promise)

    render(<TreinoAluno />)
    expect(await screen.findByText('Supino reto')).toBeTruthy()
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'avalix:treino:token',
        newValue: 'D'.repeat(43),
      })
    )
    expect(await screen.findByText(/Link inválido ou expirado/)).toBeTruthy()

    network.resolve(pacote({ org_name: 'Pacote atrasado' }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText('Pacote atrasado')).toBeNull()
    expect(writeCachedWorkoutMock).not.toHaveBeenCalled()
  })

  it('limpa o aparelho quando o envio responde que o link expirou', async () => {
    submitMock.mockRejectedValue({ message: 'link invalido ou expirado' })
    await abrir()
    fireEvent.change(await campoCarga(), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Concluir treino' }))

    expect(await screen.findByText(/Link inválido ou expirado/)).toBeTruthy()
    expect(purgeRevokedMock).toHaveBeenCalled()
  })

  it('mantém visível a rejeição definitiva de uma sessão da fila', async () => {
    readQueueMock.mockResolvedValue([
      {
        clientRef: 'ref-rejeitada',
        planId: 'p1',
        dayLabel: 'A',
        weekNumber: 1,
        performedAt: '2026-08-26',
        notes: null,
        sets: [],
        queuedAt: '2026-08-26T12:00:00.000Z',
        error: 'data de execução fora da janela permitida',
      },
    ])
    await abrir()

    expect(await screen.findByText(/Treino A.*não foi enviado/i)).toBeTruthy()
    expect(screen.getByText(/fora da janela permitida/i)).toBeTruthy()
  })

  it('sugere a próxima divisão pela sequência e sessões concluídas', async () => {
    const base = pacote()
    getWorkoutMock.mockResolvedValue(
      pacote({
        current_plan_sessions: 1,
        plan: { ...base.plan!, weekly_schedule: ['A', 'B', 'A'] },
        days: [
          ...base.days,
          { id: 'd2', label: 'B', name: 'Inferiores', position: 1 },
        ],
      })
    )
    await abrir()

    expect(screen.getByRole('button', { name: /B.*Inferiores/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('após concluir limpa a sessão e prepara a próxima divisão com as séries prescritas', async () => {
    const base = pacote()
    getWorkoutMock.mockResolvedValue(
      pacote({
        plan: { ...base.plan!, weekly_schedule: ['A', 'B'] },
        days: [
          ...base.days,
          { id: 'd2', label: 'B', name: 'Inferiores', position: 1 },
        ],
        exercises: [
          ...base.exercises,
          {
            ...base.exercises[0],
            id: 'we2',
            day_id: 'd2',
            exercise_id: 'x2',
            name: 'Agachamento',
          },
        ],
      })
    )
    await abrir()
    fireEvent.change(await campoCarga(), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Concluir treino' }))

    await screen.findByText(/Treino concluído/)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /B.*Inferiores/ }).getAttribute('aria-pressed')).toBe('true')
    )
    expect(await screen.findByLabelText(/Carga da série 1 de Agachamento/)).toBeTruthy()
    expect(clearDraftMock).toHaveBeenCalledWith(
      'escopo-de-teste',
      'p1',
      'd1',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    )
  })

  it('usa uma sessão independente ao trocar divisão ou data', async () => {
    const base = pacote()
    getWorkoutMock.mockResolvedValue(
      pacote({
        plan: { ...base.plan!, weekly_schedule: ['A', 'B'] },
        days: [
          ...base.days,
          { id: 'd2', label: 'B', name: 'Inferiores', position: 1 },
        ],
        exercises: [
          ...base.exercises,
          {
            ...base.exercises[0],
            id: 'we2',
            day_id: 'd2',
            exercise_id: 'x2',
            name: 'Agachamento',
          },
        ],
      })
    )
    await abrir()
    fireEvent.change(await campoCarga(), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar progresso' }))
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /B.*Inferiores/ }))
    const cargaB = await screen.findByLabelText(/Carga da série 1 de Agachamento/)
    fireEvent.change(cargaB, { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar progresso' }))
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(2))

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const dateInput = screen.getByLabelText('Data') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: yesterday } })
    await waitFor(() => expect(dateInput.value).toBe(yesterday))
    const cargaOutroDia = await screen.findByLabelText(/Carga da série 1 de Agachamento/)
    fireEvent.change(cargaOutroDia, { target: { value: '62' } })
    fireEvent.click(screen.getByRole('button', { name: 'Concluir treino' }))
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(3))

    const [a, b, otherDate] = submitMock.mock.calls.map(([input]) => input)
    expect(new Set([a.clientRef, b.clientRef, otherDate.clientRef]).size).toBe(3)
    expect([a.dayLabel, b.dayLabel]).toEqual(['A', 'B'])
    expect(otherDate.performedAt).toBe(yesterday)
  })

  it('isola o estado quando a rede substitui o plano cacheado', async () => {
    const old = pacote()
    const fresh = pacote({
      plan: { ...old.plan!, id: 'p2', name: 'Plano novo' },
      days: [{ id: 'd2', label: 'B', name: 'Inferiores', position: 0 }],
      exercises: [
        {
          ...old.exercises[0],
          id: 'we2',
          day_id: 'd2',
          exercise_id: 'x2',
          name: 'Agachamento',
        },
      ],
    })
    const network = deferred<StudentWorkout>()
    readCachedWorkoutMock.mockResolvedValue({ at: '2026-08-26T10:00:00.000Z', data: old })
    readDraftMock.mockResolvedValue({
      clientRef: 'old-ref',
      planId: 'p1',
      dayId: 'd1',
      weekNumber: 1,
      performedAt: new Date().toISOString().slice(0, 10),
      notes: 'rascunho antigo',
      rows: { we1: [{ weight: '99', reps: '1', rir: '0' }] },
    })
    getWorkoutMock.mockReturnValue(network.promise)

    render(<TreinoAluno />)
    expect(await screen.findByText('Supino reto')).toBeTruthy()
    network.resolve(fresh)

    const novaCarga = await screen.findByLabelText(/Carga da série 1 de Agachamento/)
    expect((novaCarga as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('Supino reto')).toBeNull()
  })

  it('pagina o histórico com o cursor composto', async () => {
    const session = (id: string, performedAt: string): StudentHistorySession => ({
      id,
      performed_at: performedAt,
      day_label: 'A',
      week_number: 1,
      plan_name: 'Plano',
      source: 'student',
      notes: null,
      sets: [],
    })
    const first = Array.from({ length: 30 }, (_, index) => session(`s-${index}`, '2026-08-26'))
    const cursor = { performed_at: '2026-08-26', created_at: '2026-08-26T10:00:00Z', id: 's-29' }
    getHistoryPageMock
      .mockResolvedValueOnce({ items: first, next_cursor: cursor })
      .mockResolvedValueOnce({ items: [session('s-30', '2026-08-25')], next_cursor: null })

    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))
    expect(await screen.findByText(/Carregar sessões anteriores/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Carregar sessões anteriores/ }))

    await waitFor(() => expect(getHistoryPageMock).toHaveBeenLastCalledWith(TOKEN, { limit: 30, cursor }))
    expect(await screen.findByText(/25\/08/)).toBeTruthy()
  })

  it('não pagina o cache enquanto a primeira página fresca ainda está em voo', async () => {
    const cursor = { performed_at: '2026-08-20', created_at: '2026-08-20T10:00:00Z', id: 'cache-1' }
    readCachedHistoryMock.mockResolvedValue({
      sessions: [{
        id: 'cache-1',
        performed_at: '2026-08-20',
        day_label: 'A',
        week_number: 1,
        plan_name: 'Plano cacheado',
        source: 'student',
        notes: null,
        sets: [],
      }],
      nextCursor: cursor,
    })
    const fresh = deferred<{ items: StudentHistorySession[]; next_cursor: null }>()
    getHistoryPageMock.mockReturnValue(fresh.promise)

    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))
    await waitFor(() => expect(readCachedHistoryMock).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Carregar sessões anteriores/ })).toBeNull()

    fresh.resolve({ items: [], next_cursor: null })
    await waitFor(() => expect(getHistoryPageMock).toHaveBeenCalled())
  })

  it('purga o aparelho quando o histórico detecta link revogado', async () => {
    getHistoryPageMock.mockResolvedValue(null)
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))

    expect(await screen.findByText(/Link inválido ou expirado/)).toBeTruthy()
    expect(purgeRevokedMock).toHaveBeenCalled()
  })

  it('purga o aparelho quando o detalhe anterior detecta link revogado', async () => {
    getWorkoutMock
      .mockResolvedValueOnce(
        pacote({
          history_plans: [
            { id: 'pa', name: 'Plano antigo', goal: null, weeks: 4, starts_on: null, status: 'archived', sessions: 2 },
          ],
        })
      )
      .mockResolvedValueOnce(null)
    getPlanMock.mockResolvedValue(null)

    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Anteriores' }))
    fireEvent.click(screen.getByRole('button', { name: /Plano antigo/ }))

    expect(await screen.findByText(/Link inválido ou expirado/)).toBeTruthy()
    expect(removeCachedPlanMock).toHaveBeenCalledWith('escopo-de-teste', 'pa')
    expect(purgeRevokedMock).toHaveBeenCalled()
  })

  it('ignora resposta atrasada de outro plano anterior', async () => {
    const base = pacote()
    getWorkoutMock.mockResolvedValue(
      pacote({
        history_plans: [
          { id: 'pa', name: 'Plano A', goal: null, weeks: 4, starts_on: null, status: 'archived', sessions: 2 },
          { id: 'pb', name: 'Plano B', goal: null, weeks: 4, starts_on: null, status: 'archived', sessions: 2 },
        ],
      })
    )
    const a = deferred<StudentPlanDetail | null>()
    const b = deferred<StudentPlanDetail | null>()
    getPlanMock.mockImplementation((_token: string, id: string) => (id === 'pa' ? a.promise : b.promise))
    const detail = (name: string, id: string): StudentPlanDetail => ({
      plan: { ...base.plan!, id, name, status: 'archived' },
      days: [{ id: `d-${id}`, label: 'A', name: null, position: 0 }],
      exercises: [{ ...base.exercises[0], id: `we-${id}`, day_id: `d-${id}`, name }],
      weeks: [],
      overrides: [],
    })

    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Anteriores' }))
    fireEvent.click(screen.getByRole('button', { name: /Plano A/ }))
    fireEvent.click(screen.getByRole('button', { name: /Plano B/ }))
    b.resolve(detail('Exercício B', 'pb'))
    expect(await screen.findByText(/Exercício B/)).toBeTruthy()
    a.resolve(detail('Exercício A', 'pa'))

    await waitFor(() => expect(screen.queryByText(/Exercício A/)).toBeNull())
    expect(screen.getByText(/Exercício B/)).toBeTruthy()
  })

  it('avisa que o registro é visível ao profissional', async () => {
    await abrir()
    expect(screen.getByText(/visível para o profissional/i)).toBeTruthy()
  })
})

// Aparelho ocupado, dor no dia, fila na academia: a troca acontece e precisa
// caber no registro. Sem link para o catálogo, o aluno escolhe entre os
// exercícios das OUTRAS divisões do próprio plano — o pacote já os traz, então
// funciona offline como o resto da tela.
describe('TreinoAluno — troca de exercício', () => {
  function pacoteDoisDias() {
    const base = pacote()
    return pacote({
      days: [
        { id: 'd1', label: 'A', name: 'Superiores', position: 0 },
        { id: 'd2', label: 'B', name: 'Inferiores', position: 1 },
      ],
      exercises: [
        ...base.exercises,
        {
          id: 'we2',
          day_id: 'd2',
          exercise_id: 'x2',
          name: 'Leg press',
          position: 0,
          sets: 3,
          reps: '10-12',
          rir: 2,
          rest_seconds: 90,
          tempo: null,
          notes: null,
        },
      ],
    })
  }

  async function trocar() {
    fireEvent.change(screen.getByLabelText('Trocou algum exercício?'), {
      target: { value: 'we2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    return screen.findByLabelText(/Carga da série 1 de Leg press/)
  }

  it('envia o exercício trocado junto com o do dia, numerado por exercício', async () => {
    getWorkoutMock.mockResolvedValue(pacoteDoisDias())
    await abrir()
    fireEvent.change(await campoCarga(), { target: { value: '40' } })

    const carga = await trocar()
    fireEvent.change(carga, { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText(/Repetições da série 1 de Leg press/), {
      target: { value: '12' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Concluir treino' }))

    await waitFor(() => expect(submitMock).toHaveBeenCalled())
    expect(submitMock.mock.calls[0][0].sets).toEqual([
      { exercise_id: 'x1', set_number: 1, weight_kg: 40, reps: null, rir: null },
      { exercise_id: 'x2', set_number: 1, weight_kg: 100, reps: 12, rir: null },
    ])
  })

  it('a troca entra no rascunho, para não sumir se a aba fechar no meio', async () => {
    getWorkoutMock.mockResolvedValue(pacoteDoisDias())
    await abrir()
    fireEvent.change(await campoCarga(), { target: { value: '40' } })
    await trocar()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar progresso' }))

    await waitFor(() => expect(reserveDraftRevisionMock).toHaveBeenCalled())
    expect(reserveDraftRevisionMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ extras: ['we2'] })
    )
  })

  it('o exercício escolhido sai da lista e volta ao ser removido', async () => {
    getWorkoutMock.mockResolvedValue(pacoteDoisDias())
    await abrir()
    await trocar()

    expect(screen.queryByRole('option', { name: /Leg press/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tirar Leg press deste treino' }))
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Leg press/ })).toBeTruthy()
    )
    expect(screen.queryByLabelText(/Carga da série 1 de Leg press/)).toBeNull()
  })

  it('plano de uma divisão só não mostra a troca', async () => {
    await abrir()
    expect(screen.queryByLabelText('Trocou algum exercício?')).toBeNull()
  })
})
