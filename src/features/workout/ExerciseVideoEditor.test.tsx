// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mutateAsync = vi.fn()
vi.mock('./hooks', () => ({
  useSetExerciseVideo: () => ({ mutateAsync, isPending: false }),
}))

import { ExerciseVideoEditor } from './ExerciseVideoEditor'

function abrir(current: string | null = null) {
  const onDone = vi.fn()
  render(
    <ExerciseVideoEditor orgId="org" exerciseId="ex1" exerciseName="Supino reto" current={current} onDone={onDone} />
  )
  return { onDone, campo: screen.getByLabelText(/Vídeo de/) }
}

describe('ExerciseVideoEditor', () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue(undefined)
  })
  afterEach(cleanup)

  it('grava o link colado na forma canônica', async () => {
    const { onDone, campo } = abrir()
    fireEvent.change(campo, { target: { value: 'https://youtu.be/dQw4w9WgXcQ?si=abc&t=30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar vídeo' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(mutateAsync).toHaveBeenCalledWith({
      exerciseId: 'ex1',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30',
    })
  })

  it('recusa link que não é vídeo do YouTube sem chamar o banco', () => {
    const { campo } = abrir()
    fireEvent.change(campo, { target: { value: 'https://www.instagram.com/p/abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar vídeo' }))
    expect(screen.getByRole('alert').textContent).toMatch(/YouTube/)
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('tirar o vídeo volta ao catálogo ou à busca', async () => {
    const { onDone } = abrir('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    fireEvent.click(screen.getByRole('button', { name: 'Tirar meu vídeo' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(mutateAsync).toHaveBeenCalledWith({ exerciseId: 'ex1', videoUrl: null })
  })

  it('erro do banco aparece e o editor continua aberto', async () => {
    mutateAsync.mockImplementation(() => Promise.reject({ code: '42501', message: 'new row violates row-level security policy' }))
    const { onDone, campo } = abrir()
    fireEvent.change(campo, { target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar vídeo' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/regras de acesso/)
    expect(onDone).not.toHaveBeenCalled()
  })
})
