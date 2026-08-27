// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AnamneseFlag } from './AnamneseFlag'

// O banner do builder é onde o aviso mais incomodava: aparecia igual antes e
// depois de o aluno voltar do médico. Aqui se testa que ele muda de tom com o
// parecer registrado — e que volta a avisar quando o parecer vence ou quando o
// médico não liberou.

const { useAnamnesesMock } = vi.hoisted(() => ({ useAnamnesesMock: vi.fn() }))

vi.mock('../anamnesis/hooks', () => ({
  useAnamneses: () => useAnamnesesMock(),
}))

afterEach(cleanup)

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'an-1',
    assessed_at: '2026-08-01',
    updated_at: '2026-08-01T10:00:00.000Z',
    liberado: false,
    nivel_encaminhamento: 'antes_iniciar',
    flag_encaminhamento: true,
    liberacao_medica: 'pendente',
    liberacao_medica_em: null,
    liberacao_medica_validade: null,
    liberacao_medica_obs: null,
    liberacao_medica_registrada_em: null,
    ...over,
  }
}

function renderFlag(data: unknown[]) {
  useAnamnesesMock.mockReturnValue({ data })
  return render(
    <MemoryRouter>
      <AnamneseFlag subjectId="sub-1" />
    </MemoryRouter>
  )
}

describe('AnamneseFlag', () => {
  it('triagem limpa e sem parecer não vira aviso nenhum', () => {
    const { container } = renderFlag([
      row({ liberado: true, nivel_encaminhamento: 'liberado', flag_encaminhamento: false }),
    ])
    expect(container.firstChild).toBeNull()
  })

  it('sem parecer, avisa e oferece o registro', () => {
    renderFlag([row()])
    expect(screen.getByText('Atenção: encaminhamento recomendado')).toBeTruthy()
    expect(screen.getByText('Liberação médica antes de iniciar')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Registrar liberação médica' })).toBeTruthy()
  })

  it('com liberação vigente, o alerta vira uma linha discreta', () => {
    renderFlag([
      row({
        liberacao_medica: 'liberado',
        liberacao_medica_em: '2026-08-15',
        liberacao_medica_registrada_em: '2026-08-15T12:00:00.000Z',
      }),
    ])
    expect(screen.queryByText('Atenção: encaminhamento recomendado')).toBeNull()
    expect(screen.getByText(/Liberado pelo médico · Parecer de 15\/08\/2026/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ver anamnese' })).toBeTruthy()
  })

  it('restrição continua visível, porque muda a prescrição', () => {
    renderFlag([
      row({
        liberacao_medica: 'liberado_com_restricoes',
        liberacao_medica_em: '2026-08-15',
        liberacao_medica_obs: 'Sem exercício vigoroso por 60 dias',
        liberacao_medica_registrada_em: '2026-08-15T12:00:00.000Z',
      }),
    ])
    expect(screen.getByText('Liberado pelo médico, com restrições')).toBeTruthy()
    expect(screen.getByText('Sem exercício vigoroso por 60 dias')).toBeTruthy()
  })

  it('parecer vencido devolve o aviso', () => {
    renderFlag([
      row({
        liberacao_medica: 'liberado',
        liberacao_medica_em: '2020-01-01',
        liberacao_medica_validade: '2020-06-01',
        liberacao_medica_registrada_em: '2020-01-02T12:00:00.000Z',
      }),
    ])
    expect(screen.getByText('Liberação médica vencida')).toBeTruthy()
  })

  it('recusa médica é o aviso mais forte', () => {
    renderFlag([
      row({
        liberacao_medica: 'nao_liberado',
        liberacao_medica_em: '2026-08-15',
        liberacao_medica_obs: 'Reavaliar em 90 dias',
        liberacao_medica_registrada_em: '2026-08-15T12:00:00.000Z',
      }),
    ])
    expect(screen.getByText('Médico não liberou a prática')).toBeTruthy()
    expect(screen.getByText('Reavaliar em 90 dias')).toBeTruthy()
  })

  it('sem anamnese não há o que avisar', () => {
    const { container } = renderFlag([])
    expect(container.firstChild).toBeNull()
  })
})
