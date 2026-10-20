// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PlanNotes } from './PlanNotes'

afterEach(cleanup)

describe('PlanNotes', () => {
  it('mostra a observação do plano e a da semana escolhida', () => {
    render(<PlanNotes planNotes="Aquecer 10 min na esteira." weekNumber={4} weekLabel="Deload" weekNotes="Reduzir a carga em 30%." />)
    expect(screen.getByText('Aquecer 10 min na esteira.')).toBeTruthy()
    expect(screen.getByText('Semana 4 · Deload')).toBeTruthy()
    expect(screen.getByText('Reduzir a carga em 30%.')).toBeTruthy()
  })

  it('sem semana escolhida, a observação da semana não aparece', () => {
    render(<PlanNotes planNotes="Aquecer antes." weekNumber={null} weekNotes="Reduzir a carga." />)
    expect(screen.getByText('Aquecer antes.')).toBeTruthy()
    expect(screen.queryByText('Reduzir a carga.')).toBeNull()
  })

  it('nada a dizer, nada na tela', () => {
    const { container } = render(<PlanNotes planNotes="   " weekNumber={2} weekNotes={null} />)
    expect(container.innerHTML).toBe('')
  })
})
