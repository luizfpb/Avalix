import { describe, expect, it } from 'vitest'
import { ensureLogRows, updateLogRow, validateLogRows, validateRestRows } from './logRows'

describe('ensureLogRows', () => {
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
