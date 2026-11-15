import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: fromMock,
  },
}))

import { createFitnessTest, listFitnessTests, updateFitnessTest, type FitnessTestRow } from './api'

const sampleRow: FitnessTestRow = {
  id: 'ft-1',
  org_id: 'org-1',
  subject_id: 'sub-1',
  evaluator_id: 'user-1',
  tested_at: '2026-10-20',
  measures: { push_ups: { reps: 25, knees: false } },
  notes: null,
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-20T10:00:00Z',
}

describe('fitness api', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('ordena listFitnessTests por tested_at, created_at e id para paginação determinística', async () => {
    const orderCalls: Array<[string, { ascending?: boolean } | undefined]> = []
    const filter = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn((col: string, opts?: { ascending?: boolean }) => {
        orderCalls.push([col, opts])
        return filter
      }),
      range: vi.fn().mockResolvedValue({ data: [sampleRow], error: null }),
    }
    fromMock.mockReturnValue(filter)

    const res = await listFitnessTests('sub-1')
    expect(res).toEqual([sampleRow])
    expect(orderCalls).toEqual([
      ['tested_at', { ascending: false }],
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
  })

  it('devolve o registro existente em createFitnessTest quando há conflito idempotente na PK', async () => {
    const insertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint "fitness_tests_pkey"' },
        }),
      }),
    }
    const selectChain = {
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: sampleRow, error: null }),
      }),
    }
    fromMock.mockReturnValue({
      insert: vi.fn().mockReturnValue(insertChain),
      select: vi.fn().mockReturnValue(selectChain),
    })

    const res = await createFitnessTest({
      id: 'ft-1',
      orgId: 'org-1',
      subjectId: 'sub-1',
      testedAt: '2026-10-20',
      measures: { push_ups: { reps: 25, knees: false } },
      notes: null,
    })
    expect(res).toEqual(sampleRow)
  })

  it('avisa conflito de versão em updateFitnessTest quando updated_at mudou em outro dispositivo', async () => {
    const updateChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    }
    const selectChain = {
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { ...sampleRow, updated_at: '2026-10-20T12:00:00Z' },
          error: null,
        }),
      }),
    }
    fromMock.mockReturnValue({
      update: vi.fn().mockReturnValue(updateChain),
      select: vi.fn().mockReturnValue(selectChain),
    })

    await expect(
      updateFitnessTest(
        'ft-1',
        { testedAt: '2026-10-20', measures: { push_ups: { reps: 30, knees: false } }, notes: null },
        '2026-10-20T10:00:00Z'
      )
    ).rejects.toThrow(/alterados em outro dispositivo/)
  })
})
