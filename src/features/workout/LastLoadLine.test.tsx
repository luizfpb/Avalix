// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LastLoadLine } from './LastLoadLine'

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
