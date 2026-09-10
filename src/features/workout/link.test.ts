import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sha256Hex } from '../../lib/hash'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), save: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('./linkStore', () => ({
  saveWorkoutLinkLocal: mocks.save,
  clearWorkoutLinkLocal: vi.fn(),
}))

import { issueWorkoutLink, type WorkoutLinkRow } from './link'

const row: WorkoutLinkRow = {
  id: 'link-1', org_id: 'org-1', subject_id: 'subject-1', created_by: 'trainer-1',
  token_hash: 'a'.repeat(64), status: 'active',
  created_at: '2026-09-10T12:00:00.000Z', updated_at: '2026-09-10T12:00:00.000Z',
  expires_at: '2027-03-09T12:00:00.000Z',
  last_seen_at: null, sessions_count: 0, writes_count: 0,
  write_window_at: null, last_write_at: null,
}

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: row, error: null })
  mocks.save.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('emissão do link de treino', () => {
  it.each([
    '2026-09-10T12:00:05.000Z', // aparelho cinco segundos adiantado
    '2026-09-10T11:00:00.000Z', // aparelho atrasado
    '2030-01-01T00:00:00.000Z', // data do aparelho incorreta
  ])('deixa o banco definir a validade com relógio local em %s', async (clock) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(clock))

    const result = await issueWorkoutLink('subject-1')
    const token = result.url.split('#')[1]

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('issue_workout_link', {
      p_subject: 'subject-1', p_token_hash: await sha256Hex(token),
    })
    expect(result.row).toBe(row)
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith('subject-1', result.url, row.expires_at)
  })

  it('preserva o link local anterior quando a emissão é recusada', async () => {
    const error = { message: 'avaliado inexistente ou sem acesso' }
    mocks.rpc.mockResolvedValue({ data: null, error })

    await expect(issueWorkoutLink('subject-1')).rejects.toBe(error)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('não publica uma URL sem confirmação do banco', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })

    await expect(issueWorkoutLink('subject-1')).rejects.toThrow('Não foi possível confirmar a emissão')
    expect(mocks.save).not.toHaveBeenCalled()
  })
})
