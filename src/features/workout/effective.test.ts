import { describe, it, expect } from 'vitest'
import {
  effectiveDiff,
  effectivePrescription,
  overrideFor,
  overrideIndex,
} from './effective'
import type { WorkoutExerciseRow, WorkoutWeekOverrideRow } from './api'

// A página do aluno precisa do valor FINAL a executar; o PDF e o WhatsApp
// precisam do "o que muda". Os dois vêm daqui, para não haver uma terceira
// interpretação de override no app — que é como o texto de WhatsApp já
// contradisse o PDF do mesmo plano uma vez.

const base = {
  id: 'we1',
  day_id: 'd1',
  exercise_id: 'x1',
  position: 0,
  sets: 4,
  reps: '8-12',
  rir: 2,
  rest_seconds: 90,
  tempo: '2-0-2',
  notes: null,
} as unknown as WorkoutExerciseRow

const over = (o: Partial<WorkoutWeekOverrideRow>) =>
  ({
    id: 'o1',
    workout_exercise_id: 'we1',
    week_number: 2,
    sets: null,
    reps: null,
    rir: null,
    rest_seconds: null,
    is_skipped: false,
    notes: null,
    ...o,
  }) as unknown as WorkoutWeekOverrideRow

describe('effectivePrescription', () => {
  it('sem override, vale a base inteira', () => {
    expect(effectivePrescription(base)).toEqual({
      sets: 4,
      reps: '8-12',
      rir: 2,
      restSeconds: 90,
      notes: null,
      skipped: false,
    })
  })

  it('campo nulo no override NÃO apaga o valor da base', () => {
    // é assim que o builder grava: só o campo tocado vai preenchido. Tratar
    // null como "zerar" faria a semana com override de séries perder reps,
    // RIR e descanso na tela do aluno.
    const e = effectivePrescription(base, over({ sets: 6 }))
    expect(e.sets).toBe(6)
    expect(e.reps).toBe('8-12')
    expect(e.rir).toBe(2)
    expect(e.restSeconds).toBe(90)
  })

  it('sobrescreve todos os campos quando todos vêm preenchidos', () => {
    const e = effectivePrescription(
      base,
      over({ sets: 5, reps: '6-10', rir: 1, rest_seconds: 120, notes: 'progredir carga' })
    )
    expect(e).toEqual({
      sets: 5,
      reps: '6-10',
      rir: 1,
      restSeconds: 120,
      notes: 'progredir carga',
      skipped: false,
    })
  })

  it('exercício pulado na semana é marcado como tal', () => {
    expect(effectivePrescription(base, over({ is_skipped: true })).skipped).toBe(true)
  })

  it('rir 0 é valor, não ausência', () => {
    // RIR 0 (até a falha) é prescrição comum em semana de choque; se o código
    // tratasse 0 como falsy, a semana mais pesada apareceria com o RIR da base
    expect(effectivePrescription(base, over({ rir: 0 })).rir).toBe(0)
  })
})

describe('effectiveDiff', () => {
  it('semana sem alteração não gera linha', () => {
    expect(effectiveDiff(base)).toEqual([])
    expect(effectiveDiff(base, over({}))).toEqual([])
  })

  it('override que repete a base não gera linha', () => {
    expect(effectiveDiff(base, over({ sets: 4, reps: '8-12', rir: 2, rest_seconds: 90 }))).toEqual(
      []
    )
  })

  it('descreve só o que muda', () => {
    expect(effectiveDiff(base, over({ sets: 6, reps: '8-12' }))).toEqual(['6 séries'])
  })

  it('pulado tem precedência sobre o resto', () => {
    expect(effectiveDiff(base, over({ is_skipped: true, sets: 9 }))).toEqual(['não executar'])
  })

  it('séries fracionadas saem com uma casa', () => {
    expect(effectiveDiff(base, over({ sets: 2.5 }))).toEqual(['2.5 séries'])
  })

  it('nota da semana entra quando difere da nota do exercício', () => {
    expect(effectiveDiff(base, over({ notes: 'progredir carga' }))).toEqual(['progredir carga'])
  })
})

describe('overrideIndex', () => {
  const overrides = [
    over({ id: 'a', week_number: 2, sets: 6 }),
    over({ id: 'b', week_number: 3, workout_exercise_id: 'we2', sets: 5 }),
  ]

  it('acha o override da semana e do exercício certos', () => {
    const index = overrideIndex(overrides)
    expect(overrideFor(index, 2, 'we1')?.id).toBe('a')
    expect(overrideFor(index, 3, 'we2')?.id).toBe('b')
  })

  it('não vaza override de outra semana nem de outro exercício', () => {
    const index = overrideIndex(overrides)
    expect(overrideFor(index, 3, 'we1')).toBeNull()
    expect(overrideFor(index, 2, 'we2')).toBeNull()
    expect(overrideFor(index, null, 'we1')).toBeNull()
  })
})
