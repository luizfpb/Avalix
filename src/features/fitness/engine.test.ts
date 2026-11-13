import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { computeFitness, cooperVo2, formatDuration, queensVo2, rockportVo2 } from './engine'
import { FAIXAS, parseMeasures } from './measures'

// Vetores calculados à mão a partir das equações publicadas (conta no comentário).
describe('equações de VO2máx', () => {
  it('Cooper: 2.400 m', () => {
    // (2400 - 504,9) / 44,73 = 42,3675
    expect(cooperVo2(2400)).toBeCloseTo(42.3675, 3)
  })

  it('Rockport: homem 40 anos, 80 kg, 15 min, FC 130', () => {
    // 80 kg = 176,3696 lb
    // 132,853 - 0,0769*176,3696 - 0,3877*40 + 6,315 - 3,2649*15 - 0,1565*130
    // = 132,853 - 13,56282 - 15,508 + 6,315 - 48,9735 - 20,345 = 40,77868
    expect(rockportVo2('M', 40, 80, 900, 130)).toBeCloseTo(40.7787, 3)
  })

  it('Rockport: mulher não soma a constante do sexo', () => {
    expect(rockportVo2('M', 40, 80, 900, 130) - rockportVo2('F', 40, 80, 900, 130)).toBeCloseTo(6.315, 6)
  })

  it('Queens: homem FC 150 e mulher FC 160', () => {
    // 111,33 - 0,42*150 = 48,33
    expect(queensVo2('M', 150)).toBeCloseTo(48.33, 6)
    // 65,81 - 0,1847*160 = 36,258
    expect(queensVo2('F', 160)).toBeCloseTo(36.258, 6)
  })
})

describe('computeFitness', () => {
  it('Cooper em homem de 30 anos: VO2 e classificação brasileira', () => {
    const [r] = computeFitness({ cooper: { distance_m: 2400 } }, 'M', 30)
    expect(r.value).toBeCloseTo(42.37, 2)
    // média 47,4 para 25–34: 80% = 37,92, 95% = 45,03 → regular
    expect(r.rating?.label).toBe('Regular')
    expect(r.notes).toEqual([])
  })

  it('Cooper em mulher avisa que a equação veio de homens', () => {
    const [r] = computeFitness({ cooper: { distance_m: 2000 } }, 'F', 30)
    expect(r.notes).toContain('Equação desenvolvida com homens de 17 a 52 anos.')
  })

  it('resultado impossível é sinalizado e não é classificado como normal', () => {
    const [r] = computeFitness({ queens: { heart_rate_bpm: 230 } }, 'F', 20)
    // 65,81 - 0,1847*230 = 23,329: possível; com FC 40 no homem: 94,53
    expect(r.value).toBeCloseTo(23.329, 3)
    const [h] = computeFitness({ queens: { heart_rate_bpm: 40 } }, 'M', 20)
    expect(h.notes).toContain('Resultado incomum: confira as medidas.')
  })

  it('flexão no protocolo errado explica por que não há classificação', () => {
    const [r] = computeFitness({ push_ups: { reps: 20, knees: false } }, 'F', 25)
    expect(r.rating).toBeNull()
    expect(r.notes[0]).toMatch(/joelhos apoiados/)
  })

  it('abdominal é registrado sem classificação', () => {
    const [r] = computeFitness({ sit_ups: { reps: 35 } }, 'M', 25)
    expect(r.rating).toBeNull()
    expect(r.value).toBe(35)
  })

  it('preensão usa a maior mão e mostra a diferença', () => {
    const [r] = computeFitness({ grip: { right_kg: 30, left_kg: 26.5 } }, 'M', 70)
    expect(r.value).toBe(30)
    expect(r.detail).toContain('diferença 3,5 kg')
    expect(r.rating?.label).toBe('Acima do corte de força baixa')
  })

  it('mantém a ordem dos testes', () => {
    const keys = computeFitness(
      { grip: { left_kg: 20 }, cooper: { distance_m: 2000 }, sit_ups: { reps: 10 } },
      'F',
      30
    ).map((r) => r.key)
    expect(keys).toEqual(['cooper', 'sit_ups', 'grip'])
  })
})

describe('parseMeasures', () => {
  it('ignora o que não tem o formato esperado', () => {
    expect(
      parseMeasures({
        cooper: { distance_m: '2400' },
        push_ups: { reps: 10 },
        sit_and_reach: { best_cm: 30, feet_mark_cm: 24 },
        grip: {},
        queens: { heart_rate_bpm: 150 },
      })
    ).toEqual({ queens: { heart_rate_bpm: 150 } })
    expect(parseMeasures(null)).toEqual({})
    expect(parseMeasures([1])).toEqual({})
  })
})

describe('faixas iguais às do banco (0059)', () => {
  it('cada limite da tela aparece em app.fitness_measures_valid', async () => {
    const sql = await readFile(
      new URL('../../../supabase/migrations/0059_testes_fisicos.sql', import.meta.url),
      'utf8'
    )
    const noBanco = (campo: string, r: { min: number; max: number }) =>
      sql.includes(`app.fitness_num_ok(v, '${campo}', ${r.min}, ${r.max})`)
    expect(noBanco('distance_m', FAIXAS.cooper_distance_m)).toBe(true)
    expect(noBanco('time_s', FAIXAS.rockport_time_s)).toBe(true)
    expect(noBanco('heart_rate_bpm', FAIXAS.heart_rate_bpm)).toBe(true)
    expect(noBanco('weight_kg', FAIXAS.rockport_weight_kg)).toBe(true)
    expect(noBanco('reps', FAIXAS.push_ups_reps)).toBe(true)
    expect(noBanco('reps', FAIXAS.sit_ups_reps)).toBe(true)
    expect(noBanco('best_cm', FAIXAS.sit_and_reach_cm)).toBe(true)
    expect(noBanco('right_kg', FAIXAS.grip_kg) && noBanco('left_kg', FAIXAS.grip_kg)).toBe(true)
  })
})

it('formatDuration', () => {
  expect(formatDuration(905)).toBe('15min05s')
})
