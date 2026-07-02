// @vitest-environment jsdom
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
})
