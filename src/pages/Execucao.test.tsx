// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouterProvider, createMemoryRouter } from 'react-router'
import Execucao from './Execucao'
import type { WorkoutPlanDetail, WorkoutWeekOverrideRow } from '../features/workout/api'

// Registrar o treino que ACONTECEU, e não só o que estava no papel: aparelho
// ocupado, dor no dia e troca combinada na hora são rotina de academia. O banco
// sempre permitiu (workout_log_sets aponta para o catálogo, não para o
// exercício do plano — 0009); estes testes fixam o caminho na tela.

const { criarMock, planoMock, logsMock, setsMock, updateMock } = vi.hoisted(() => ({
  criarMock: vi.fn(),
  planoMock: vi.fn(),
  logsMock: vi.fn(),
  setsMock: vi.fn(),
  updateMock: vi.fn(),
}))

vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org-1' } }),
}))

const exercicio = (id: string, name: string) => ({
  id,
  org_id: null,
  name,
  primary_muscle: 'chest',
  secondary_muscles: [],
  equipment: 'barbell',
  movement_pattern: 'horizontal_push',
  is_unilateral: false,
  cues: null,
  created_by: null,
  created_at: 'x',
})

vi.mock('../features/workout/hooks', () => ({
  useWorkoutPlan: () => planoMock(),
  useExercises: () => ({
    data: [exercicio('ex-1', 'Supino reto'), exercicio('ex-2', 'Crucifixo')],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useWorkoutLogs: () => logsMock(),
  usePlanSetHistory: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
  useWorkoutLogSets: () => setsMock(),
  useCreateWorkoutLog: () => ({ mutateAsync: criarMock, isPending: false }),
  useUpdateWorkoutLog: () => ({ mutateAsync: updateMock, isPending: false }),
  useDeleteWorkoutLog: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}))

function plano(): WorkoutPlanDetail {
  return {
    plan: {
      id: 'plan-1',
      org_id: 'org-1',
      subject_id: 'subject-1',
      evaluator_id: 'user-1',
      name: 'Mesociclo A',
      goal: 'hypertrophy',
      weeks: 4,
      starts_on: null,
      notes: null,
      status: 'active',
      source_assessment_id: null,
      source_posture_session_id: null,
      weekly_schedule: [],
      volume: null,
      volume_engine_version: null,
      created_at: '2026-08-01T10:00:00Z',
      updated_at: '2026-08-01T10:00:00Z',
    },
    days: [
      { id: 'day-1', org_id: 'org-1', plan_id: 'plan-1', label: 'A', name: 'Peito', position: 0, created_at: 'x' },
    ],
    exercises: [
      {
        id: 'we-1', org_id: 'org-1', day_id: 'day-1', exercise_id: 'ex-1', position: 0,
        sets: 3, reps: '8-12', rir: 2, rest_seconds: 90, tempo: null, notes: null,
        group_key: null, group_kind: null, technique: null, created_at: 'x',
      },
    ],
    overrides: [],
    weeks: [],
  } as unknown as WorkoutPlanDetail
}

function abrir() {
  const router = createMemoryRouter(
        [
          { path: '/avaliados/:id/treinos/:planId/execucao', element: <Execucao /> },
          { path: '/avaliados/:id/treinos/:planId', element: <div>detalhe do plano</div> },
        ],
        { initialEntries: ['/avaliados/subject-1/treinos/plan-1/execucao'] }
      )
  render(<RouterProvider router={router} />)
  return router
}

function adicionarCrucifixo() {
  fireEvent.click(screen.getByRole('button', { name: /Adicionar exercício/ }))
  fireEvent.click(screen.getByRole('button', { name: /Crucifixo/ }))
}

beforeEach(() => {
  criarMock.mockReset().mockResolvedValue({ id: 'log-1' })
  planoMock.mockReset().mockReturnValue({ data: plano(), isPending: false, isError: false })
  logsMock.mockReset().mockReturnValue({ data: [], isPending: false, isError: false, refetch: vi.fn() })
  setsMock.mockReset().mockReturnValue({ data: [], isPending: false, isError: false })
  updateMock.mockReset().mockResolvedValue({ id: 'log-1' })
})
afterEach(cleanup)

describe('prescrição efetiva e proteção durante o envio', () => {
  it('aplica séries, repetições, RIR, descanso e observação da semana', () => {
    const detail = plano()
    detail.overrides = [{ week_number: 2, workout_exercise_id: 'we-1', sets: 1, reps: '4-6', rir: 4,
      rest_seconds: 180, is_skipped: false, notes: 'Reduzir intensidade' }] as WorkoutWeekOverrideRow[]
    planoMock.mockReturnValue({ data: detail, isPending: false, isError: false })
    abrir()
    fireEvent.change(screen.getByLabelText('Semana'), { target: { value: '2' } })
    expect(screen.getByText(/plano: 1×4-6 · RIR 4/)).toBeTruthy()
    expect(screen.getAllByLabelText(/Carga da série .* de Supino reto/)).toHaveLength(1)
    expect(screen.getByLabelText('Repetições da série 1 de Supino reto')).toHaveProperty('placeholder', '4-6')
    expect(screen.getByLabelText('RIR da série 1 de Supino reto')).toHaveProperty('placeholder', '4')
    expect(screen.getByLabelText('Descanso da série 1 de Supino reto')).toHaveProperty('placeholder', '180')
    expect(screen.getByText('Reduzir intensidade')).toBeTruthy()
  })

  it('avisa que o exercício foi pulado, preservando séries já preenchidas', () => {
    const detail = plano()
    detail.overrides = [{ week_number: 2, workout_exercise_id: 'we-1', sets: null, reps: null, rir: null,
      rest_seconds: null, is_skipped: true, notes: null }] as WorkoutWeekOverrideRow[]
    planoMock.mockReturnValue({ data: detail, isPending: false, isError: false })
    abrir()
    fireEvent.change(screen.getByLabelText('Carga da série 1 de Supino reto'), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText('Semana'), { target: { value: '2' } })
    expect(screen.getAllByLabelText(/Carga da série .* de Supino reto/)).toHaveLength(1)
    expect(screen.getByLabelText('Carga da série 1 de Supino reto')).toHaveProperty('value', '40')
    expect(screen.getByText(/não executar/i)).toBeTruthy()
  })

  it('bloqueia séries, observações e avulsos enquanto registra o snapshot enviado', async () => {
    let resolve!: (value: unknown) => void
    criarMock.mockReturnValue(new Promise((next) => { resolve = next }))
    abrir()
    fireEvent.change(screen.getByLabelText('Carga da série 1 de Supino reto'), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar treino' }))
    await waitFor(() => expect(criarMock).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('Carga da série 2 de Supino reto').matches(':disabled')).toBe(true)
    expect(screen.getByRole('button', { name: /Adicionar exercício/ }).matches(':disabled')).toBe(true)
    await act(async () => { resolve({ id: 'log-1' }) })
    await screen.findByText('Treino registrado!')
    expect(criarMock.mock.calls[0][0].sets).toHaveLength(1)
    expect(screen.getByLabelText('Carga da série 2 de Supino reto').matches(':disabled')).toBe(false)
  })
})

describe('Execucao — exercício fora do plano', () => {
  it('registra o avulso junto do prescrito, numerando as séries por exercício', async () => {
    abrir()
    adicionarCrucifixo()

    fireEvent.change(screen.getByLabelText('Carga da série 1 de Supino reto'), {
      target: { value: '40' },
    })
    fireEvent.change(screen.getByLabelText('Repetições da série 1 de Supino reto'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Carga da série 1 de Crucifixo'), {
      target: { value: '14' },
    })
    fireEvent.change(screen.getByLabelText('Repetições da série 2 de Crucifixo'), {
      target: { value: '12' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar treino' }))

    await waitFor(() => expect(criarMock).toHaveBeenCalled())
    expect(criarMock.mock.calls[0][0].sets).toEqual([
      { exerciseId: 'ex-1', setNumber: 1, weightKg: 40, reps: 10, rir: null, restSeconds: null, reachedFailure: false },
      { exerciseId: 'ex-2', setNumber: 1, weightKg: 14, reps: null, rir: null, restSeconds: null, reachedFailure: false },
      { exerciseId: 'ex-2', setNumber: 2, weightKg: null, reps: 12, rir: null, restSeconds: null, reachedFailure: false },
    ])
  })

  it('o avulso pertence à sessão gravada e não reaparece na próxima', async () => {
    abrir()
    adicionarCrucifixo()
    fireEvent.change(screen.getByLabelText('Carga da série 1 de Crucifixo'), {
      target: { value: '14' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar treino' }))

    await screen.findByText('Treino registrado!')
    expect(screen.queryByLabelText('Carga da série 1 de Crucifixo')).toBeNull()
  })

  it('não oferece exercício que já está na divisão do dia', () => {
    abrir()
    fireEvent.click(screen.getByRole('button', { name: /Adicionar exercício/ }))

    expect(screen.getByRole('button', { name: /^Crucifixo/ })).toBeTruthy()
    // Supino reto já está prescrito hoje: dois cartões do mesmo movimento na
    // mesma sessão só confundiriam quem digita. (O nome exato exclui os botões
    // de marcar série feita, que também citam o exercício.)
    expect(screen.queryByRole('button', { name: /^Supino reto/ })).toBeNull()
  })

  it('remover o avulso tira as séries dele do registro', async () => {
    abrir()
    adicionarCrucifixo()
    fireEvent.change(screen.getByLabelText('Carga da série 1 de Crucifixo'), {
      target: { value: '14' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remover Crucifixo da sessão' }))

    fireEvent.change(screen.getByLabelText('Carga da série 1 de Supino reto'), {
      target: { value: '40' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar treino' }))

    await waitFor(() => expect(criarMock).toHaveBeenCalled())
    expect(criarMock.mock.calls[0][0].sets).toEqual([
      { exerciseId: 'ex-1', setNumber: 1, weightKg: 40, reps: null, rir: null, restSeconds: null, reachedFailure: false },
    ])
  })
})

describe('Execucao — descanso realizado', () => {
  it('registra o descanso real do prescrito e do avulso, incluindo zero', async () => {
    abrir()
    adicionarCrucifixo()

    fireEvent.change(screen.getByLabelText('Repetições da série 1 de Supino reto'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Descanso da série 1 de Supino reto'), {
      target: { value: '75' },
    })
    fireEvent.change(screen.getByLabelText('Repetições da série 1 de Crucifixo'), {
      target: { value: '12' },
    })
    fireEvent.change(screen.getByLabelText('Descanso da série 1 de Crucifixo'), {
      target: { value: '0' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar treino' }))

    await waitFor(() => expect(criarMock).toHaveBeenCalled())
    expect(criarMock.mock.calls[0][0].sets).toEqual([
      { exerciseId: 'ex-1', setNumber: 1, weightKg: null, reps: 10, rir: null, restSeconds: 75, reachedFailure: false },
      { exerciseId: 'ex-2', setNumber: 1, weightKg: null, reps: 12, rir: null, restSeconds: 0, reachedFailure: false },
    ])
    await screen.findByText('Treino registrado!')
    expect((screen.getByLabelText('Descanso da série 1 de Supino reto') as HTMLInputElement).value).toBe('')
  })

  it('usa a prescrição da semana como referência, sem registrá-la como descanso realizado', async () => {
    const detail = plano()
    detail.overrides = [{
      workout_exercise_id: 'we-1', week_number: 2, rest_seconds: 120,
    } as WorkoutWeekOverrideRow]
    planoMock.mockReturnValue({ data: detail, isPending: false, isError: false })
    abrir()

    const descanso = screen.getByLabelText('Descanso da série 1 de Supino reto') as HTMLInputElement
    expect(descanso.placeholder).toBe('90')
    expect(descanso.value).toBe('')
    fireEvent.change(screen.getByLabelText('Semana'), { target: { value: '2' } })
    expect(descanso.placeholder).toBe('120')
    expect(descanso.value).toBe('')
    fireEvent.change(screen.getByLabelText('Repetições da série 1 de Supino reto'), {
      target: { value: '10' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar treino' }))

    await waitFor(() => expect(criarMock).toHaveBeenCalled())
    expect(criarMock.mock.calls[0][0].sets[0].restSeconds).toBeNull()
  })

  it.each(['-1', '1.5', '3601'])('recusa descanso inválido (%s) sem apagar o que foi preenchido', async (valor) => {
    abrir()
    fireEvent.change(screen.getByLabelText('Repetições da série 1 de Supino reto'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Descanso da série 1 de Supino reto'), {
      target: { value: valor },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar treino' }))

    expect(await screen.findByRole('alert')).toHaveProperty('textContent',
      'Informe o descanso em segundos inteiros, de 0 a 3600, ou deixe em branco.')
    expect(criarMock).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Repetições da série 1 de Supino reto') as HTMLInputElement).value).toBe('10')
    expect((screen.getByLabelText('Descanso da série 1 de Supino reto') as HTMLInputElement).value).toBe(valor)
  })

  it('avisa quando o descanso foi registrado sem carga nem repetições', async () => {
    abrir()
    fireEvent.change(screen.getByLabelText('Descanso da série 1 de Supino reto'), {
      target: { value: '60' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar treino' }))

    expect(await screen.findByRole('alert')).toHaveProperty('textContent',
      'Preencha a carga ou as repetições da série em que registrou descanso.')
    expect(criarMock).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Descanso da série 1 de Supino reto') as HTMLInputElement).value).toBe('60')
  })
})

describe('Execucao — falha na série', () => {
  it('registra falha separadamente de RIR 0 e bloqueia RIR ao marcar a falha', async () => {
    abrir()
    fireEvent.change(screen.getByLabelText('Repetições da série 1 de Supino reto'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('RIR da série 1 de Supino reto'), { target: { value: '2' } })
    fireEvent.click(screen.getByLabelText('Falha na série 1 de Supino reto'))
    const rir = screen.getByLabelText('RIR da série 1 de Supino reto') as HTMLInputElement
    expect(rir.value).toBe('0')
    expect(rir.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Repetições da série 2 de Supino reto'), { target: { value: '9' } })
    fireEvent.change(screen.getByLabelText('RIR da série 2 de Supino reto'), { target: { value: '0' } })
    expect((screen.getByLabelText('Falha na série 2 de Supino reto') as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Registrar treino' }))

    await waitFor(() => expect(criarMock).toHaveBeenCalled())
    expect(criarMock.mock.calls[0][0].sets).toEqual([
      expect.objectContaining({ setNumber: 1, rir: 0, reachedFailure: true }),
      expect.objectContaining({ setNumber: 2, rir: 0, reachedFailure: false }),
    ])
    await screen.findByText('Treino registrado!')
    expect((screen.getByLabelText('Falha na série 1 de Supino reto') as HTMLInputElement).checked).toBe(false)
  })

  it('desmarcar falha libera novamente o RIR', () => {
    abrir()
    fireEvent.click(screen.getByLabelText('Falha na série 1 de Supino reto'))
    fireEvent.click(screen.getByLabelText('Falha na série 1 de Supino reto'))
    const rir = screen.getByLabelText('RIR da série 1 de Supino reto') as HTMLInputElement
    expect(rir.disabled).toBe(false)
    fireEvent.change(rir, { target: { value: '1' } })
    expect(rir.value).toBe('1')
  })
})

function sessao() {
  return {
    id: 'log-1', plan_id: 'plan-1', org_id: 'org-1', subject_id: 'subject-1',
    performed_at: '2026-09-08', day_label: 'A', week_number: 1, notes: 'Treino original',
    source: 'student', created_at: '2026-09-08T10:00:00Z', updated_at: '2026-09-08T10:00:00Z',
    client_ref: 'ref-1', client_revision: 1,
  }
}

function carregarSessao() {
  logsMock.mockReturnValue({ data: [sessao()], isPending: false, isError: false, refetch: vi.fn() })
  setsMock.mockReturnValue({ data: [
    { id: 'set-1', exercise_id: 'ex-1', set_number: 1, weight_kg: 40, reps: 10, rir: 1, rest_seconds: 90, reached_failure: false },
    { id: 'set-2', exercise_id: 'ex-1', set_number: 2, weight_kg: 40, reps: 9, rir: 0, rest_seconds: null, reached_failure: null },
  ], isPending: false, isError: false })
}

function editarSessao() {
  fireEvent.click(screen.getByRole('button', { name: /08\/09\/2026.*Treino A/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Editar treino' }))
  return within(screen.getByRole('dialog', { name: 'Editar treino' }))
}

describe('Execucao — editar sessão enviada', () => {
  it('corrige séries, descanso, falha, data e notas sem criar outro treino', async () => {
    carregarSessao()
    abrir()
    const editor = editarSessao()
    expect((editor.getByLabelText('Carga da série 1 de Supino reto') as HTMLInputElement).value).toBe('40')
    fireEvent.change(editor.getByLabelText('Carga da série 1 de Supino reto'), { target: { value: '42' } })
    fireEvent.change(editor.getByLabelText('Descanso da série 1 de Supino reto'), { target: { value: '75' } })
    fireEvent.click(editor.getByLabelText('Falha na série 1 de Supino reto'))
    fireEvent.change(editor.getByLabelText('Data do treino'), { target: { value: '2026-09-07' } })
    fireEvent.change(editor.getByLabelText('Observações'), { target: { value: 'Carga corrigida' } })
    fireEvent.click(editor.getByRole('button', { name: 'Salvar correções' }))

    await screen.findByText('Treino atualizado!')
    expect(criarMock).not.toHaveBeenCalled()
    expect(updateMock).toHaveBeenCalledWith({
      id: 'log-1', expectedUpdatedAt: '2026-09-08T10:00:00Z', performedAt: '2026-09-07', notes: 'Carga corrigida',
      sets: [
        { exerciseId: 'ex-1', setNumber: 1, weightKg: 42, reps: 10, rir: 0, restSeconds: 75, reachedFailure: true },
        { exerciseId: 'ex-1', setNumber: 2, weightKg: 40, reps: 9, rir: 0, restSeconds: null, reachedFailure: null },
      ],
    })
    expect(screen.queryByRole('dialog', { name: 'Editar treino' })).toBeNull()
  })

  it('mantém a versão de abertura após atualizar a lista e preserva correções recusadas', async () => {
    carregarSessao()
    const router = abrir()
    const editor = editarSessao()
    fireEvent.change(editor.getByLabelText('Carga da série 1 de Supino reto'), { target: { value: '44' } })
    logsMock.mockReturnValue({ data: [{ ...sessao(), updated_at: '2026-09-08T11:00:00Z', day_label: 'B' }], isPending: false, isError: false, refetch: vi.fn() })
    await act(async () => { await router.navigate('/avaliados/subject-1/treinos/plan-1/execucao') })
    expect(screen.getByRole('button', { name: /08\/09\/2026.*Treino B/ })).toBeTruthy()
    updateMock.mockRejectedValue(new Error('Registro alterado por outra pessoa. Recarregue antes de salvar.'))
    fireEvent.click(editor.getByRole('button', { name: 'Salvar correções' }))

    expect(await editor.findByRole('alert')).toHaveProperty('textContent', 'Registro alterado por outra pessoa. Recarregue antes de salvar.')
    expect(updateMock.mock.calls[0][0].expectedUpdatedAt).toBe('2026-09-08T10:00:00Z')
    expect((editor.getByLabelText('Carga da série 1 de Supino reto') as HTMLInputElement).value).toBe('44')
    expect(criarMock).not.toHaveBeenCalled()
  })

  it('não oferece edição quando as séries não puderam ser carregadas', () => {
    carregarSessao()
    setsMock.mockReturnValue({ data: undefined, isPending: false, isError: true })
    abrir()
    fireEvent.click(screen.getByRole('button', { name: /08\/09\/2026.*Treino A/ }))
    expect(screen.queryByRole('button', { name: 'Editar treino' })).toBeNull()
  })

  it('acrescenta exercício que faltou no envio à mesma sessão', async () => {
    carregarSessao()
    abrir()
    const editor = editarSessao()
    fireEvent.change(editor.getByLabelText('Adicionar exercício'), { target: { value: 'ex-2' } })
    fireEvent.click(editor.getByRole('button', { name: 'Adicionar exercício' }))
    fireEvent.change(editor.getByLabelText('Carga da série 1 de Crucifixo'), { target: { value: '14' } })
    fireEvent.change(editor.getByLabelText('Repetições da série 1 de Crucifixo'), { target: { value: '12' } })
    fireEvent.change(editor.getByLabelText('Descanso da série 1 de Crucifixo'), { target: { value: '60' } })
    fireEvent.click(editor.getByRole('button', { name: 'Salvar correções' }))

    await screen.findByText('Treino atualizado!')
    expect(criarMock).not.toHaveBeenCalled()
    expect(updateMock.mock.calls[0][0].id).toBe('log-1')
    expect(updateMock.mock.calls[0][0].sets).toHaveLength(3)
    expect(updateMock.mock.calls[0][0].sets[2]).toEqual({
      exerciseId: 'ex-2', setNumber: 1, weightKg: 14, reps: 12, rir: null,
      restSeconds: 60, reachedFailure: false,
    })
  })
})

// A semana gravada aqui escolhe o override aplicado na tela e segue para o
// histórico e para o PDF. Derivá-la da data de criação do plano acertava só
// para o aluno que começa no dia em que o plano foi montado e nunca falta.
describe('semana do mesociclo', () => {
  it('primeira sessão do plano começa na semana 1, e diz por quê', () => {
    abrir()
    expect((screen.getByLabelText('Semana') as HTMLInputElement).value).toBe('1')
    expect(screen.getByText(/Primeira sessão registrada neste plano/)).toBeTruthy()
  })

  it('semana fechada sugere a próxima, sem pular por causa do calendário', () => {
    carregarSessao() // uma sessão na semana 1, e o plano tem 1 divisão
    abrir()
    expect((screen.getByLabelText('Semana') as HTMLInputElement).value).toBe('2')
    expect(screen.getByText(/A semana 1 fechou \(1 de 1 sessão\)/)).toBeTruthy()
  })

  it('repetir a semana é um clique, e a escolha manda', () => {
    carregarSessao()
    abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Repetir a semana 1' }))
    expect((screen.getByLabelText('Semana') as HTMLInputElement).value).toBe('1')
    // e dá para voltar atrás
    fireEvent.click(screen.getByRole('button', { name: 'Usar a semana 2' }))
    expect((screen.getByLabelText('Semana') as HTMLInputElement).value).toBe('2')
  })

  it('grava a semana sugerida sem o educador precisar digitar', async () => {
    carregarSessao()
    abrir()
    fireEvent.change(screen.getByLabelText('Carga da série 1 de Supino reto'), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText('Repetições da série 1 de Supino reto'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar treino' }))
    await screen.findByText('Treino registrado!')
    expect(criarMock.mock.calls[0][0].weekNumber).toBe(2)
  })

  it('sem as sessões carregadas não inventa semana nenhuma', () => {
    logsMock.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch: vi.fn() })
    abrir()
    expect((screen.getByLabelText('Semana') as HTMLInputElement).value).toBe('')
    expect(screen.queryByText(/Primeira sessão registrada/)).toBeNull()
  })

  it('mostra a defasagem entre o mesociclo e o calendário', () => {
    const detail = plano()
    detail.plan!.starts_on = '2026-01-05'
    planoMock.mockReturnValue({ data: detail, isPending: false, isError: false })
    abrir()
    expect(screen.getByText(/Semana do mesociclo:/)).toBeTruthy()
    expect(screen.getByText(/atrás do calendário/)).toBeTruthy()
  })
})

// Quem fica com o celular na mão entre as séries é o profissional que conduz
// a sessão. O campo de descanso existe desde a 0032, mas dependia de alguém
// cronometrar de cabeça e digitar — na prática, um dado que nascia chutado.
describe('cronômetro de descanso', () => {
  it('marcar a série feita começa a contar, e o toque seguinte grava o descanso', () => {
    vi.useFakeTimers()
    try {
      abrir()
      fireEvent.click(screen.getByRole('button', { name: 'Série 1 de Supino reto feita' }))
      expect(screen.getByRole('timer').textContent).toBe('0:00')
      act(() => { vi.advanceTimersByTime(75_000) })
      expect(screen.getByRole('timer').textContent).toBe('1:15')

      fireEvent.click(screen.getByRole('button', { name: 'Começou a série' }))
      expect((screen.getByLabelText('Descanso da série 1 de Supino reto') as HTMLInputElement).value).toBe('75')
      expect(screen.queryByRole('timer')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('desmarcar a série cancela a contagem sem gravar nada', () => {
    abrir()
    const marcar = screen.getByRole('button', { name: 'Série 1 de Supino reto feita' })
    fireEvent.click(marcar)
    expect(screen.getByRole('timer')).toBeTruthy()
    fireEvent.click(marcar)
    expect(screen.queryByRole('timer')).toBeNull()
    expect((screen.getByLabelText('Descanso da série 1 de Supino reto') as HTMLInputElement).value).toBe('')
  })

  it('a série seguinte reinicia a contagem a partir dela', () => {
    vi.useFakeTimers()
    try {
      abrir()
      fireEvent.click(screen.getByRole('button', { name: 'Série 1 de Supino reto feita' }))
      act(() => { vi.advanceTimersByTime(40_000) })
      fireEvent.click(screen.getByRole('button', { name: 'Série 2 de Supino reto feita' }))
      expect(screen.getByRole('timer').textContent).toBe('0:00')
      // nada foi gravado na série 1: o intervalo entre duas séries concluídas
      // inclui a execução da segunda, e não é descanso
      expect((screen.getByLabelText('Descanso da série 1 de Supino reto') as HTMLInputElement).value).toBe('')
      expect(screen.getByText(/descanso desde a série 2 de Supino reto/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('avisa quando o descanso prescrito foi cumprido', () => {
    vi.useFakeTimers()
    try {
      abrir() // prescrição do fixture: 90 s
      fireEvent.click(screen.getByRole('button', { name: 'Série 1 de Supino reto feita' }))
      expect(screen.getByText(/alvo 90s/)).toBeTruthy()
      act(() => { vi.advanceTimersByTime(90_000) })
      expect(screen.getByText(/alvo de 90s cumprido/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })
})
