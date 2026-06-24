import { describe, it, expect } from 'vitest'
import {
  buildVolumeSnapshot,
  countWeekVolume,
  VOLUME_ENGINE_VERSION,
  VOLUME_WEIGHTS,
} from './engine'
import type { VolumeExercise, VolumePlanInput } from './types'

function ex(over: Partial<VolumeExercise>): VolumeExercise {
  return {
    key: 'k',
    primaryMuscle: 'chest',
    secondaryMuscles: [],
    sets: 3,
    ...over,
  }
}

describe('countWeekVolume', () => {
  it('conta primario cheio (1.0) e secundario fracionado (0.5)', () => {
    const { byMuscle, totalSets } = countWeekVolume([
      { primaryMuscle: 'chest', secondaryMuscles: ['front_delts', 'triceps'], sets: 4 },
    ])
    expect(byMuscle.chest).toBe(4) // 4 * 1.0
    expect(byMuscle.front_delts).toBe(2) // 4 * 0.5
    expect(byMuscle.triceps).toBe(2)
    expect(totalSets).toBe(4) // series reais, nao fracionadas
  })

  it('soma o mesmo grupo vindo de exercicios diferentes (primario + secundario)', () => {
    const { byMuscle } = countWeekVolume([
      { primaryMuscle: 'chest', secondaryMuscles: ['triceps'], sets: 4 }, // triceps +2
      { primaryMuscle: 'triceps', secondaryMuscles: [], sets: 3 }, // triceps +3
    ])
    expect(byMuscle.triceps).toBe(5) // 2 (indireto) + 3 (direto)
    expect(byMuscle.chest).toBe(4)
  })

  it('ignora exercicio com 0 series', () => {
    const { byMuscle, totalSets } = countWeekVolume([
      { primaryMuscle: 'chest', secondaryMuscles: ['triceps'], sets: 0 },
    ])
    expect(byMuscle.chest).toBeUndefined()
    expect(totalSets).toBe(0)
  })
})

describe('buildVolumeSnapshot', () => {
  const basePlan: VolumePlanInput = {
    weeks: 4,
    days: [
      {
        label: 'A',
        exercises: [
          ex({ key: 'sup', primaryMuscle: 'chest', secondaryMuscles: ['triceps'], sets: 4 }),
          ex({ key: 'rosca', primaryMuscle: 'biceps', secondaryMuscles: [], sets: 3 }),
        ],
      },
      {
        label: 'B',
        exercises: [
          ex({ key: 'agacho', primaryMuscle: 'quads', secondaryMuscles: ['glutes'], sets: 5 }),
        ],
      },
    ],
  }

  it('sequência semanal repete a divisão e dobra o volume dela (ABA)', () => {
    const snap = buildVolumeSnapshot({ ...basePlan, weeklySchedule: ['A', 'B', 'A'] })
    const w = snap.perWeek[0]
    expect(w.byMuscle.chest).toBe(8) // A duas vezes: 4 * 1.0 * 2
    expect(w.byMuscle.triceps).toBe(4) // 4 * 0.5 * 2
    expect(w.byMuscle.biceps).toBe(6) // 3 * 2
    expect(w.byMuscle.quads).toBe(5) // B uma vez
    expect(w.totalSets).toBe(19) // (4+3)*2 + 5
  })

  it('expande todas as semanas com o template quando nao ha override', () => {
    const snap = buildVolumeSnapshot(basePlan)
    expect(snap.perWeek).toHaveLength(4)
    for (const w of snap.perWeek) {
      expect(w.byMuscle.chest).toBe(4)
      expect(w.byMuscle.triceps).toBe(2)
      expect(w.byMuscle.biceps).toBe(3)
      expect(w.byMuscle.quads).toBe(5)
      expect(w.byMuscle.glutes).toBe(2.5)
      expect(w.totalSets).toBe(12) // 4 + 3 + 5
    }
  })

  it('aplica override de series numa semana especifica', () => {
    const snap = buildVolumeSnapshot({
      ...basePlan,
      overrides: { 4: { sup: { sets: 2 } } },
    })
    const w1 = snap.perWeek.find((w) => w.week === 1)!
    const w4 = snap.perWeek.find((w) => w.week === 4)!
    expect(w1.byMuscle.chest).toBe(4)
    expect(w4.byMuscle.chest).toBe(2) // override
    expect(w4.byMuscle.triceps).toBe(1) // 2 * 0.5
  })

  it('zera o volume de um exercicio pulado (skipped) na semana', () => {
    const snap = buildVolumeSnapshot({
      ...basePlan,
      overrides: { 2: { agacho: { skipped: true } } },
    })
    const w2 = snap.perWeek.find((w) => w.week === 2)!
    expect(w2.byMuscle.quads).toBeUndefined()
    expect(w2.byMuscle.glutes).toBeUndefined()
    expect(w2.totalSets).toBe(7) // 4 + 3, sem o agacho
  })

  it('escolhe a 1a semana sem deload como tipica e expoe seu volume', () => {
    const snap = buildVolumeSnapshot({
      ...basePlan,
      deloadWeeks: [1], // semana 1 e deload
      overrides: { 1: { sup: { sets: 2 }, agacho: { sets: 2 }, rosca: { sets: 1 } } },
    })
    expect(snap.typicalWeek).toBe(2) // pula a 1, que e deload
    expect(snap.typicalByMuscle.chest).toBe(4) // volume da semana 2 (template)
  })

  it('cai pra semana 1 quando todas sao deload', () => {
    const snap = buildVolumeSnapshot({ ...basePlan, weeks: 2, deloadWeeks: [1, 2] })
    expect(snap.typicalWeek).toBe(1)
  })

  it('carrega a versao e os pesos no snapshot', () => {
    const snap = buildVolumeSnapshot(basePlan)
    expect(snap.engineVersion).toBe(VOLUME_ENGINE_VERSION)
    expect(snap.weights).toEqual({ primary: VOLUME_WEIGHTS.primary, secondary: VOLUME_WEIGHTS.secondary })
  })

  it('lida com plano vazio sem quebrar', () => {
    const snap = buildVolumeSnapshot({ weeks: 3, days: [] })
    expect(snap.perWeek).toHaveLength(3)
    expect(snap.perWeek[0].totalSets).toBe(0)
    expect(snap.typicalByMuscle).toEqual({})
  })
})

describe('VOLUME_ENGINE_VERSION', () => {
  it('segue o padrao nome@versao', () => {
    expect(VOLUME_ENGINE_VERSION).toMatch(/^[a-z-]+@\d+$/)
  })
})
