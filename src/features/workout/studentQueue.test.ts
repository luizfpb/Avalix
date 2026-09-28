import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueuedSession } from './studentStore'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  readQueue: vi.fn(),
  dequeue: vi.fn(),
  reject: vi.fn(),
  retry: vi.fn(),
}))

vi.mock('./studentApi', () => ({ submitSession: mocks.submit }))
vi.mock('./studentStore', async (original) => ({
  ...(await original<typeof import('./studentStore')>()),
  dequeueSession: mocks.dequeue,
  loadStudentToken: vi.fn(),
  markSessionRejected: mocks.reject,
  markSessionRetry: mocks.retry,
  readQueue: mocks.readQueue,
  saveStudentToken: vi.fn(),
}))

import { flushQueue, queuedSessionText } from './studentSession'

const ITEM: QueuedSession = {
  clientRef: 'ref-1',
  revision: 1,
  planId: 'plan-1',
  dayLabel: 'A',
  weekNumber: 1,
  performedAt: '2026-08-26',
  notes: null,
  sets: [{ exercise_id: 'ex-1', set_number: 1, weight_kg: 40, reps: 10, rir: 2 }],
  queuedAt: '2026-08-26T12:00:00.000Z',
}

beforeEach(() => {
  mocks.submit.mockReset()
  mocks.dequeue.mockReset()
  mocks.reject.mockReset()
  mocks.readQueue.mockReset()
  mocks.retry.mockReset()
})

describe('sincronização da fila', () => {
  it.each([
    { code: 'PGRST002', message: 'Could not query the database for the schema cache' },
    { code: '57014', message: 'canceling statement due to statement timeout' },
    { status: 429, message: 'Too many requests' },
    { status: 503, message: 'Service unavailable' },
  ])('mantém falha temporária pendente e recupera após o backoff: $message', async (error) => {
    const item = { ...ITEM }
    mocks.readQueue.mockImplementation(async () => [item])
    mocks.submit.mockRejectedValueOnce(error).mockResolvedValue({ logId: 'log1', stale: false })
    mocks.retry.mockImplementation(async () => { Object.assign(item, { retryAt: Date.now() + 15_000 }) })
    expect(await flushQueue('token', 'escopo')).toMatchObject({ sent: 0, pending: 1, rejected: [] })
    expect(mocks.reject).not.toHaveBeenCalled()
    await flushQueue('token', 'escopo')
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    mocks.dequeue.mockImplementation(async () => { mocks.readQueue.mockResolvedValue([]) })
    expect(await flushQueue('token', 'escopo', undefined, true)).toMatchObject({ sent: 1, pending: 0 })
  })

  it('retoma fila antiga indevidamente marcada como rejeitada por schema cache', async () => {
    mocks.readQueue.mockResolvedValue([{ ...ITEM, error: 'Could not query the database for the schema cache' }])
    mocks.submit.mockResolvedValue({ logId: 'log1', stale: false })
    mocks.dequeue.mockImplementation(async () => { mocks.readQueue.mockResolvedValue([]) })
    expect(await flushQueue('token', 'escopo')).toMatchObject({ sent: 1, pending: 0 })
  })

  it('persiste a rejeição definitiva para a tela explicar ao aluno', async () => {
    const queue = [{ ...ITEM }]
    mocks.readQueue.mockImplementation(async () => queue)
    mocks.submit.mockRejectedValue({ message: 'data de execução fora da janela permitida' })
    mocks.reject.mockImplementation(async (_scope: string, clientRef: string, message: string) => {
      const item = queue.find((candidate) => candidate.clientRef === clientRef)
      if (item) Object.assign(item, { error: message })
    })

    const result = await flushQueue('token', 'escopo')

    expect(mocks.reject).toHaveBeenCalledWith(
      'escopo',
      'ref-1',
      'data de execução fora da janela permitida', expect.any(Object), 1
    )
    expect(mocks.dequeue).not.toHaveBeenCalled()
    expect(result).toMatchObject({ pending: 0, rejected: [{ clientRef: 'ref-1' }] })
  })

  it('mantém pendente quando a falha ainda é de rede', async () => {
    mocks.readQueue.mockResolvedValue([{ ...ITEM }])
    mocks.submit.mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await flushQueue('token', 'escopo')

    expect(result.pending).toBe(1)
    expect(mocks.reject).not.toHaveBeenCalled()
    expect(mocks.dequeue).not.toHaveBeenCalled()
  })

  it('propaga link inválido para a limpeza central em vez de manter dados locais', async () => {
    mocks.readQueue.mockResolvedValue([{ ...ITEM }])
    mocks.submit.mockRejectedValue({ message: 'link invalido ou expirado' })

    await expect(flushQueue('token', 'escopo')).rejects.toMatchObject({
      message: 'link invalido ou expirado',
    })
    expect(mocks.reject).not.toHaveBeenCalled()
    expect(mocks.dequeue).not.toHaveBeenCalled()
  })

  // A sessão salva para continuar depois vai à fila marcada; sem a marca, o
  // servidor a contaria como treino feito (0039).
  it('envia a marca de sessão em andamento, e fila antiga sem a marca vale como concluída', async () => {
    mocks.readQueue.mockResolvedValue([{ ...ITEM, inProgress: true }, { ...ITEM, clientRef: 'ref-2' }])
    mocks.submit.mockResolvedValue({ logId: 'log1', stale: false })
    await flushQueue('token', 'escopo')
    expect(mocks.submit.mock.calls[0][0].inProgress).toBe(true)
    expect(mocks.submit.mock.calls[1][0].inProgress).toBe(false)
  })
})

// Treino recusado em definitivo: o texto que o aluno copia para o treinador.
describe('queuedSessionText', () => {
  it('resume a sessão por exercício, com os números de cada série', () => {
    const texto = queuedSessionText({
      ...ITEM,
      weekNumber: 2,
      notes: 'ombro incomodou',
      sets: [
        { exercise_id: 'ex-1', set_number: 2, weight_kg: 42.5, reps: 8, rir: 0, reached_failure: true },
        { exercise_id: 'ex-1', set_number: 1, weight_kg: 40, reps: 10, rir: 2, rest_seconds: 90 },
        { exercise_id: 'ex-9', set_number: 1, weight_kg: null, reps: 15, rir: null },
      ],
    }, { 'ex-1': 'Supino reto' })
    expect(texto).toBe([
      'Treino A · 26/08/2026 · semana 2',
      'Supino reto: 40 kg × 10 reps (RIR 2, descanso 90 s) · 42,5 kg × 8 reps (RIR 0, falha)',
      'Exercício: 15 reps',
      'Observações: ombro incomodou',
    ].join('\n'))
  })
})
