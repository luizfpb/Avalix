// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExerciseForm } from './ExerciseForm'

const { criar } = vi.hoisted(() => ({ criar: vi.fn() }))
vi.mock('../auth/context', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
vi.mock('./hooks', () => ({
  useCreateCustomExercise: () => ({ isPending: false, mutateAsync: criar }),
  useUpdateCustomExercise: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))

afterEach(() => {
  cleanup()
  criar.mockReset()
})

// 0040: exercício composto pode ter mais de um músculo principal.
describe('ExerciseForm — músculos principais', () => {
  function preencher() {
    fireEvent.change(screen.getByLabelText('Nome do exercício'), { target: { value: 'Agachamento búlgaro' } })
    fireEvent.change(screen.getByLabelText('Músculo principal'), { target: { value: 'quads' } })
    fireEvent.change(screen.getByLabelText('Equipamento'), { target: { value: 'dumbbell' } })
    fireEvent.change(screen.getByLabelText('Padrão de movimento'), { target: { value: 'lunge' } })
  }

  it('aceita até dois outros principais e grava junto do principal', async () => {
    criar.mockResolvedValue({ id: 'ex-novo' })
    render(<ExerciseForm orgId="org-1" onSaved={vi.fn()} />)
    preencher()
    const principais = within(screen.getByRole('group', { name: /outros músculos principais/i }))
    // o principal escolhido não aparece como adicional
    expect((principais.getByRole('button', { name: 'Quadríceps como músculo principal' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(principais.getByRole('button', { name: 'Glúteos como músculo principal' }))
    fireEvent.click(principais.getByRole('button', { name: 'Adutores como músculo principal' }))
    // no limite de três no total, os demais ficam indisponíveis
    expect((principais.getByRole('button', { name: 'Posteriores da coxa como músculo principal' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Criar exercício' }))
    await waitFor(() => expect(criar).toHaveBeenCalled())
    expect(criar.mock.calls[0][0]).toMatchObject({
      primaryMuscle: 'quads',
      additionalPrimaryMuscles: ['glutes', 'adductors'],
    })
  })

  it('promover um secundário a principal tira ele dos secundários', async () => {
    criar.mockResolvedValue({ id: 'ex-novo' })
    render(<ExerciseForm orgId="org-1" onSaved={vi.fn()} />)
    preencher()
    const secundarios = within(screen.getByRole('group', { name: /músculos secundários/i }))
    fireEvent.click(secundarios.getByRole('button', { name: 'Glúteos' }))
    const principais = within(screen.getByRole('group', { name: /outros músculos principais/i }))
    fireEvent.click(principais.getByRole('button', { name: 'Glúteos como músculo principal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Criar exercício' }))
    await waitFor(() => expect(criar).toHaveBeenCalled())
    expect(criar.mock.calls[0][0]).toMatchObject({
      additionalPrimaryMuscles: ['glutes'],
      secondaryMuscles: [],
    })
  })
})

describe('ExerciseForm', () => {
  it('expõe nomes acessíveis para os campos e para o grupo de músculos', () => {
    render(<ExerciseForm orgId="org-1" onSaved={vi.fn()} />)

    expect(screen.getByLabelText('Nome do exercício')).toBeTruthy()
    expect(screen.getByLabelText('Músculo principal')).toBeTruthy()
    expect(screen.getByLabelText('Equipamento')).toBeTruthy()
    expect(screen.getByLabelText('Padrão de movimento')).toBeTruthy()
    expect(screen.getByLabelText('Exercício unilateral')).toBeTruthy()
    expect(screen.getByLabelText('Dicas de execução (opcional)')).toBeTruthy()
    expect(screen.getByRole('group', { name: /músculos secundários/i })).toBeTruthy()
  })
})
