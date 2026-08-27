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

  // O parecer médico muda o tom da caixa e recolhe a mecânica da triagem, sem
  // apagá-la: o motivo do encaminhamento continua a um clique.
  it('com liberação registrada, a triagem sai do alarme e vai para o detalhe', () => {
    const answers = emptyAnamnesis()
    for (const item of PARQ_ITEMS) answers.parq[item.key] = false
    answers.parq.cardio_dx = true
    answers.ativo_regular = false
    answers.doenca_cmr_confirmada = true
    answers.sinais_sintomas_confirmados = true

    const { rerender } = render(<AnamneseResumo answers={answers} />)
    expect(screen.getByText('Atenção: encaminhamento recomendado')).toBeTruthy()
    expect(screen.queryByText('O que a triagem apontou')).toBeNull()

    rerender(
      <AnamneseResumo
        answers={answers}
        assessedAt="2026-08-01"
        updatedAt="2026-08-01T10:00:00.000Z"
        liberacao={{
          status: 'liberado',
          em: '2026-08-20',
          validade: null,
          obs: null,
          registradaEm: '2026-08-20T10:00:00.000Z',
        }}
      />
    )
    expect(screen.getByText('Liberado pelo médico')).toBeTruthy()
    expect(screen.getByText('Parecer de 20/08/2026')).toBeTruthy()
    expect(screen.getByText('O que a triagem apontou')).toBeTruthy()
    // o motivo continua no documento, dentro do detalhe recolhido
    expect(screen.getByText(/ao menos uma resposta "Sim"/)).toBeTruthy()
  })
})
