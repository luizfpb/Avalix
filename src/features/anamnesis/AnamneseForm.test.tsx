// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AnamneseCamadaA } from './AnamneseForm'
import { emptyAnamnesis, PARQ_ITEMS, type AnamnesisAnswers } from './spec'
import { computeGate } from './gate'

const allNo = () => Object.fromEntries(PARQ_ITEMS.map((i) => [i.key, false]))

function Harness({ isAluno = false }: { isAluno?: boolean }) {
  const [answers, setAnswers] = useState(emptyAnamnesis)
  return (
    <AnamneseCamadaA
      a={answers}
      isAluno={isAluno}
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

// A3 é autorrelato e fica FORA do gate: se abrandasse a triagem sozinha, seria
// a primeira coisa que alguém com pressa de treinar aprenderia a marcar.
describe('A3 — parecer médico declarado', () => {
  it('não altera o resultado da triagem', () => {
    const base = { ...emptyAnamnesis(), parq: allNo(), ativo_regular: true }
    const semDeclaracao = computeGate({
      ...base,
      doenca_cmr_confirmada: true,
      sinais_sintomas_confirmados: true,
      parq: { ...allNo(), cardio_dx: true },
    })
    const comDeclaracao = computeGate({
      ...base,
      doenca_cmr_confirmada: true,
      sinais_sintomas_confirmados: true,
      parq: { ...allNo(), cardio_dx: true },
      liberacao_declarada: true,
      liberacao_declarada_em: '2026-07-10',
    })
    expect(comDeclaracao).toEqual(semDeclaracao)
    expect(comDeclaracao.liberado).toBe(false)
  })

  it('para o aluno, pergunta um fato — sem citar triagem ou liberação automática', () => {
    render(<Harness isAluno />)
    expect(
      screen.getByText(
        'Nos últimos 12 meses, algum médico avaliou você e liberou a prática de exercícios físicos?'
      )
    ).toBeTruthy()
    expect(screen.queryByText(/PAR-Q/)).toBeNull()
    expect(screen.queryByText(/encaminhamento/i)).toBeNull()
    expect(screen.queryByText(/liberação automática/i)).toBeNull()
  })

  it('a data só é pedida depois do "Sim"', () => {
    render(<Harness isAluno />)
    expect(screen.queryByText('Quando foi? (se lembrar a data)')).toBeNull()

    const grupo = screen.getByRole('group', {
      name: 'Nos últimos 12 meses, algum médico avaliou você e liberou a prática de exercícios físicos?',
    })
    fireEvent.click(grupo.querySelector('button') as HTMLButtonElement)
    expect(screen.getByText('Quando foi? (se lembrar a data)')).toBeTruthy()
  })
})
