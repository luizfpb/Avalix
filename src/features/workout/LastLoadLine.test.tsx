// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LastLoadLine } from './LastLoadLine'
import { lastLoadFromServer, previousSetAt, previousSetText } from './lastLoad'

afterEach(cleanup)

describe('LastLoadLine', () => {
  it('última carga e sugestão na mesma linha, com vírgula decimal', () => {
    render(<LastLoadLine last={{ weightKg: 42.5, reps: 12, rir: 2, date: '2026-09-30' }}
      repRange={{ min: 8, max: 12 }} targetRir={2} />)
    expect(screen.getByText('última vez: 42,5 kg × 12 (RIR 2) em 30/09 → sugestão: 45 kg × 8 (subir carga)')).toBeTruthy()
  })

  it('peso corporal mostra as repetições, sem inventar carga nem sugestão', () => {
    render(<LastLoadLine last={{ weightKg: null, reps: 15, rir: null, date: '2026-09-15' }}
      repRange={{ min: 10, max: 15 }} targetRir={null} />)
    expect(screen.getByText('última vez: 15 reps em 15/09')).toBeTruthy()
  })

  it('exercício trocado mostra a última vez sem sugestão; sem histórico, nada', () => {
    const { container, rerender } = render(<LastLoadLine last={{ weightKg: 20, reps: 10, rir: null, date: '2026-09-15', reachedFailure: true }}
      repRange={{ min: 8, max: 12 }} targetRir={2} suggest={false} />)
    expect(screen.getByText('última vez: 20 kg × 10 em 15/09 · Falha')).toBeTruthy()
    rerender(<LastLoadLine last={undefined} />)
    expect(container.textContent).toBe('')
  })
})

describe('última vez por série (0048)', () => {
  const last = lastLoadFromServer({
    weight_kg: 55, reps: 8, rir: 1, performed_at: '2026-09-30', reached_failure: false,
    sets: [
      { set_number: 1, weight_kg: 55, reps: 8, rir: 1, reached_failure: false },
      { set_number: 2, weight_kg: 50, reps: 12, rir: 1.5 },
      { set_number: 3, weight_kg: 50, reps: 10, rir: null, reached_failure: true },
      { set_number: 4, weight_kg: null, reps: 20, rir: null },
    ],
  })

  it('casa a linha da tela com a série de mesmo número', () => {
    expect(previousSetAt(last, 0)?.weightKg).toBe(55)
    expect(previousSetAt(last, 2)?.reps).toBe(10)
    expect(previousSetAt(last, 4)).toBeNull()
    expect(previousSetAt(undefined, 0)).toBeNull()
  })

  it('texto curto com carga, reps e esforço', () => {
    expect(previousSetText(previousSetAt(last, 0)!)).toBe('55 kg × 8, RIR 1')
    expect(previousSetText(previousSetAt(last, 1)!)).toBe('50 kg × 12, RIR 1,5')
    expect(previousSetText(previousSetAt(last, 2)!)).toBe('50 kg × 10, falha')
    expect(previousSetText(previousSetAt(last, 3)!)).toBe('20 reps')
  })

  it('descanso da última vez (0054): segundos, zero e não informado', () => {
    const comDescanso = lastLoadFromServer({
      weight_kg: 55, reps: 8, rir: 1, performed_at: '2026-09-30',
      sets: [
        { set_number: 1, weight_kg: 55, reps: 8, rir: 1, rest_seconds: 90 },
        { set_number: 2, weight_kg: 50, reps: 10, rir: null, rest_seconds: 0, reached_failure: true },
        { set_number: 3, weight_kg: 50, reps: 9, rir: 2, rest_seconds: null },
      ],
    })
    expect(previousSetText(previousSetAt(comDescanso, 0)!)).toBe('55 kg × 8, RIR 1 · descanso 90s')
    expect(previousSetText(previousSetAt(comDescanso, 1)!)).toBe('50 kg × 10, falha · sem descanso')
    expect(previousSetText(previousSetAt(comDescanso, 2)!)).toBe('50 kg × 9, RIR 2')
    // pacote da 0048, sem o campo: nada de descanso inventado
    expect(previousSetAt(last, 0)?.restSeconds).toBeNull()
  })

  it('pacote de antes da 0048 vem sem séries e não quebra', () => {
    const antigo = lastLoadFromServer({ weight_kg: 40, reps: 12, rir: 2, performed_at: '2026-09-30' })
    expect(antigo.sets).toEqual([])
    expect(previousSetAt(antigo, 0)).toBeNull()
  })
})
