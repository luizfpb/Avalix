// @vitest-environment jsdom
import { useState } from 'react'
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ConfirmDialog } from './ConfirmDialog'

// jsdom ainda não implementa showModal/close do <dialog>; stub mínimo.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

afterEach(cleanup)

describe('ConfirmDialog', () => {
  it('não renderiza nada fechado', () => {
    const { container } = render(
      <ConfirmDialog open={false} title="Excluir?" onConfirm={() => {}} onCancel={() => {}} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('mostra título/descrição e dispara onConfirm', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open
        title="Excluir avaliação?"
        description="Esta ação é definitiva."
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    )
    expect(screen.getByText('Excluir avaliação?')).toBeTruthy()
    expect(screen.getByText(/definitiva/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancelar dispara onCancel e não onConfirm', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog open title="Excluir?" onConfirm={onConfirm} onCancel={onCancel} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('tem nome acessível e Escape cancela uma única vez', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog open title="Descartar alterações?" onConfirm={() => {}} onCancel={onCancel} />)
    const dialog = screen.getByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    fireEvent(dialog, new Event('close'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

// Quem abre a confirmação pelo teclado precisa voltar ao botão que a abriu. O
// componente sai da árvore com o <dialog> ainda aberto (devolve null quando
// open vira false), e o navegador só devolve o foco no close(): no Chrome 156
// o foco caía no <body> depois de Esc, Cancelar e Confirmar.
describe('ConfirmDialog e o foco', () => {
  function Tela() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Excluir plano</button>
        <ConfirmDialog open={open} title="Excluir?" onConfirm={() => setOpen(false)} onCancel={() => setOpen(false)} />
      </>
    )
  }

  for (const saida of ['Cancelar', 'Excluir'] as const) {
    it(`devolve o foco ao botão que abriu depois de ${saida}`, () => {
      render(<Tela />)
      const gatilho = screen.getByRole('button', { name: 'Excluir plano' })
      gatilho.focus()
      fireEvent.click(gatilho)
      // showModal leva o foco para dentro do diálogo
      const botao = screen.getByRole('button', { name: saida })
      botao.focus()
      fireEvent.click(botao)
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(gatilho)
    })
  }
})
