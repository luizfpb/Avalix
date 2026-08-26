// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SessionSets, type SessionSet } from './SessionSets'

// O formato antigo era "5×10 · 5×9 · 5×7" e, no celular, ninguém sabia dizer o
// que era carga e o que era repetição — ambiguidade relatada em uso real. O
// teste fixa a unidade escrita, que é o que resolve.

afterEach(cleanup)

const serie = (over: Partial<SessionSet> = {}): SessionSet => ({
  exerciseName: 'Elevação lateral com halteres',
  setNumber: 1,
  weightKg: 5,
  reps: 10,
  rir: 2,
  ...over,
})

describe('SessionSets', () => {
  it('escreve a unidade de carga e de repetição', () => {
    render(<SessionSets sets={[serie()]} />)
    expect(screen.getByText('5 kg')).toBeTruthy()
    expect(screen.getByText('10 reps')).toBeTruthy()
    expect(screen.getByText('RIR 2')).toBeTruthy()
  })

  it('agrupa as séries por exercício, em ordem', () => {
    render(
      <SessionSets
        sets={[
          serie({ setNumber: 2, reps: 9 }),
          serie({ setNumber: 1, reps: 10 }),
          serie({ exerciseName: 'Supino reto', setNumber: 1, weightKg: 40, reps: 8 }),
        ]}
      />
    )
    expect(screen.getAllByText('Elevação lateral com halteres')).toHaveLength(1)
    expect(screen.getByText('Supino reto')).toBeTruthy()
    const ordem = screen.getAllByText(/^\d+ª$/).map((e) => e.textContent)
    expect(ordem.slice(0, 2)).toEqual(['1ª', '2ª'])
  })

  it('série sem carga (peso do corpo) não vira número inventado', () => {
    render(<SessionSets sets={[serie({ weightKg: null, reps: 15, rir: null })]} />)
    expect(screen.getByText('— kg')).toBeTruthy()
    expect(screen.getByText('15 reps')).toBeTruthy()
  })

  it('carga fracionada mantém a casa decimal e a inteira não ganha zeros', () => {
    render(
      <SessionSets
        sets={[
          serie({ setNumber: 1, weightKg: 42.5 }),
          serie({ setNumber: 2, weightKg: 40 }),
        ]}
      />
    )
    expect(screen.getByText('42.5 kg')).toBeTruthy()
    expect(screen.getByText('40 kg')).toBeTruthy()
  })

  it('sessão sem série diz isso, em vez de ficar em branco', () => {
    render(<SessionSets sets={[]} />)
    expect(screen.getByText(/Nenhuma série registrada/)).toBeTruthy()
  })
})
