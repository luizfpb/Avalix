import { describe, expect, it } from 'vitest'
import { ensureLogRows } from './logRows'

describe('ensureLogRows', () => {
  it('preserva séries digitadas ao inicializar outra divisão', () => {
    const divisionA = { a1: [{ weight: '40', reps: '10', rir: '2' }] }
    const withDivisionB = ensureLogRows(divisionA, [{ id: 'b1', sets: 2 }])

    expect(withDivisionB.a1).toEqual(divisionA.a1)
    expect(withDivisionB.b1).toHaveLength(2)
    expect(withDivisionB.b1[0]).toEqual({ weight: '', reps: '', rir: '' })
  })

  it('não reinicializa uma divisão já preenchida', () => {
    const previous = { b1: [{ weight: '20', reps: '12', rir: '3' }] }
    expect(ensureLogRows(previous, [{ id: 'b1', sets: 4 }]).b1).toEqual(previous.b1)
  })
})
