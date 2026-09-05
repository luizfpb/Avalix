import { describe, expect, it } from 'vitest'
import { identidadeDaSessao, reconciliarRascunho, type PlanoVigente } from './studentDraft'
import type { StudentDay, StudentExercise } from './studentApi'
import type { DraftSession } from './studentStore'

// O cenário que motiva este módulo: o treinador salva uma edição do plano
// enquanto o aluno treina. `replace_workout_plan_children` apaga e recria as
// divisões e os exercícios, então TODOS os ids filhos mudam — mesmo quando o
// exercício do catálogo continua igual. Sem reconciliação, o aparelho do aluno
// reconectava, recebia os ids novos e descartava o rascunho inteiro.

function ex(patch: Partial<StudentExercise> & { id: string; exercise_id: string }): StudentExercise {
  return {
    day_id: 'd1',
    name: 'Exercício',
    position: 0,
    sets: 3,
    reps: '10',
    rir: 2,
    rest_seconds: 60,
    tempo: null,
    notes: null,
    ...patch,
  }
}

const DIA_A: StudentDay = { id: 'd1', label: 'A', name: 'Superiores', position: 0 }
const DIA_B: StudentDay = { id: 'd2', label: 'B', name: 'Inferiores', position: 1 }

function rascunho(patch: Partial<DraftSession> = {}): DraftSession {
  return {
    clientRef: 'ref-1',
    revision: 2,
    planId: 'p1',
    dayId: 'd1',
    weekNumber: 1,
    performedAt: '2026-09-04',
    notes: '',
    rows: { we1: [{ weight: '40', reps: '10', rir: '2' }] },
    identity: { dayLabel: 'A', rowExercises: { we1: 'cat-supino' } },
    ...patch,
  }
}

describe('reconciliarRascunho', () => {
  it('reencontra divisão e linhas pelos ids novos depois de o plano ser regravado', () => {
    const plano: PlanoVigente = {
      // mesma divisão A, mesmo supino do catálogo — ids todos novos
      days: [{ ...DIA_A, id: 'd1-novo' }],
      exercises: [ex({ id: 'we1-novo', day_id: 'd1-novo', exercise_id: 'cat-supino' })],
    }

    const r = reconciliarRascunho(rascunho(), plano)

    expect(r).not.toBeNull()
    expect(r!.draft.dayId).toBe('d1-novo')
    expect(r!.draft.rows['we1-novo'][0].weight).toBe('40')
    expect(r!.remapeado).toBe(true)
    expect(r!.perdidas).toBe(0)
  })

  it('não mexe em nada quando o plano continua igual', () => {
    const plano: PlanoVigente = {
      days: [DIA_A],
      exercises: [ex({ id: 'we1', exercise_id: 'cat-supino' })],
    }

    const r = reconciliarRascunho(rascunho(), plano)!

    expect(r.remapeado).toBe(false)
    expect(r.draft.rows.we1[0].weight).toBe('40')
  })

  it('preserva os avulsos e os remapeia junto', () => {
    const draft = rascunho({
      rows: {
        we1: [{ weight: '40', reps: '10', rir: '2' }],
        we9: [{ weight: '100', reps: '5', rir: '1' }],
      },
      extras: ['we9'],
      identity: {
        dayLabel: 'A',
        rowExercises: { we1: 'cat-supino', we9: 'cat-agacho' },
      },
    })
    const plano: PlanoVigente = {
      days: [{ ...DIA_A, id: 'd1-novo' }, { ...DIA_B, id: 'd2-novo' }],
      exercises: [
        ex({ id: 'we1-novo', day_id: 'd1-novo', exercise_id: 'cat-supino' }),
        ex({ id: 'we9-novo', day_id: 'd2-novo', exercise_id: 'cat-agacho' }),
      ],
    }

    const r = reconciliarRascunho(draft, plano)!

    expect(r.draft.extras).toEqual(['we9-novo'])
    expect(r.draft.rows['we9-novo'][0].weight).toBe('100')
  })

  it('linha cujo exercício mudou de divisão vira avulso, em vez de sumir', () => {
    const plano: PlanoVigente = {
      days: [DIA_A, DIA_B],
      // o supino foi movido para a divisão B na edição do plano
      exercises: [ex({ id: 'we1-novo', day_id: 'd2', exercise_id: 'cat-supino' })],
    }

    const r = reconciliarRascunho(rascunho(), plano)!

    expect(r.draft.dayId).toBe('d1')
    expect(r.draft.extras).toEqual(['we1-novo'])
    expect(r.draft.rows['we1-novo'][0].weight).toBe('40')
    expect(r.perdidas).toBe(0)
  })

  it('conta as séries perdidas quando o exercício saiu do plano — sem chutar substituto', () => {
    const plano: PlanoVigente = {
      days: [DIA_A],
      exercises: [ex({ id: 'we2', exercise_id: 'cat-remada' })],
    }

    const r = reconciliarRascunho(rascunho(), plano)!

    expect(r.draft.rows).toEqual({})
    expect(r.perdidas).toBe(1)
    // nada foi atribuído à remada: registro no movimento errado é pior que perda
    expect(r.draft.rows['we2']).toBeUndefined()
  })

  it('devolve null quando a divisão inteira deixou de existir', () => {
    const plano: PlanoVigente = {
      days: [DIA_B],
      exercises: [ex({ id: 'we9', day_id: 'd2', exercise_id: 'cat-agacho' })],
    }

    expect(reconciliarRascunho(rascunho(), plano)).toBeNull()
  })

  it('rascunho antigo (sem identidade) ainda é aceito quando os ids batem', () => {
    const draft = rascunho({ identity: undefined })
    const plano: PlanoVigente = {
      days: [DIA_A],
      exercises: [ex({ id: 'we1', exercise_id: 'cat-supino' })],
    }

    const r = reconciliarRascunho(draft, plano)!

    expect(r.draft.rows.we1[0].weight).toBe('40')
    expect(r.remapeado).toBe(false)
  })

  it('duas chaves antigas no mesmo destino: fica a que tem mais registro', () => {
    const draft = rascunho({
      rows: {
        we1: [{ weight: '', reps: '', rir: '' }],
        we2: [{ weight: '40', reps: '10', rir: '2' }],
      },
      identity: {
        dayLabel: 'A',
        rowExercises: { we1: 'cat-supino', we2: 'cat-supino' },
      },
    })
    const plano: PlanoVigente = {
      days: [DIA_A],
      exercises: [ex({ id: 'we-novo', exercise_id: 'cat-supino' })],
    }

    const r = reconciliarRascunho(draft, plano)!

    expect(r.draft.rows['we-novo'][0].weight).toBe('40')
  })
})

describe('identidadeDaSessao', () => {
  it('grava o rótulo da divisão e o exercício do catálogo de cada linha', () => {
    const identidade = identidadeDaSessao(
      [DIA_A, DIA_B],
      'd1',
      { we1: [], we9: [] },
      [
        ex({ id: 'we1', exercise_id: 'cat-supino' }),
        ex({ id: 'we9', day_id: 'd2', exercise_id: 'cat-agacho' }),
      ]
    )

    expect(identidade).toEqual({
      dayLabel: 'A',
      rowExercises: { we1: 'cat-supino', we9: 'cat-agacho' },
    })
  })

  it('ignora chave que não existe mais no pacote, em vez de gravar lixo', () => {
    const identidade = identidadeDaSessao([DIA_A], 'd1', { sumiu: [] }, [])

    expect(identidade).toEqual({ dayLabel: 'A', rowExercises: {} })
  })
})
