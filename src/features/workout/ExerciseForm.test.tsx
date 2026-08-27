// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExerciseForm } from './ExerciseForm'

vi.mock('../auth/context', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
vi.mock('./hooks', () => ({
  useCreateCustomExercise: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateCustomExercise: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))

afterEach(cleanup)

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
