import { describe, expect, it } from 'vitest'
import {
  execucaoContentKey,
  execucaoHasContent,
  isExecucaoDraft,
  reconcileExecucaoDraft,
  sessionToForm,
  type ExecucaoDraft,
} from './execucaoDraft'

const linha = (weight = '', reps = '') => ({ weight, reps, rir: '', rest: '', failure: false })

function rascunho(over: Partial<ExecucaoDraft> = {}): ExecucaoDraft {
  return {
    version: 1,
    dayKey: 'dia-a',
    dayLabel: 'A',
    date: '2026-09-20',
    week: '2',
    weekTouched: false,
    notes: '',
    sets: { 'we-supino': [linha('40', '10'), linha()] },
    rowExercises: { 'we-supino': 'cat-supino' },
    extras: [],
    restTimer: null,
    ...over,
  }
}

const plano = {
  days: [{ id: 'dia-a', label: 'A' }, { id: 'dia-b', label: 'B' }],
  exercises: [
    { id: 'we-supino', day_id: 'dia-a', exercise_id: 'cat-supino' },
    { id: 'we-remada', day_id: 'dia-b', exercise_id: 'cat-remada' },
  ],
}

describe('execucaoHasContent', () => {
  it('sessão sem nada digitado não é rascunho', () => {
    expect(execucaoHasContent({ sets: { x: [linha(), linha()] }, extras: [], notes: '  ' })).toBe(false)
  })

  it('série marcada como feita, observação ou avulso contam', () => {
    expect(execucaoHasContent({ sets: { x: [{ ...linha(), done: true }] }, extras: [], notes: '' })).toBe(true)
    expect(execucaoHasContent({ sets: {}, extras: [], notes: 'dor no ombro' })).toBe(true)
    expect(execucaoHasContent({ sets: {}, extras: [{ rowId: 'extra:1', exerciseId: 'c' }], notes: '' })).toBe(true)
  })
})

describe('sessionToForm', () => {
  it('põe cada série na linha do exercício, na posição do número, marcada como feita', () => {
    const form = sessionToForm({ day_label: 'A' }, [
      { exercise_id: 'cat-supino', set_number: 2, weight_kg: 42.5, reps: 8, rir: 0, reached_failure: true },
      { exercise_id: 'cat-supino', set_number: 1, weight_kg: 40, reps: 10, rir: 2, rest_seconds: 90 },
      { exercise_id: 'cat-crucifixo', set_number: 1, weight_kg: 14, reps: 12, rir: null },
    ], plano)
    expect(form.dayKey).toBe('dia-a')
    expect(form.sets['we-supino']).toEqual([
      { weight: '40', reps: '10', rir: '2', rest: '90', failure: false, done: true },
      { weight: '42.5', reps: '8', rir: '0', rest: '', failure: true, done: true },
    ])
    // fora da divisão, volta como avulso
    expect(form.extras).toEqual([{ rowId: 'extra:cat-crucifixo', exerciseId: 'cat-crucifixo' }])
    expect(form.sets['extra:cat-crucifixo'][0].weight).toBe('14')
  })
})

describe('execucaoContentKey', () => {
  it('ignora linhas vazias e a ordem: mesma sessão, mesma chave', () => {
    const base = rascunho()
    const comLinhasVazias = rascunho({ sets: { 'we-supino': [linha('40', '10'), linha(), linha()] } })
    expect(execucaoContentKey(comLinhasVazias)).toBe(execucaoContentKey(base))
  })

  it('muda quando uma série muda', () => {
    const outra = rascunho({ sets: { 'we-supino': [linha('42', '10')] } })
    expect(execucaoContentKey(outra)).not.toBe(execucaoContentKey(rascunho()))
  })
})

describe('isExecucaoDraft', () => {
  it('recusa o que não é um rascunho desta versão', () => {
    expect(isExecucaoDraft(rascunho())).toBe(true)
    expect(isExecucaoDraft({ ...rascunho(), version: 2 })).toBe(false)
    expect(isExecucaoDraft(null)).toBe(false)
    expect(isExecucaoDraft({ dayKey: 'x' })).toBe(false)
  })
})

describe('reconcileExecucaoDraft', () => {
  it('com o plano igual, devolve o rascunho como estava', () => {
    const { draft, lostRows } = reconcileExecucaoDraft(rascunho(), plano)
    expect(lostRows).toBe(0)
    expect(draft.dayKey).toBe('dia-a')
    expect(draft.sets['we-supino'][0].weight).toBe('40')
  })

  // Regravar o plano troca todos os ids de dias e exercícios.
  it('remapeia pelo rótulo da divisão e pelo exercício do catálogo', () => {
    const regravado = {
      days: [{ id: 'dia-a2', label: 'A' }],
      exercises: [{ id: 'we-supino2', day_id: 'dia-a2', exercise_id: 'cat-supino' }],
    }
    const { draft, lostRows } = reconcileExecucaoDraft(
      rascunho({
        restTimer: { rowId: 'we-supino', index: 0, name: 'Supino', targetSeconds: 90, startedAt: 1 },
      }),
      regravado
    )
    expect(lostRows).toBe(0)
    expect(draft.dayKey).toBe('dia-a2')
    expect(draft.sets['we-supino2'][0]).toMatchObject({ weight: '40', reps: '10' })
    expect(draft.sets['we-supino']).toBeUndefined()
    expect(draft.restTimer?.rowId).toBe('we-supino2')
  })

  it('conta as séries do exercício que saiu do plano, sem chutar substituto', () => {
    const semSupino = {
      days: [{ id: 'dia-a', label: 'A' }],
      exercises: [{ id: 'we-crucifixo', day_id: 'dia-a', exercise_id: 'cat-crucifixo' }],
    }
    const { draft, lostRows } = reconcileExecucaoDraft(
      rascunho({ restTimer: { rowId: 'we-supino', index: 0, name: 'Supino', targetSeconds: 90, startedAt: 1 } }),
      semSupino
    )
    expect(lostRows).toBe(1)
    expect(draft.sets).toEqual({})
    expect(draft.restTimer).toBeNull()
  })

  it('avulsos atravessam a regravação: apontam para o catálogo', () => {
    const { draft } = reconcileExecucaoDraft(
      rascunho({
        sets: { 'extra:1': [linha('14', '12')] },
        extras: [{ rowId: 'extra:1', exerciseId: 'cat-crucifixo' }],
      }),
      { days: [{ id: 'novo', label: 'A' }], exercises: [] }
    )
    expect(draft.sets['extra:1'][0].weight).toBe('14')
    expect(draft.extras).toHaveLength(1)
  })
})

describe('ordem e exercícios tirados da sessão', () => {
  it('série de exercício tirado da sessão não conta como conteúdo nem muda a chave', () => {
    const base = { sets: { 'we-supino': [linha('40', '10')] }, extras: [], notes: '' }
    expect(execucaoHasContent({ ...base, skipped: ['we-supino'] })).toBe(false)
    const chave = (over: Partial<ExecucaoDraft>) => execucaoContentKey(rascunho(over))
    expect(chave({ skipped: ['we-supino'] })).toBe(chave({ sets: {} }))
    // a ordem não é registrada: mudar a ordem não é mudança a salvar
    expect(chave({ order: ['we-supino'] })).toBe(chave({}))
  })

  it('acompanham a linha quando o plano foi regravado', () => {
    const regravado = {
      days: [{ id: 'dia-a2', label: 'A' }],
      exercises: [{ id: 'we-supino-2', day_id: 'dia-a2', exercise_id: 'cat-supino' }],
    }
    const { draft } = reconcileExecucaoDraft(
      rascunho({
        extras: [{ rowId: 'extra:1', exerciseId: 'cat-crucifixo' }],
        order: ['extra:1', 'we-supino', 'we-sumiu'],
        skipped: ['we-supino'],
      }),
      regravado
    )
    expect(draft.order).toEqual(['extra:1', 'we-supino-2'])
    expect(draft.skipped).toEqual(['we-supino-2'])
  })
})
