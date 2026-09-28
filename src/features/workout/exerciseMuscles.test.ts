import { describe, expect, it } from 'vitest'
import { additionalPrimaryMuscles, primaryMuscles, primaryMusclesLabel, worksMuscle } from './exerciseMuscles'

describe('músculos principais do exercício', () => {
  const agachamento = { primary_muscle: 'quads', additional_primary_muscles: ['glutes'], secondary_muscles: ['hamstrings'] }

  it('junta o principal e os adicionais, nessa ordem', () => {
    expect(primaryMuscles(agachamento)).toEqual(['quads', 'glutes'])
    expect(primaryMusclesLabel(agachamento)).toBe('Quadríceps + Glúteos')
  })

  it('exercício sem a coluna (banco anterior à 0040) tem só o principal', () => {
    const antigo = { primary_muscle: 'chest', secondary_muscles: [] }
    expect(additionalPrimaryMuscles(antigo)).toEqual([])
    expect(primaryMusclesLabel(antigo)).toBe('Peitoral')
  })

  it('o filtro por músculo acha principal, adicional e secundário', () => {
    expect(worksMuscle(agachamento, 'quads')).toBe(true)
    expect(worksMuscle(agachamento, 'glutes')).toBe(true)
    expect(worksMuscle(agachamento, 'hamstrings')).toBe(true)
    expect(worksMuscle(agachamento, 'chest')).toBe(false)
  })
})
