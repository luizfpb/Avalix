import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))

import {
  getHistoryPageForLink,
  submitSession,
  updateSessionForLink,
  type StudentHistorySession,
  type SubmitSet,
} from './studentApi'

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: { log_id: 'log-1', stale: false }, error: null })
})

describe('descanso registrado pelo aluno', () => {
  it('envia o descanso por série e aceita uma fila legada sem esse campo', async () => {
    const sets: SubmitSet[] = [90, 0, null, undefined].map((rest_seconds, index) => ({
      exercise_id: 'ex-1', set_number: index + 1, weight_kg: 40, reps: 10, rir: null,
      ...(rest_seconds === undefined ? {} : { rest_seconds }),
    }))
    await submitSession({
      token: 'A'.repeat(43), clientRef: 'ref-1', revision: 3,
      sets, dayLabel: 'A', weekNumber: 1, performedAt: '2026-09-08',
      notes: null, planId: 'plan-1',
    })
    expect(mocks.rpc).toHaveBeenCalledWith('submit_workout_session', expect.objectContaining({
      p_sets: sets,
      p_client_ref: 'ref-1',
      p_client_revision: 3,
    }))
    const args = mocks.rpc.mock.calls[0][1] as { p_sets: SubmitSet[] }
    expect(args.p_sets.map((set) => set.rest_seconds)).toEqual([90, 0, null, undefined])
  })

  it('preserva o descanso recebido no histórico para a leitura e o cache offline', async () => {
    const sessions = [{
      id: 'log-1', performed_at: '2026-09-08', day_label: 'A', week_number: 1,
      plan_name: 'Treino', source: 'student', notes: null,
      sets: [{ exercise_id: 'ex-1', exercise_name: 'Supino', set_number: 1,
        weight_kg: 40, reps: 10, rir: null, rest_seconds: 0 }],
    }]
    mocks.rpc.mockResolvedValue({ data: { items: sessions, next_cursor: null }, error: null })
    const result = await getHistoryPageForLink('A'.repeat(43))
    expect(result?.items[0].sets[0].rest_seconds).toBe(0)
  })
})

describe('falha e correção de treino salvo', () => {
  const sets: SubmitSet[] = [true, false, null, undefined].map((reached_failure, index) => ({
    exercise_id: 'ex-1', set_number: index + 1, weight_kg: 40, reps: 10, rir: 0,
    ...(reached_failure === undefined ? {} : { reached_failure }),
  }))
  const edited: StudentHistorySession = {
    id: 'log-1', updated_at: '2026-09-08T15:00:01Z', performed_at: '2026-09-07',
    day_label: 'A', week_number: 1, plan_name: 'Treino', source: 'student', notes: null,
    sets: sets.map((set) => ({ ...set, exercise_name: 'Supino' })),
  }
  const input = {
    token: 'A'.repeat(43), logId: 'log-1', expectedUpdatedAt: '2026-09-08T15:00:00Z',
    performedAt: '2026-09-07', notes: null, sets,
  }

  it('preserva a distinção entre falha, RIR zero e valor legado no envio', async () => {
    await submitSession({
      token: 'A'.repeat(43), clientRef: 'ref-1', revision: 3,
      sets, dayLabel: 'A', weekNumber: 1, performedAt: '2026-09-08', notes: null, planId: 'plan-1',
    })
    const args = mocks.rpc.mock.calls[0][1] as { p_sets: SubmitSet[] }
    expect(args.p_sets.map((set) => set.reached_failure)).toEqual([true, false, null, undefined])
    expect(args.p_sets.map((set) => set.rir)).toEqual([0, 0, 0, 0])
  })

  it('expõe replay recusado por uma correção posterior sem tratá-lo como gravação', async () => {
    mocks.rpc.mockResolvedValue({
      data: { log_id: 'log-1', stale: true, corrected: true }, error: null,
    })
    expect(await submitSession({
      token: input.token, clientRef: 'ref-1', revision: 3,
      sets, dayLabel: 'A', weekNumber: 1, performedAt: '2026-09-08', notes: null, planId: 'plan-1',
    })).toEqual({ logId: 'log-1', stale: true, corrected: true })
  })

  it('envia a versão-base e devolve o histórico completo atualizado sem passar pela fila', async () => {
    mocks.rpc.mockResolvedValue({ data: edited, error: null })
    expect(await updateSessionForLink(input)).toEqual(edited)
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('update_workout_session_for_link', {
      p_token: input.token,
      p_log: 'log-1',
      p_expected_updated_at: '2026-09-08T15:00:00Z',
      p_performed_at: '2026-09-07',
      p_sets: sets,
    })
  })

  it('inclui observação na correção quando ela foi informada', async () => {
    mocks.rpc.mockResolvedValue({ data: edited, error: null })
    await updateSessionForLink({ ...input, notes: 'Carga corrigida' })
    expect(mocks.rpc).toHaveBeenCalledWith('update_workout_session_for_link', expect.objectContaining({
      p_notes: 'Carga corrigida',
    }))
  })

  it('propaga conflito de versão e nunca confirma uma resposta vazia como sucesso', async () => {
    const conflict = { message: 'Este treino foi alterado. Atualize e tente novamente.' }
    mocks.rpc.mockResolvedValueOnce({ data: null, error: conflict })
    await expect(updateSessionForLink(input)).rejects.toEqual(conflict)
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(updateSessionForLink(input)).rejects.toThrow(/confirmar a edição/)
  })
})
