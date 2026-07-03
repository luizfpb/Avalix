import { describe, it, expect } from 'vitest'
import { CONTRA_RULES_VERSION, exerciseCautions, posturalEmphasis } from './contraindications'
import { emptyAnamnesis, type AnamnesisAnswers } from '../anamnesis/spec'
import type { ExerciseLite } from './contraindications'

function withPain(regiao: string, intensidade: number, lesao = false): AnamnesisAnswers {
  return {
    ...emptyAnamnesis(),
    dor_queixas: [
      { regiao, intensidade, tempo_evolucao: 'cronica', fatores_piora: '', fatores_melhora: '', lesao_previa_regiao: lesao },
    ],
  }
}

const agacho: ExerciseLite = { primaryMuscle: 'quads', secondaryMuscles: ['glutes'], movementPattern: 'squat' }
const supino: ExerciseLite = { primaryMuscle: 'chest', secondaryMuscles: ['front_delts', 'triceps'], movementPattern: 'horizontal_push' }
const rosca: ExerciseLite = { primaryMuscle: 'biceps', secondaryMuscles: ['forearms'], movementPattern: 'isolation' }
const terra: ExerciseLite = { primaryMuscle: 'hamstrings', secondaryMuscles: ['glutes', 'lower_back'], movementPattern: 'hinge' }

describe('exerciseCautions', () => {
  it('queixa de joelho sinaliza agachamento, não rosca', () => {
    const a = withPain('joelho_d', 5)
    expect(exerciseCautions(a, agacho)[0]).toMatch(/joelho direito/)
    expect(exerciseCautions(a, rosca)).toEqual([])
  })

  it('queixa de ombro sinaliza supino (empurrar), não agachamento', () => {
    const a = withPain('ombro_e', 4)
    expect(exerciseCautions(a, supino).length).toBe(1)
    expect(exerciseCautions(a, agacho)).toEqual([])
  })

  it('lombar sinaliza padrões hinge/squat e lower_back', () => {
    const a = withPain('lombar', 6)
    expect(exerciseCautions(a, terra).length).toBe(1) // hinge + lower_back
    expect(exerciseCautions(a, agacho).length).toBe(1) // squat
    expect(exerciseCautions(a, rosca)).toEqual([])
  })

  it('dor leve (<3) e sem lesão prévia não sinaliza', () => {
    expect(exerciseCautions(withPain('joelho_d', 2), agacho)).toEqual([])
    // mas lesão prévia sinaliza mesmo com dor baixa
    expect(exerciseCautions(withPain('joelho_d', 1, true), agacho).length).toBe(1)
  })

  it('red flag de coluna poupa carga axial (hinge/squat/lombar)', () => {
    const a = { ...emptyAnamnesis(), red_flags: ['deficit_neuro'] }
    expect(exerciseCautions(a, terra).some((r) => /coluna/.test(r))).toBe(true)
    expect(exerciseCautions(a, rosca)).toEqual([]) // isolamento de bíceps não é axial
  })

  it('sem queixas -> nenhum sinal', () => {
    expect(exerciseCautions(emptyAnamnesis(), agacho)).toEqual([])
  })

  it('lesão diagnosticada de joelho (LCA) sinaliza agachamento, não supino', () => {
    const a = { ...emptyAnamnesis(), lesoes_diagnosticadas: ['lca'] }
    expect(exerciseCautions(a, agacho).some((r) => /LCA/.test(r))).toBe(true)
    expect(exerciseCautions(a, supino)).toEqual([])
  })

  it('manguito sinaliza empurrar; hérnia de disco sinaliza hinge', () => {
    const a = { ...emptyAnamnesis(), lesoes_diagnosticadas: ['manguito', 'hernia_disco'] }
    expect(exerciseCautions(a, supino).some((r) => /manguito/.test(r))).toBe(true)
    expect(exerciseCautions(a, terra).some((r) => /hérnia/.test(r))).toBe(true)
  })

  it('lesão sem região mapeada não gera sinal automático', () => {
    const a = { ...emptyAnamnesis(), lesoes_diagnosticadas: ['tendinopatia', 'outra'] }
    expect(exerciseCautions(a, agacho)).toEqual([])
    expect(exerciseCautions(a, supino)).toEqual([])
  })
})

describe('posturalEmphasis', () => {
  it('mapeia alterações diagnosticadas e gestante', () => {
    const a: AnamnesisAnswers = {
      ...emptyAnamnesis(),
      alteracao_postural_diagnosticada: ['hipercifose'],
      gestante: true,
    }
    const notes = posturalEmphasis(a)
    expect(notes.some((n) => /Hipercifose/.test(n))).toBe(true)
    expect(notes.some((n) => /Gestante/.test(n))).toBe(true)
  })
  it('sem alterações -> vazio', () => {
    expect(posturalEmphasis(emptyAnamnesis())).toEqual([])
  })
})

describe('CONTRA_RULES_VERSION', () => {
  it('versionado', () => {
    expect(CONTRA_RULES_VERSION).toMatch(/^[a-z-]+@\d+$/)
  })
})
