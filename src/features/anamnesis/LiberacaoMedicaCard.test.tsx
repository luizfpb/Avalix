// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LiberacaoMedicaCard } from './LiberacaoMedicaCard'
import type { AnamneseRow } from './api'

// Registrar um parecer é escrita em dado de saúde: o que se testa aqui é que a
// tela só oferece o registro quando há o que liberar, que não deixa passar
// restrição sem descrição, e que retirar exige confirmação.

const { mutateMock, mutationState } = vi.hoisted(() => ({ mutateMock: vi.fn(), mutationState: { error: null as Error | null, pending: false } }))

vi.mock('./hooks', () => ({
  useSetLiberacaoMedica: () => ({
    mutate: (input: unknown, opts?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
      mutateMock(input)
      if (mutationState.error) return opts?.onError?.(mutationState.error)
      opts?.onSuccess?.()
    },
    isPending: mutationState.pending,
  }),
}))

beforeEach(() => { mutateMock.mockReset(); mutationState.error = null; mutationState.pending = false })
afterEach(cleanup)

function anamnese(over: Partial<AnamneseRow> = {}): AnamneseRow {
  return {
    id: 'an-1',
    org_id: 'org-1',
    subject_id: 'sub-1',
    evaluator_id: 'user-1',
    assessed_at: '2026-08-01',
    spec_version: '1.3',
    payload: {},
    // triagem que pede parecer
    liberado: false,
    nivel_encaminhamento: 'antes_iniciar',
    flag_encaminhamento: true,
    liberacao_medica: 'pendente',
    liberacao_medica_em: null,
    liberacao_medica_validade: null,
    liberacao_medica_obs: null,
    liberacao_medica_por: null,
    liberacao_medica_registrada_em: null,
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-01T10:00:00.000Z',
    ...over,
  } as AnamneseRow
}

describe('LiberacaoMedicaCard', () => {
  it('bloqueia todos os campos durante a gravação e libera novamente após a resposta', () => {
    const row = anamnese({ liberacao_medica: 'liberado', liberacao_medica_em: '2026-08-01' })
    const view = <LiberacaoMedicaCard subjectId="sub-1" anamnese={row} />
    const { rerender } = render(view)
    fireEvent.click(screen.getByRole('button', { name: 'Editar parecer' }))
    fireEvent.change(screen.getByLabelText('Observações (opcional)'), { target: { value: 'Preservar texto enviado' } })
    mutationState.pending = true
    rerender(<LiberacaoMedicaCard subjectId="sub-1" anamnese={row} />)
    const inputs = [
      ...screen.getAllByRole('radio'),
      screen.getByLabelText('Data do parecer'),
      screen.getByLabelText('Validade (opcional)'),
      screen.getByLabelText('Observações (opcional)'),
    ]
    for (const input of inputs) expect(input.closest('fieldset[disabled]')).not.toBeNull()
    expect((screen.getByRole('button', { name: 'Salvando...' }) as HTMLButtonElement).disabled).toBe(true)
    mutationState.pending = false
    rerender(<LiberacaoMedicaCard subjectId="sub-1" anamnese={row} />)
    expect(screen.getByDisplayValue('Preservar texto enviado')).toBeTruthy()
    for (const input of inputs) expect(input.closest('fieldset[disabled]')).toBeNull()
  })

  it('congela a versão da edição, preserva o texto e mantém aberto ao recusar conflito', () => {
    const first = anamnese({ liberacao_medica: 'liberado', liberacao_medica_em: '2026-08-01' })
    const { rerender } = render(<LiberacaoMedicaCard subjectId="sub-1" anamnese={first} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar parecer' }))
    fireEvent.change(screen.getByLabelText('Observações (opcional)'), { target: { value: 'Minha correção pendente' } })
    rerender(<LiberacaoMedicaCard subjectId="sub-1" anamnese={{ ...first, updated_at: '2026-08-02T10:00:00.000Z', liberacao_medica: 'liberado_com_restricoes', liberacao_medica_obs: 'Restrição nova' }} />)
    mutationState.error = new Error('Esta anamnese foi alterada em outro dispositivo.')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar parecer' }))
    expect(mutateMock).toHaveBeenCalledWith(expect.objectContaining({ expectedUpdatedAt: first.updated_at, obs: 'Minha correção pendente' }))
    expect(screen.getByDisplayValue('Minha correção pendente')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Salvar parecer' })).toBeTruthy()
    expect(screen.getByText('Esta anamnese foi alterada em outro dispositivo.')).toBeTruthy()
  })

  it('retirada usa a versão de quando foi pedida, mesmo após refetch', () => {
    const first = anamnese({ liberacao_medica: 'liberado', liberacao_medica_em: '2026-08-01' })
    const { rerender } = render(<LiberacaoMedicaCard subjectId="sub-1" anamnese={first} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retirar registro' }))
    rerender(<LiberacaoMedicaCard subjectId="sub-1" anamnese={{ ...first, updated_at: '2026-08-02T10:00:00.000Z' }} />)
    mutationState.error = new Error('Conflito de versão')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar retirada' }))
    expect(mutateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'pendente', expectedUpdatedAt: first.updated_at }))
    expect(screen.getByRole('button', { name: 'Confirmar retirada' })).toBeTruthy()
  })
  it('não aparece quando a triagem não pediu nada', () => {
    const { container } = render(
      <LiberacaoMedicaCard
        subjectId="sub-1"
        anamnese={anamnese({
          liberado: true,
          nivel_encaminhamento: 'liberado',
          flag_encaminhamento: false,
        })}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('registra o parecer com data e status escolhidos', () => {
    render(<LiberacaoMedicaCard subjectId="sub-1" anamnese={anamnese()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Registrar liberação médica' }))
    fireEvent.change(screen.getByLabelText('Data do parecer'), {
      target: { value: '2026-08-20' },
    })
    fireEvent.change(screen.getByLabelText('Validade (opcional)'), {
      target: { value: '2027-02-20' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar parecer' }))

    expect(mutateMock).toHaveBeenCalledWith({
      expectedUpdatedAt: '2026-08-01T10:00:00.000Z',
      status: 'liberado',
      em: '2026-08-20',
      validade: '2027-02-20',
      obs: '',
    })
  })

  it('restrição sem descrição não chega ao servidor', () => {
    render(<LiberacaoMedicaCard subjectId="sub-1" anamnese={anamnese()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Registrar liberação médica' }))
    fireEvent.click(screen.getByRole('radio', { name: /Liberado com restrições/ }))
    fireEvent.change(screen.getByLabelText('Data do parecer'), {
      target: { value: '2026-08-20' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar parecer' }))

    expect(mutateMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('Descreva as restrições')
  })

  it('parecer no futuro não chega ao servidor', () => {
    render(<LiberacaoMedicaCard subjectId="sub-1" anamnese={anamnese()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Registrar liberação médica' }))
    fireEvent.change(screen.getByLabelText('Data do parecer'), {
      target: { value: '2099-01-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar parecer' }))

    expect(mutateMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('não pode estar no futuro')
  })

  it('mostra o parecer registrado e só retira em duas etapas', () => {
    render(
      <LiberacaoMedicaCard
        subjectId="sub-1"
        anamnese={anamnese({
          liberacao_medica: 'liberado_com_restricoes',
          liberacao_medica_em: '2026-08-10',
          liberacao_medica_obs: 'Sem carga axial pesada',
          liberacao_medica_registrada_em: '2026-08-10T12:00:00.000Z',
        })}
      />
    )

    expect(screen.getByText('Liberado com restrições')).toBeTruthy()
    expect(screen.getByText('Sem carga axial pesada')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Retirar registro' }))
    expect(mutateMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar retirada' }))
    expect(mutateMock).toHaveBeenCalledWith({
      expectedUpdatedAt: '2026-08-01T10:00:00.000Z',
      status: 'pendente',
      em: null,
      validade: null,
      obs: null,
    })
  })
})
