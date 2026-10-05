// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WorkoutLinkCard } from './WorkoutLinkCard'

const m = vi.hoisted(() => ({ issue: vi.fn<(subjectId: string) => Promise<{ url: string }>>() }))
vi.mock('./hooks', () => ({
  useWorkoutLink: (subjectId: string) => ({ data: { id: `link-${subjectId}`, expires_at: '2026-10-01', sessions_count: 0 } }),
  useIssueWorkoutLink: (subjectId: string) => ({ mutateAsync: () => m.issue(subjectId) }),
  useRevokeWorkoutLink: () => ({}),
}))
vi.mock('./linkStore', () => ({ loadWorkoutLinkLocal: (subjectId: string) => `https://example.test/t#token-local-${subjectId}` }))
afterEach(() => { cleanup(); m.issue.mockReset() })

it('não reutiliza o link de treino emitido para outro avaliado', async () => {
  m.issue.mockImplementation(async (subjectId) => ({ url: `https://example.test/t#token-ficticio-${subjectId}` }))
  const { rerender } = render(<WorkoutLinkCard subjectId="alice" subjectName="Alice Ficticia" orgName="Org" />)
  fireEvent.click(screen.getByRole('button', { name: 'Emitir novo link' }))
  fireEvent.click(screen.getByRole('button', { name: 'Emitir link novo' }))
  await waitFor(() => expect(decodeURIComponent(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')!)).toContain('token-ficticio-alice'))
  rerender(<WorkoutLinkCard subjectId="bruno" subjectName="Bruno Ficticio" orgName="Org" />)
  const message = decodeURIComponent(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')!)
  expect(message).toContain('Bruno, este é o seu treino')
  expect(message).not.toContain('token-ficticio-alice')
  expect(message).toContain('token-local-bruno')
})

it('uma emissão tardia do perfil anterior não substitui o link do perfil aberto', async () => {
  let finish!: (result: { url: string }) => void
  m.issue.mockReturnValue(new Promise((resolve) => { finish = resolve }))
  const { rerender } = render(<WorkoutLinkCard subjectId="alice" subjectName="Alice" orgName="Org" />)
  fireEvent.click(screen.getByRole('button', { name: 'Emitir novo link' }))
  fireEvent.click(screen.getByRole('button', { name: 'Emitir link novo' }))
  rerender(<WorkoutLinkCard subjectId="bruno" subjectName="Bruno" orgName="Org" />)
  await act(async () => finish({ url: 'https://example.test/t#token-tardio-alice' }))
  const message = decodeURIComponent(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')!)
  expect(message).toContain('token-local-bruno')
  expect(message).not.toContain('token-tardio-alice')
})

// Reemitir derruba o link do celular do aluno e, com ele, o treino feito sem
// internet que ainda não subiu. A tela dizia que reemitir não custava nada.
it('emitir um link novo pergunta antes e explica o efeito no celular do aluno', async () => {
  m.issue.mockResolvedValue({ url: 'https://example.test/t#token-novo' })
  render(<WorkoutLinkCard subjectId="alice" subjectName="Alice Ficticia" orgName="Org" />)
  fireEvent.click(screen.getByRole('button', { name: 'Emitir novo link' }))
  expect(screen.getByText('Emitir um link novo?')).toBeTruthy()
  expect(screen.getByText(/para de funcionar no celular de Alice/)).toBeTruthy()
  expect(screen.getByText(/ainda não subiram saem do aparelho dele/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
  expect(m.issue).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Emitir novo link' }))
  fireEvent.click(screen.getByRole('button', { name: 'Emitir link novo' }))
  await waitFor(() => expect(m.issue).toHaveBeenCalledOnce())
})
