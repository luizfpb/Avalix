// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouterProvider, createMemoryRouter } from 'react-router'
import TreinoNovo from './TreinoNovo'
import { setPrivateDraftScope } from '../lib/draft'
import type { SaveWorkoutPlanInput, WorkoutPlanDetail } from '../features/workout/api'

// O builder é a tela mais longa do app e não tinha teste. Estes fixam as duas
// regras novas onde elas de fato acontecem — na interação, não no módulo puro:
// reps/RIR podem ficar em branco e chegam ao payload como null, e agrupar dois
// exercícios produz um bloco válido para o banco.

const { criarMock, atualizarMock, planoMock } = vi.hoisted(() => ({
  criarMock: vi.fn(),
  atualizarMock: vi.fn(),
  planoMock: vi.fn(),
}))

vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org-1' } }),
}))

vi.mock('../features/subjects/hooks', () => ({
  useSubject: () => ({
    data: { id: 'subject-1', full_name: 'Pessoa Teste' },
    isPending: false,
    isError: false,
  }),
}))

const exercicio = (id: string, name: string, primary_muscle: string) => ({
  id,
  org_id: null,
  name,
  primary_muscle,
  secondary_muscles: [],
  equipment: 'barbell',
  movement_pattern: 'horizontal_push',
  is_unilateral: false,
  cues: null,
  created_by: null,
  created_at: 'x',
})

vi.mock('../features/workout/hooks', () => ({
  useExercises: () => ({
    data: [
      exercicio('ex-1', 'Supino reto', 'chest'),
      exercicio('ex-2', 'Crucifixo', 'chest'),
    ],
    isPending: false,
    isError: false,
  }),
  useWorkoutPlan: () => planoMock(),
  useWorkoutPlans: () => ({ data: [] }),
  useCreateWorkoutPlan: () => ({ mutateAsync: criarMock, isPending: false }),
  useUpdateWorkoutPlan: () => ({ mutateAsync: atualizarMock, isPending: false }),
  useCreateCustomExercise: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCustomExercise: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('../features/anamnesis/hooks', () => ({
  useAnamneses: () => ({ data: [], isPending: false, isError: false }),
}))

vi.mock('../features/assessment/hooks', () => ({
  useAssessments: () => ({ data: [] }),
}))

vi.mock('../features/posture/hooks', () => ({
  useSessions: () => ({ data: [] }),
}))

vi.mock('../features/auth/context', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

// Sem escopo (usuario + organizacao) o modulo de rascunho se recusa a gravar,
// de proposito - no app quem o define e o bootstrap de privacidade da sessao.
beforeEach(() => {
  localStorage.clear()
  setPrivateDraftScope('user-1', 'org-1')
  criarMock.mockReset().mockResolvedValue({ id: 'plan-1' })
  atualizarMock.mockReset().mockResolvedValue({ id: 'plan-1' })
  planoMock.mockReset().mockReturnValue({ data: null, isPending: false, isError: false })
})
afterEach(cleanup)

// data router (createMemoryRouter), e não MemoryRouter: é o que o app usa em
// produção e o que a guarda de saída não salva exige (useBlocker).
function abrir(rota = '/avaliados/subject-1/treinos/nova') {
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/avaliados/:id/treinos/nova', element: <TreinoNovo /> },
          { path: '/avaliados/:id/treinos/:planId/editar', element: <TreinoNovo /> },
          { path: '/avaliados/:id', element: <div>perfil do avaliado</div> },
          { path: '/avaliados/:id/treinos/:planId', element: <div>detalhe do plano</div> },
        ],
        { initialEntries: [rota] }
      )}
    />
  )
}

// Plano salvo com uma divisao e um exercicio, para exercitar o modo edicao.
function planoSalvo(): WorkoutPlanDetail {
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
      {
        id: 'day-1', org_id: 'org-1', plan_id: 'plan-1', label: 'A', name: 'Peito',
        position: 0, created_at: 'x',
      },
    ],
    exercises: [
      {
        id: 'we-1', org_id: 'org-1', day_id: 'day-1', exercise_id: 'ex-1', position: 0,
        sets: 4, reps: '8-12', rir: 2, rest_seconds: 90, tempo: null, notes: null,
        group_key: null, group_kind: null, technique: null, created_at: 'x',
      },
    ],
    overrides: [],
    weeks: [],
  } as unknown as WorkoutPlanDetail
}

// Divisão A com os dois exercícios do catálogo, na ordem.
function montarDivisaoComDoisExercicios() {
  fireEvent.click(screen.getByRole('button', { name: /Adicionar divisão/ }))
  for (const nome of ['Supino reto', 'Crucifixo']) {
    fireEvent.click(screen.getByRole('button', { name: /Adicionar exercício/ }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(nome) }))
  }
}

function salvar() {
  fireEvent.change(screen.getByLabelText('Nome do plano'), { target: { value: 'Plano A' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar plano' }))
}

describe('TreinoNovo — reps e RIR em branco', () => {
  it('salva sem faixa de reps e sem RIR, em vez de recusar', async () => {
    abrir()
    montarDivisaoComDoisExercicios()

    fireEvent.change(screen.getByLabelText('Repetições de Supino reto na divisão A'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByLabelText('RIR de Supino reto na divisão A'), {
      target: { value: '' },
    })
    salvar()

    await vi.waitFor(() => expect(criarMock).toHaveBeenCalled())
    const enviado = criarMock.mock.calls[0][0] as SaveWorkoutPlanInput
    expect(enviado.days[0].exercises[0].reps).toBeNull()
    expect(enviado.days[0].exercises[0].rir).toBeNull()
    // o segundo exercício não foi tocado e mantém a prescrição padrão
    expect(enviado.days[0].exercises[1].reps).toBe('8-12')
  })
})

describe('TreinoNovo — agrupamentos', () => {
  it('agrupa dois exercícios numa super-série e grava o bloco', async () => {
    abrir()
    montarDivisaoComDoisExercicios()

    fireEvent.click(
      screen.getByRole('button', { name: 'Agrupar Crucifixo com o exercício acima' })
    )
    // o rótulo do bloco também é uma opção do select de tipo; a instrução de
    // execução é o que só existe no cabeçalho desenhado
    expect(screen.getByText(/sem descanso entre eles/)).toBeTruthy()
    salvar()

    await vi.waitFor(() => expect(criarMock).toHaveBeenCalled())
    const [a, b] = (criarMock.mock.calls[0][0] as SaveWorkoutPlanInput).days[0].exercises
    expect(a.groupKey).toBeTruthy()
    expect(a.groupKey).toBe(b.groupKey)
    expect([a.groupKind, b.groupKind]).toEqual(['superset', 'superset'])
  })

  it('troca o bloco para circuito e avisa quando as voltas divergem', () => {
    abrir()
    montarDivisaoComDoisExercicios()
    fireEvent.click(
      screen.getByRole('button', { name: 'Agrupar Crucifixo com o exercício acima' })
    )

    fireEvent.change(
      screen.getByLabelText('Tipo do bloco que começa em Supino reto'),
      { target: { value: 'circuit' } }
    )
    expect(screen.getByText(/no fim de cada volta/)).toBeTruthy()
    expect(screen.queryByText(/as séries de cada exercício são as voltas/)).toBeNull()

    // no circuito, séries = voltas: membros com séries diferentes são ambíguos
    fireEvent.change(screen.getByLabelText('Séries de Crucifixo na divisão A'), {
      target: { value: '5' },
    })
    expect(screen.getByText(/as séries de cada exercício são as voltas/)).toBeTruthy()
  })

  it('desagrupar desfaz o par', () => {
    abrir()
    montarDivisaoComDoisExercicios()
    fireEvent.click(
      screen.getByRole('button', { name: 'Agrupar Crucifixo com o exercício acima' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Tirar Crucifixo do bloco' }))
    expect(screen.queryByLabelText(/^Tipo do bloco/)).toBeNull()
  })

  it('a técnica de intensidade fica no exercício, e não no bloco', async () => {
    abrir()
    montarDivisaoComDoisExercicios()

    const selectTecnica = screen.getByLabelText(
      'Técnica de intensidade de Supino reto na divisão A'
    )
    fireEvent.change(selectTecnica, { target: { value: 'drop_set' } })
    expect((selectTecnica as HTMLSelectElement).value).toBe('drop_set')
    salvar()

    await vi.waitFor(() => expect(criarMock).toHaveBeenCalled())
    const enviado = criarMock.mock.calls[0][0] as SaveWorkoutPlanInput
    expect(enviado.days[0].exercises[0].technique).toBe('drop_set')
    expect(enviado.days[0].exercises[1].technique).toBeNull()
  })
})

// O pedido foi "salvar automaticamente". O que o app faz e guardar o rascunho no
// aparelho e nunca deixar sair em silencio: publicar edicao pela metade num
// plano que o aluno le pelo link seria pior do que perder o trabalho.
describe('TreinoNovo - nao perder o que foi editado', () => {
  it('pergunta antes de sair com alteracao pendente e deixa continuar editando', async () => {
    abrir()
    montarDivisaoComDoisExercicios()

    fireEvent.click(screen.getByRole('link', { name: 'Cancelar' }))

    expect(await screen.findByText('Sair sem salvar?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
    await vi.waitFor(() => expect(screen.queryByText('Sair sem salvar?')).toBeNull())
    expect(screen.getByLabelText('Nome do plano')).toBeTruthy()
  })

  it('nao pergunta nada depois de salvar', async () => {
    abrir()
    montarDivisaoComDoisExercicios()
    salvar()

    await vi.waitFor(() => expect(criarMock).toHaveBeenCalled())
    expect(await screen.findByText('detalhe do plano')).toBeTruthy()
    expect(screen.queryByText('Sair sem salvar?')).toBeNull()
  })

  it('recupera o rascunho da EDICAO ao reabrir o plano', async () => {
    planoMock.mockReturnValue({ data: planoSalvo(), isPending: false, isError: false })
    abrir('/avaliados/subject-1/treinos/plan-1/editar')

    fireEvent.change(screen.getByLabelText('Nome do plano'), {
      target: { value: 'Mesociclo A bloco 2' },
    })
    expect(screen.getByText(/Alteracoes|Alterações/)).toBeTruthy()
    // o rascunho grava com debounce
    await new Promise((resolve) => setTimeout(resolve, 900))
    cleanup()

    abrir('/avaliados/subject-1/treinos/plan-1/editar')
    const nome = await screen.findByLabelText('Nome do plano')
    expect((nome as HTMLInputElement).value).toBe('Mesociclo A bloco 2')
    expect(screen.getByText(/Rascunho não salvo recuperado/)).toBeTruthy()
  })

  it('descarta rascunho feito contra outra versao do plano', async () => {
    planoMock.mockReturnValue({ data: planoSalvo(), isPending: false, isError: false })
    abrir('/avaliados/subject-1/treinos/plan-1/editar')
    fireEvent.change(screen.getByLabelText('Nome do plano'), {
      target: { value: 'Rascunho velho' },
    })
    await new Promise((resolve) => setTimeout(resolve, 900))
    cleanup()

    // o plano mudou no servidor (outro dispositivo): o rascunho anterior nao
    // pode voltar por cima do que foi salvo la
    const maisNovo = planoSalvo()
    maisNovo.plan = {
      ...maisNovo.plan!,
      updated_at: '2026-08-02T10:00:00Z',
      name: 'Mesociclo A v2',
    }
    planoMock.mockReturnValue({ data: maisNovo, isPending: false, isError: false })
    abrir('/avaliados/subject-1/treinos/plan-1/editar')

    const nome = await screen.findByLabelText('Nome do plano')
    expect((nome as HTMLInputElement).value).toBe('Mesociclo A v2')
    expect(screen.queryByText(/Rascunho não salvo recuperado/)).toBeNull()
  })
})
