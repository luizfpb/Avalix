// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AnamneseCamadaA } from './AnamneseForm'
import { emptyAnamnesis, type AnamnesisAnswers } from './spec'

function Harness() {
  const [answers, setAnswers] = useState(emptyAnamnesis)
  return (
    <AnamneseCamadaA
      a={answers}
      set={(patch) => setAnswers((current: AnamnesisAnswers) => ({ ...current, ...patch }))}
    />
  )
}

afterEach(cleanup)

describe('confirmações explícitas da camada A2', () => {
  it('volta a exigir “Nenhuma” quando a última doença marcada é removida', () => {
    render(<Harness />)
    const option = screen.getByLabelText('Cardiovascular')

    fireEvent.click(option)
    expect(screen.getAllByText(/Se nenhuma opção se aplica/)).toHaveLength(1)

    fireEvent.click(option)
    expect(screen.getAllByText(/Se nenhuma opção se aplica/)).toHaveLength(2)
    expect((screen.getByLabelText('Nenhuma doença diagnosticada') as HTMLInputElement).checked).toBe(false)
  })

  it('volta a exigir “Nenhum” quando o último sintoma marcado é removido', () => {
    render(<Harness />)
    const option = screen.getByLabelText('Palpitações ou taquicardia')

    fireEvent.click(option)
    expect(screen.getAllByText(/Se nenhuma opção se aplica/)).toHaveLength(1)

    fireEvent.click(option)
    expect(screen.getAllByText(/Se nenhuma opção se aplica/)).toHaveLength(2)
    expect((screen.getByLabelText('Nenhum sinal ou sintoma atual') as HTMLInputElement).checked).toBe(false)
  })
})
