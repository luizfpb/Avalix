import { describe, expect, it } from 'vitest'
import {
  ensureLogRows,
  isLoggedRow,
  reconcileSetRows,
  tallySession,
  updateLogRow,
  validateLogRows,
  validateRestRows,
} from './logRows'

describe('ensureLogRows', () => {
  it('cria todas as 20 séries admitidas pela prescrição', () => {
    expect(ensureLogRows({}, [{ id: 'a', sets: 20 }]).a).toHaveLength(20)
    expect(reconcileSetRows([], 20)).toHaveLength(20)
  })
  it('preserva séries digitadas ao inicializar outra divisão', () => {
    const divisionA = { a1: [{ weight: '40', reps: '10', rir: '2' }] }
    const withDivisionB = ensureLogRows(divisionA, [{ id: 'b1', sets: 2 }])

    expect(withDivisionB.a1).toEqual(divisionA.a1)
    expect(withDivisionB.b1).toHaveLength(2)
    expect(withDivisionB.b1[0]).toEqual({ weight: '', reps: '', rir: '', rest: '', failure: false })
  })

  it('não reinicializa uma divisão já preenchida', () => {
    const previous = { b1: [{ weight: '20', reps: '12', rir: '3' }] }
    expect(ensureLogRows(previous, [{ id: 'b1', sets: 4 }]).b1).toEqual(previous.b1)
  })
})

describe('falha separada do RIR', () => {
  it('marcar falha define RIR 0; desmarcar conserva zero sem falha', () => {
    const marked = updateLogRow({ weight: '40', reps: '10', rir: '2' }, 'failure', true)
    expect(marked).toMatchObject({ failure: true, rir: '0' })
    expect(updateLogRow(marked, 'failure', false)).toMatchObject({ failure: false, rir: '0' })
  })
  it('RIR zero digitado não infere falha em rascunho antigo', () => {
    expect(updateLogRow({ weight: '40', reps: '10', rir: '2' }, 'rir', '0').failure).toBeUndefined()
  })
  it('impede falha sem série e falha com RIR contraditório', () => {
    expect(validateLogRows({ ex: [{ weight: '', reps: '', rir: '0', failure: true }] })).toMatch(/carga ou as repetições/)
    expect(validateLogRows({ ex: [{ weight: '40', reps: '10', rir: '2', failure: true }] })).toMatch(/RIR 0/)
    expect(validateLogRows({ ex: [{ weight: '40', reps: '10', rir: '0', failure: false }] })).toBeNull()
  })
})

describe('validateRestRows', () => {
  it.each([undefined, '', '0', '90', '3600'])('aceita descanso opcional ou inteiro: %s', (rest) => {
    expect(validateRestRows({ ex: [{ weight: '', reps: '10', rir: '', rest }] })).toBeNull()
  })

  it.each(['-1', '1.5', '3601', 'abc', 'Infinity'])('recusa descanso inválido: %s', (rest) => {
    expect(validateRestRows({ ex: [{ weight: '20', reps: '', rir: '', rest }] })).toMatch(/segundos inteiros/)
  })

  it('impede que um descanso sem série executada seja descartado ao salvar', () => {
    expect(validateRestRows({ ex: [{ weight: '', reps: '', rir: '', rest: '90' }] })).toMatch(/carga ou as repetições/)
  })
})

describe('série feita e contagem da sessão', () => {
  it('marcar e desmarcar "feita" não mexe nos números digitados', () => {
    const feita = updateLogRow({ weight: '40', reps: '10', rir: '2' }, 'done', true)
    expect(feita).toMatchObject({ done: true, weight: '40', reps: '10' })
    expect(updateLogRow(feita, 'done', false)).toMatchObject({ done: false, weight: '40' })
  })

  it('série marcada não é descartada quando a prescrição encolhe', () => {
    // quem tocou na linha está no meio da sessão: apagar seria perder trabalho
    const rows = [
      { weight: '40', reps: '10', rir: '' },
      { weight: '', reps: '', rir: '', done: true },
      { weight: '', reps: '', rir: '' },
    ]
    expect(reconcileSetRows(rows, 1)).toHaveLength(2)
  })

  it('conta feitas, registráveis, volume e o que vai ficar de fora', () => {
    const tally = tallySession({
      supino: [
        { weight: '40', reps: '10', rir: '2', done: true },
        { weight: '40', reps: '8', rir: '1', done: true },
        { weight: '', reps: '', rir: '', done: true }, // feita, mas sem número
      ],
      abdominal: [
        { weight: '', reps: '20', rir: '' }, // sem carga: entra no registro
        { weight: '', reps: '', rir: '' },
      ],
    })
    expect(tally).toEqual({
      done: 3,
      logged: 3,
      total: 5,
      doneWithoutNumbers: 1,
      volumeKg: 720, // 40×10 + 40×8; peso corporal não soma volume
      exercises: 2,
    })
  })

  it('sessão vazia não inventa números', () => {
    expect(tallySession({})).toMatchObject({ done: 0, logged: 0, total: 0, volumeKg: 0 })
    expect(isLoggedRow({ weight: '', reps: '', rir: '3' })).toBe(false)
    expect(isLoggedRow({ weight: '', reps: '12', rir: '' })).toBe(true)
  })
})
