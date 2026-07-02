// @vitest-environment jsdom
// Primeiro teste de componente do projeto (infra: jsdom + Testing Library).
// A pragma acima liga o DOM só neste arquivo; os testes puros seguem em node.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { OneRmCalculator } from './OneRmCalculator'

afterEach(cleanup)

describe('OneRmCalculator', () => {
  it('mostra a instrução enquanto não há entrada', () => {
    render(<OneRmCalculator />)
    expect(screen.getByText(/informe a carga e as repetições/i)).toBeTruthy()
  })

  it('calcula o 1RM (Epley) e monta a tabela de %', () => {
    render(<OneRmCalculator />)
    const [carga, reps] = screen.getAllByRole('spinbutton')
    fireEvent.change(carga, { target: { value: '100' } })
    fireEvent.change(reps, { target: { value: '5' } })
    // Epley: 100 * (1 + 5/30) = 116,7 -> arredondado a 2,5 = 117,5
    expect(screen.getByText(/117\.5 kg/)).toBeTruthy()
    expect(screen.getByText('%1RM')).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()
  })

  it('troca de fórmula recalcula (Brzycki)', () => {
    render(<OneRmCalculator />)
    const [carga, reps] = screen.getAllByRole('spinbutton')
    fireEvent.change(carga, { target: { value: '100' } })
    fireEvent.change(reps, { target: { value: '5' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'brzycki' } })
    // Brzycki: 100 * 36 / 32 = 112,5
    expect(screen.getByText(/112\.5 kg/)).toBeTruthy()
  })
})
