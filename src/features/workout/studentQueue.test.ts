import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueuedSession } from './studentStore'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  readQueue: vi.fn(),
  dequeue: vi.fn(),
  reject: vi.fn(),
}))

vi.mock('./studentApi', () => ({ submitSession: mocks.submit }))
vi.mock('./studentStore', () => ({
  dequeueSession: mocks.dequeue,
  loadStudentToken: vi.fn(),
  markSessionRejected: mocks.reject,
  readQueue: mocks.readQueue,
  saveStudentToken: vi.fn(),
}))

import { flushQueue } from './studentSession'

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
})

describe('sincronização da fila', () => {
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
      'data de execução fora da janela permitida'
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
})
