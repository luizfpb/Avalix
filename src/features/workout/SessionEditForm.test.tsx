// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SessionEditForm, type EditableSessionSet, type SessionEditValues } from './SessionEditForm'

afterEach(cleanup)
const series: EditableSessionSet[] = [
  { exerciseId: 'x1', exerciseName: 'Supino', setNumber: 1, weightKg: 40, reps: 10, rir: 0, restSeconds: 75 },
  { exerciseId: 'x1', exerciseName: 'Supino', setNumber: 2, weightKg: 42, reps: 8, rir: 0, restSeconds: 0, reachedFailure: true },
]

function open(sets = series) {
  const onSave = vi.fn(async (_value: SessionEditValues) => {})
  const onCancel = vi.fn()
  render(<SessionEditForm sets={sets} performedAt="2026-09-08" notes="Notas" onSave={onSave} onCancel={onCancel} />)
  return { editor: within(screen.getByRole('dialog', { name: 'Editar treino' })), onSave, onCancel }
}

describe('SessionEditForm', () => {
  it('editar descanso não transforma RIR 0 legado em falha nem perde a falha explícita', async () => {
    const { editor, onSave } = open()
    expect(editor.getByLabelText('Falha na série 1 de Supino')).toHaveProperty('checked', false)
    expect(editor.getByLabelText('Falha na série 2 de Supino')).toHaveProperty('checked', true)
    fireEvent.change(editor.getByLabelText('Descanso da série 1 de Supino'), { target: { value: '90' } })
    fireEvent.click(editor.getByRole('button', { name: 'Salvar correções' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].sets.map((s: EditableSessionSet) => [s.rir, s.reachedFailure, s.restSeconds]))
      .toEqual([[0, null, 90], [0, true, 0]])
  })

  it('remove uma série e renumera as restantes antes de salvar', async () => {
    const { editor, onSave } = open()
    fireEvent.click(editor.getByRole('button', { name: 'Remover série 1 de Supino' }))
    fireEvent.click(editor.getByRole('button', { name: 'Salvar correções' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].sets).toEqual([{ ...series[1], setNumber: 1 }])
  })

  it('não grava uma sessão sem séries', async () => {
    const { editor, onSave } = open([series[0]])
    fireEvent.click(editor.getByRole('button', { name: 'Remover série 1 de Supino' }))
    fireEvent.click(editor.getByRole('button', { name: 'Salvar correções' }))
    expect((await editor.findByRole('alert')).textContent).toMatch(/entre 1 e 60 séries/)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('pede confirmação para descartar e permite continuar preenchendo', () => {
    const { editor, onCancel } = open()
    fireEvent.change(editor.getByLabelText('Observações'), { target: { value: 'Correção pendente' } })
    fireEvent.click(editor.getByRole('button', { name: 'Cancelar' }))
    const confirm = within(screen.getByRole('dialog', { name: 'Descartar as correções?' }))
    fireEvent.click(confirm.getByRole('button', { name: 'Continuar editando' }))
    expect(editor.getByLabelText('Observações')).toHaveProperty('value', 'Correção pendente')
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.click(editor.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('corrige legado profissional maior que 60 séries sem apagar dados', async () => {
    const large = Array.from({ length: 61 }, (_, i) => ({ ...series[0], exerciseId: `ex${i}`, exerciseName: `Exercício ${i}`, setNumber: 1 }))
    const { editor, onSave } = open(large)
    fireEvent.change(editor.getByLabelText('Observações'), { target: { value: 'Corrigido' } })
    fireEvent.click(editor.getByRole('button', { name: 'Salvar correções' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].sets).toHaveLength(61)
  })
  it('corrige a semana do mesociclo marcada errado', async () => {
    const onSave = vi.fn(async (_value: SessionEditValues) => {})
    render(<SessionEditForm sets={series} performedAt="2026-09-08" weekNumber={3} planWeeks={4} notes={null} onSave={onSave} onCancel={vi.fn()} />)
    const editor = within(screen.getByRole('dialog', { name: 'Editar treino' }))
    const week = editor.getByLabelText('Semana do mesociclo')
    expect(week).toHaveProperty('value', '3')
    fireEvent.change(week, { target: { value: '2' } })
    fireEvent.click(editor.getByRole('button', { name: 'Salvar correções' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].weekNumber).toBe(2)
  })

  it('não manda a semana quando ela não mudou', async () => {
    const onSave = vi.fn(async (_value: SessionEditValues) => {})
    render(<SessionEditForm sets={series} performedAt="2026-09-08" weekNumber={3} planWeeks={4} notes={null} onSave={onSave} onCancel={vi.fn()} />)
    const editor = within(screen.getByRole('dialog', { name: 'Editar treino' }))
    fireEvent.change(editor.getByLabelText('Observações'), { target: { value: 'Só a nota' } })
    fireEvent.click(editor.getByRole('button', { name: 'Salvar correções' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('weekNumber')
  })

  it.each(['0', '5', '2.5', ''])('recusa semana fora do mesociclo (%s) sem perder o preenchido', async (valor) => {
    const onSave = vi.fn(async (_value: SessionEditValues) => {})
    render(<SessionEditForm sets={series} performedAt="2026-09-08" weekNumber={3} planWeeks={4} notes={null} onSave={onSave} onCancel={vi.fn()} />)
    const editor = within(screen.getByRole('dialog', { name: 'Editar treino' }))
    fireEvent.change(editor.getByLabelText('Semana do mesociclo'), { target: { value: valor } })
    fireEvent.click(editor.getByRole('button', { name: 'Salvar correções' }))
    expect((await editor.findByRole('alert')).textContent).toMatch(/semana/)
    expect(onSave).not.toHaveBeenCalled()
    expect(editor.getByLabelText('Semana do mesociclo')).toHaveProperty('value', valor)
  })

  it('mantém válida a semana gravada além de um plano que encolheu', async () => {
    const onSave = vi.fn(async (_value: SessionEditValues) => {})
    render(<SessionEditForm sets={series} performedAt="2026-09-08" weekNumber={6} planWeeks={4} notes={null} onSave={onSave} onCancel={vi.fn()} />)
    const editor = within(screen.getByRole('dialog', { name: 'Editar treino' }))
    fireEvent.change(editor.getByLabelText('Observações'), { target: { value: 'Corrigido' } })
    fireEvent.click(editor.getByRole('button', { name: 'Salvar correções' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
  })

  it('sessão sem semana e sem plano conhecido não mostra o campo', () => {
    open()
    expect(screen.queryByLabelText('Semana do mesociclo')).toBeNull()
  })
})

// O editor é desmontado pelo pai com o <dialog> aberto, sem passar pelo
// close() que devolveria o foco: quem usa teclado voltava ao topo da página.
describe('SessionEditForm e o foco', () => {
  it('devolve o foco ao botão "Editar" ao cancelar', () => {
    function Historico() {
      const [editing, setEditing] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setEditing(true)}>Editar sessão de 08/09</button>
          {editing ? (
            <SessionEditForm sets={series} performedAt="2026-09-08" notes={null}
              onSave={async () => {}} onCancel={() => setEditing(false)} />
          ) : null}
        </>
      )
    }
    render(<Historico />)
    const gatilho = screen.getByRole('button', { name: 'Editar sessão de 08/09' })
    gatilho.focus()
    fireEvent.click(gatilho)
    const cancelar = within(screen.getByRole('dialog', { name: 'Editar treino' })).getByRole('button', { name: 'Cancelar' })
    cancelar.focus()
    fireEvent.click(cancelar)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(gatilho)
  })
})
