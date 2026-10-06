// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TreinoAluno from './TreinoAluno'
import * as store from '../features/workout/studentStore'
import { flushQueue, isTransientStudentError, studentScope } from '../features/workout/studentSession'
import type { StudentWorkout } from '../features/workout/studentApi'

// Continuidade do treino do aluno com a página, a fila e o IndexedDB reais
// (fake-indexeddb); só a rede é simulada. São os caminhos da auditoria de
// 06/10/2026 em que o treino se perdia ou a semana voltava: A02 (link revogado
// no envio), A04 (relógio do aparelho adiantado), A08 (trocar de seção ou
// recarregar depois de concluir sem internet) e A11 (cota do link tratada
// como recusa definitiva).

const rpc = vi.hoisted(() => ({ get: vi.fn(), submit: vi.fn(), history: vi.fn() }))
vi.mock('../features/workout/studentApi', () => ({
  getWorkoutForLink: (...args: unknown[]) => rpc.get(...args),
  submitSession: (...args: unknown[]) => rpc.submit(...args),
  getHistoryPageForLink: (...args: unknown[]) => rpc.history(...args),
  getPlanForLink: vi.fn(async () => null),
  updateSessionForLink: vi.fn(),
}))
vi.mock('../lib/errlog', () => ({ setErrlogLink: vi.fn(), reportHandledError: vi.fn() }))

const TOKEN = 'A'.repeat(43)
const SEM_REDE = () => new TypeError('Failed to fetch')
const COTA = { code: 'P0001', message: 'muitas gravacoes; tente de novo mais tarde', status: 400 }
let scope: string

function pacote(over: Partial<StudentWorkout> = {}): StudentWorkout {
  return {
    org_name: 'Estúdio Fictício', subject_first_name: 'Marta', link_expires_at: '2026-10-10T12:00:00Z',
    current_plan_sessions: 0, plan_week_log: [],
    plan: { id: 'p1', name: 'Treino fictício', weeks: 8, starts_on: null, status: 'active',
      goal: null, notes: null, weekly_schedule: ['A'] },
    days: [{ id: 'd1', label: 'A', name: 'Superiores', position: 0 }],
    exercises: [{ id: 'we1', day_id: 'd1', exercise_id: 'x1', name: 'Supino reto', position: 0,
      sets: 1, reps: '8-12', rir: 2, rest_seconds: 90, tempo: null, notes: null }],
    weeks: [], overrides: [], last_sets: [], history_plans: [],
    ...over,
  }
}

function rascunho(): store.DraftSession {
  return { clientRef: 'rascunho-nao-enviado', revision: 0, planId: 'p1', dayId: 'd1', weekNumber: 1,
    performedAt: '2026-10-10', notes: 'Carga que existe apenas neste aparelho',
    rows: { we1: [{ weight: '42', reps: '10', rir: '2', done: true }] },
    identity: { dayLabel: 'A', rowExercises: { we1: 'x1' } } }
}

function sessaoNaFila(over: Partial<store.QueuedSession> = {}): store.QueuedSession {
  return { clientRef: 'sessao-offline', revision: 1, planId: 'p1', dayLabel: 'A', weekNumber: 1,
    performedAt: '2026-10-05', notes: null, queuedAt: '2026-10-05T12:00:00Z',
    sets: [{ exercise_id: 'x1', set_number: 1, weight_kg: 42, reps: 10, rir: 2 }], ...over }
}

async function concluirComCarga(valor: string) {
  fireEvent.change(await screen.findByLabelText(/Carga da série 1 de Supino reto/), { target: { value: valor } })
  fireEvent.click(screen.getByRole('button', { name: 'Concluir treino' }))
}

const semana = () => (screen.getByLabelText('Semana') as HTMLSelectElement).value

beforeAll(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  scope = await studentScope(TOKEN)
})

beforeEach(async () => {
  await store.forgetStudentDevice()
  localStorage.clear()
  store.saveStudentToken(TOKEN)
  window.history.replaceState(null, '', '/t')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-05T12:00:00Z'))
  rpc.get.mockReset().mockResolvedValue(pacote())
  rpc.submit.mockReset().mockRejectedValue(SEM_REDE())
  rpc.history.mockReset().mockResolvedValue({ items: [], next_cursor: null })
})

afterEach(async () => {
  cleanup()
  await new Promise((resolve) => setTimeout(resolve, 20))
  vi.useRealTimers()
})

describe('relógio do aparelho (A04)', () => {
  it('adiantado: o servidor confirma o link, o treino abre e nada é apagado', async () => {
    vi.setSystemTime(new Date('2026-10-10T11:59:00Z'))
    await store.writeCachedWorkout(scope, pacote())
    await store.writeDraft(scope, rascunho(), true)
    // Dois minutos adiantado: pelo aparelho o link venceu às 12:00.
    vi.setSystemTime(new Date('2026-10-10T12:01:00Z'))
    render(<TreinoAluno />)
    const carga = await screen.findByLabelText(/Carga da série 1 de Supino reto/)
    await waitFor(() => expect((carga as HTMLInputElement).value).toBe('42'))
    expect(rpc.get).toHaveBeenCalled()
    expect(screen.queryByText('Link inválido ou expirado')).toBeNull()
    expect(store.loadStudentToken()).toBe(TOKEN)
    expect(await store.readDraft(scope, 'p1')).toMatchObject({ rows: { we1: [{ weight: '42' }] } })
  })

  it('sem rede, vale a validade guardada: limpa o aparelho, mas oferece copiar o rascunho', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await store.writeCachedWorkout(scope, pacote())
    await store.writeDraft(scope, rascunho(), true)
    vi.setSystemTime(new Date('2026-10-10T12:01:00Z'))
    rpc.get.mockRejectedValue(SEM_REDE())
    render(<TreinoAluno />)
    await screen.findByRole('heading', { name: 'Link inválido ou expirado' })
    expect(await screen.findByText('Treino A · 10/10/2026 · não concluído')).toBeTruthy()
    await waitFor(async () => expect(await store.readDraft(scope, 'p1')).toBeNull())
    expect(store.loadStudentToken()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Copiar dados/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText.mock.calls[0][0]).toContain('Supino reto: 42 kg × 10 reps (RIR 2)')
  })
})

describe('link revogado no envio (A02)', () => {
  it('o treino recusado fica na tela para copiar antes da limpeza', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    rpc.submit.mockRejectedValue(new Error('link invalido ou expirado'))
    render(<TreinoAluno />)
    await concluirComCarga('42')
    await screen.findByRole('heading', { name: 'Link inválido ou expirado' })
    expect(await screen.findByText('Um treino seu ainda não tinha chegado ao treinador.')).toBeTruthy()
    await waitFor(async () => expect(await store.readCachedWorkout(scope)).toBeNull())
    expect(await store.readQueue(scope)).toEqual([])
    expect(store.loadStudentToken()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Copiar dados/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText.mock.calls[0][0]).toContain('Supino reto: 42 kg')
  })
})

describe('semana do mesociclo depois de concluir (A08)', () => {
  it('trocar para o Histórico e voltar mantém a semana, e a sessão seguinte vai para a semana 2', async () => {
    await store.writeCachedWorkout(scope, pacote())
    rpc.get.mockRejectedValue(SEM_REDE())
    render(<TreinoAluno />)
    await concluirComCarga('40')
    await screen.findByText('Treino concluído e salvo no aparelho. Será sincronizado automaticamente.')
    expect(semana()).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))
    await screen.findByText(/Nenhum treino registrado ainda/)
    fireEvent.click(screen.getByRole('button', { name: /^Treino$/ }))
    await screen.findByLabelText(/Carga da série 1 de Supino reto/)
    expect(semana()).toBe('2')
    await concluirComCarga('45')
    await screen.findByText('Treino concluído e salvo no aparelho. Será sincronizado automaticamente.')
    const fila = await store.readQueue(scope)
    expect(fila.map((item) => item.weekNumber)).toEqual([1, 2])
  })

  it('com internet também: trocar de seção depois de concluir não faz a semana voltar', async () => {
    // O pacote do servidor ainda não traz a sessão (chega na próxima leitura).
    rpc.submit.mockResolvedValue({ logId: 'recebido', stale: false })
    render(<TreinoAluno />)
    await concluirComCarga('40')
    await screen.findByText('Treino concluído! Seu treinador já consegue ver.')
    expect(semana()).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))
    await screen.findByText(/Nenhum treino registrado ainda/)
    fireEvent.click(screen.getByRole('button', { name: /^Treino$/ }))
    await screen.findByLabelText(/Carga da série 1 de Supino reto/)
    expect(semana()).toBe('2')
  })

  it('recarregar a página sem internet conta a sessão que está na fila', async () => {
    await store.writeCachedWorkout(scope, pacote())
    rpc.get.mockRejectedValue(SEM_REDE())
    render(<TreinoAluno />)
    await concluirComCarga('40')
    await screen.findByText('Treino concluído e salvo no aparelho. Será sincronizado automaticamente.')
    cleanup()
    render(<TreinoAluno />)
    await screen.findByLabelText(/Carga da série 1 de Supino reto/)
    await waitFor(() => expect(semana()).toBe('2'))
  })

  it('a sessão que o pacote já traz não conta duas vezes', async () => {
    await store.enqueueSession(scope, sessaoNaFila())
    rpc.get.mockResolvedValue(pacote({
      current_plan_sessions: 1,
      plan_week_log: [{ performed_at: '2026-10-05', week_number: 1, client_ref: 'sessao-offline' }],
    }))
    render(<TreinoAluno />)
    await screen.findByLabelText(/Carga da série 1 de Supino reto/)
    // Uma sessão na semana 1 (no pacote e na fila): semana 2, não 3.
    await waitFor(() => expect(semana()).toBe('2'))
  })
})

describe('cota de gravações do link (A11)', () => {
  it('é passageira: a sessão continua na fila e sobe depois da janela', async () => {
    expect(isTransientStudentError(COTA)).toBe(true)
    await store.enqueueSession(scope, sessaoNaFila())
    rpc.submit.mockRejectedValueOnce(COTA)
    const resposta = await flushQueue(TOKEN, scope)
    expect(resposta.rejected).toEqual([])
    expect((await store.readQueue(scope))[0].error).toBeUndefined()
    rpc.submit.mockResolvedValue({ logId: 'recebido', stale: false })
    vi.setSystemTime(new Date('2026-10-05T14:00:00Z'))
    await flushQueue(TOKEN, scope)
    expect(rpc.submit).toHaveBeenCalledTimes(2)
    expect(await store.readQueue(scope)).toEqual([])
  })

  it('a sessão que a versão anterior marcou como recusada volta a subir', async () => {
    await store.enqueueSession(scope, sessaoNaFila({ error: COTA.message }))
    rpc.submit.mockResolvedValue({ logId: 'recebido', stale: false })
    await flushQueue(TOKEN, scope)
    expect(rpc.submit).toHaveBeenCalledTimes(1)
    expect(await store.readQueue(scope)).toEqual([])
  })

  it('a tela mostra a sessão como aguardando, não como recusada', async () => {
    await store.writeCachedWorkout(scope, pacote())
    await store.enqueueSession(scope, sessaoNaFila({ error: COTA.message }))
    rpc.get.mockRejectedValue(SEM_REDE())
    render(<TreinoAluno />)
    expect(await screen.findByText('1 treino salvo no aparelho, aguardando sincronização.')).toBeTruthy()
    expect(screen.queryByText(/não foi enviado/)).toBeNull()
  })
})
