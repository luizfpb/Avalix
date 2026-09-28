// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import PosturaFoto from './PosturaFoto'
import type { Shape } from '../features/posture/annotations'

const m = vi.hoisted(() => ({
  save: vi.fn(),
  row: { id: 'foto', session_id: 'sessao', storage_path: 'foto.webp', category: 'frente' },
  session: { id: 'sessao', subject_id: 'aluno' },
}))
vi.mock('react-router', async (importOriginal) => ({ ...await importOriginal<typeof import('react-router')>(), useParams: () => ({ id: 'aluno', sessionId: 'sessao', photoId: 'foto' }), useBlocker: () => ({ state: 'unblocked' }) }))
vi.mock('../features/organization/context', () => ({ useOrganization: () => ({ organization: { id: 'org' } }) }))
vi.mock('../features/posture/hooks', () => ({
  usePhoto: () => ({ data: m.row }), useSession: () => ({ data: m.session }),
  useAnnotation: () => ({ data: { rowId: 'anotacao', doc: { shapes: [] } } }),
  useSaveAnnotation: () => ({ mutateAsync: m.save }), useSignedUrls: () => ({ data: { 'foto.webp': 'data:mock' } }),
}))
vi.mock('../components/AnnotationCanvas', () => ({ AnnotationCanvas: ({ shapes, onChange }: { shapes: Shape[]; onChange: (shapes: Shape[]) => void }) => <div><span data-testid="quantidade">{shapes.length}</span><button onClick={() => onChange([...shapes, { id: String(shapes.length), type: 'point', points: [{ x: 0.2, y: 0.3 }] }])}>Anotar ponto teste</button></div> }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  m.session = { id: 'sessao', subject_id: 'aluno' }
})

it('recusa abrir a foto quando a sessão é de outro avaliado', () => {
  m.session = { id: 'sessao', subject_id: 'outro-aluno' }
  render(<MemoryRouter><PosturaFoto /></MemoryRouter>)
  expect(screen.getByRole('alert').textContent).toMatch(/Esta foto não pertence a este avaliado/)
  expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
})

it('mantém pendente a anotação adicionada durante o salvamento até persistir a versão nova', async () => {
  let resolveSave!: (id: string) => void
  m.save.mockReturnValue(new Promise<string>((resolve) => { resolveSave = resolve }))
  render(<MemoryRouter><PosturaFoto /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Anotar ponto teste' }))
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Anotar ponto teste' }))
  expect(m.save.mock.calls[0][0].shapes).toHaveLength(1)
  expect(screen.getByTestId('quantidade').textContent).toBe('2')
  await act(async () => resolveSave('anotacao'))
  expect(screen.getByText('Não salvo')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(false)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar' })))
  expect(m.save.mock.calls[1][0]).toMatchObject({ rowId: 'anotacao' })
  expect(m.save.mock.calls[1][0].shapes).toHaveLength(2)
  expect(screen.queryByText('Não salvo')).toBeNull()
})
