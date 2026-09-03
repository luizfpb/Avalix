// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AnamneseCamadaA, AnamneseCamadaB } from './AnamneseForm'
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

function HarnessB({ isAluno = false }: { isAluno?: boolean }) {
  const [answers, setAnswers] = useState(emptyAnamnesis)
  return (
    <AnamneseCamadaB
      a={answers}
      isFemale={false}
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

// Medicamentos saíram da avaliação física e viraram pergunta obrigatória aqui.
// "Nenhum" precisa ser dito: lista vazia por si só é pergunta em branco.
describe('medicamentos em uso — pergunta obrigatória', () => {
  const pendencia = /liste os medicamentos ou confirme que não usa nenhum/i

  // A camada B tem várias listas repetíveis: "Adicionar" e "Remover item 1"
  // existem em cirurgias e queixas de dor também, então as buscas ficam
  // presas ao bloco destacado dos medicamentos.
  const bloco = () =>
    screen.getByText(/^Medicamentos (em uso|que você toma) \*$/).closest('.border-amber-300') as HTMLElement
  const adicionar = () => fireEvent.click(within(bloco()).getByRole('button', { name: 'Adicionar' }))

  it('cobra resposta enquanto ninguém disse nada', () => {
    render(<HarnessB />)
    expect(screen.getByText(pendencia)).toBeTruthy()
  })

  it('a confirmação de que não usa nenhum responde a pergunta', () => {
    render(<HarnessB />)
    fireEvent.click(screen.getByLabelText('Não usa nenhum medicamento'))
    expect(screen.queryByText(pendencia)).toBeNull()
  })

  it('medicamento nomeado responde, e a linha em branco não', () => {
    render(<HarnessB />)
    adicionar()
    expect(screen.getByText(pendencia)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Medicamento 1: nome'), {
      target: { value: 'levotiroxina' },
    })
    expect(screen.queryByText(pendencia)).toBeNull()
  })

  it('remover o último medicamento volta a cobrar a resposta', () => {
    render(<HarnessB />)
    adicionar()
    fireEvent.change(screen.getByLabelText('Medicamento 1: nome'), {
      target: { value: 'losartana' },
    })
    fireEvent.click(within(bloco()).getByRole('button', { name: 'Remover item 1' }))

    expect(screen.getByText(pendencia)).toBeTruthy()
    expect((screen.getByLabelText('Não usa nenhum medicamento') as HTMLInputElement).checked).toBe(
      false
    )
  })

  it('para o aluno, a pergunta é feita com as palavras dele', () => {
    render(<HarnessB isAluno />)
    expect(screen.getByLabelText('Não tomo nenhum medicamento')).toBeTruthy()
  })
})
