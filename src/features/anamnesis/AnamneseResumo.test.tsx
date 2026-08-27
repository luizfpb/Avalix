// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AnamneseResumo } from './AnamneseResumo'
import { emptyAnamnesis, PARQ_ITEMS } from './spec'

afterEach(cleanup)

describe('AnamneseResumo', () => {
  it('não apresenta respostas ausentes como negativas ou liberação', () => {
    render(<AnamneseResumo answers={emptyAnamnesis()} />)

    expect(screen.getAllByText(/Triagem incompleta/).length).toBeGreaterThan(0)
    expect(screen.getByText('Não respondidos')).toBeTruthy()
    expect(screen.queryByText("Todas 'Não'")).toBeNull()
    expect(screen.getAllByText('Não respondido').length).toBeGreaterThanOrEqual(3)
  })

  it('mostra ausência somente após respostas e confirmações explícitas', () => {
    const answers = emptyAnamnesis()
    for (const item of PARQ_ITEMS) answers.parq[item.key] = false
    answers.ativo_regular = false
    answers.doenca_cmr_confirmada = true
    answers.sinais_sintomas_confirmados = true

    render(<AnamneseResumo answers={answers} />)

    expect(screen.getByText('Liberado para avaliação')).toBeTruthy()
    expect(screen.getByText("Todas 'Não'")).toBeTruthy()
    expect(screen.getAllByText('Nenhuma')).toHaveLength(2)
  })
})
