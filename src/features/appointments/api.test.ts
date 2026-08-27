import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  orderStartsAt: vi.fn(),
  orderId: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: { from: mocks.from },
}))

import { listUpcomingAppointments } from './api'

beforeEach(() => {
  mocks.from.mockReset().mockReturnValue({ select: mocks.select })
  mocks.select.mockReset().mockReturnValue({ eq: mocks.eq })
  mocks.eq.mockReset().mockReturnValue({ gte: mocks.gte })
  mocks.gte.mockReset().mockReturnValue({ lte: mocks.lte })
  mocks.lte.mockReset().mockReturnValue({ order: mocks.orderStartsAt })
  mocks.orderStartsAt.mockReset().mockReturnValue({ order: mocks.orderId })
  mocks.orderId.mockReset().mockResolvedValue({
    data: [
      {
        id: 'appointment-1',
        org_id: 'org-1',
        subject_id: 'subject-1',
        evaluator_id: 'evaluator-1',
        title: 'Avaliação física',
        starts_at: '2026-09-01T12:00:00.000Z',
        duration_min: 60,
        location: null,
        notes: null,
        created_at: '2026-08-27T10:00:00.000Z',
        updated_at: '2026-08-27T10:00:00.000Z',
        subjects: { full_name: 'Ana Lima' },
      },
      {
        id: 'appointment-2',
        org_id: 'org-1',
        subject_id: 'subject-2',
        evaluator_id: 'evaluator-1',
        title: 'Reavaliação',
        starts_at: '2026-09-01T12:00:00.000Z',
        duration_min: 45,
        location: 'Estúdio',
        notes: 'Retorno',
        created_at: '2026-08-27T11:00:00.000Z',
        updated_at: '2026-08-27T11:00:00.000Z',
        subjects: [{ full_name: 'Bruno Souza' }],
      },
    ],
    error: null,
  })
})

describe('listUpcomingAppointments', () => {
  it('consulta a janela da organização, ordena deterministicamente e mapeia o nome', async () => {
    const startsAt = '2026-09-01T00:00:00.000Z'
    const endsAt = '2026-09-08T00:00:00.000Z'

    const appointments = await listUpcomingAppointments('org-1', startsAt, endsAt)

    expect(mocks.from).toHaveBeenCalledWith('appointments')
    expect(mocks.select).toHaveBeenCalledWith('*, subjects!inner(full_name)')
    expect(mocks.eq).toHaveBeenCalledWith('org_id', 'org-1')
    expect(mocks.gte).toHaveBeenCalledWith('starts_at', startsAt)
    expect(mocks.lte).toHaveBeenCalledWith('starts_at', endsAt)
    expect(mocks.orderStartsAt).toHaveBeenCalledWith('starts_at', { ascending: true })
    expect(mocks.orderId).toHaveBeenCalledWith('id', { ascending: true })
    expect(appointments).toEqual([
      expect.objectContaining({
        id: 'appointment-1',
        subject_id: 'subject-1',
        subjectName: 'Ana Lima',
      }),
      expect.objectContaining({
        id: 'appointment-2',
        subject_id: 'subject-2',
        subjectName: 'Bruno Souza',
      }),
    ])
    expect(appointments[0]).not.toHaveProperty('subjects')
    expect(appointments[1]).not.toHaveProperty('subjects')
  })
})
