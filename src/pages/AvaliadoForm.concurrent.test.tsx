// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import AvaliadoForm from './AvaliadoForm'

const { subjectQuery, update } = vi.hoisted(() => ({ subjectQuery: vi.fn(), update: vi.fn() }))
vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org-audit', subject_term: 'aluno' }, role: 'evaluator' }),
}))
vi.mock('../features/subjects/hooks', () => ({
  useSubject: subjectQuery,
  useCreateSubject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSubject: () => ({ mutateAsync: update, isPending: false }),
  useDeleteSubject: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
const subject = {
  id: 'subject-audit', org_id: 'org-audit', full_name: 'Mariana de Teste',
  birth_date: '1990-01-01', sex: 'F', height_cm: 168, phone: '11900000000',
  email: 'teste@example.com', notes: 'original', guardian_name: null,
  guardian_relationship: null, is_active: true, updated_at: '2026-09-08T10:00:00Z',
}
function tree() {
  return <MemoryRouter initialEntries={['/avaliados/subject-audit/editar']}>
    <Routes>
      <Route path="/avaliados/:id/editar" element={<AvaliadoForm />} />
      <Route path="/avaliados/:id" element={<p>Cadastro salvo</p>} />
    </Routes>
  </MemoryRouter>
}
beforeEach(() => {
  subjectQuery.mockReturnValue({ data: subject, isPending: false, isError: false })
  update.mockReset().mockResolvedValue(subject)
})
afterEach(cleanup)

it('refetch de outra alteração conserva o telefone digitado e avisa o conflito', () => {
  const { rerender } = render(tree())
  fireEvent.change(screen.getByLabelText(/Telefone/), { target: { value: '11999999999' } })
  subjectQuery.mockReturnValue({ data: { ...subject, height_cm: 170, updated_at: '2026-09-08T11:00:00Z' }, isPending: false, isError: false })
  rerender(tree())
  expect(screen.getByLabelText(/Telefone/)).toHaveProperty('value', '11999999999')
  expect(screen.getByLabelText(/Altura/)).toHaveProperty('value', '168')
  expect(screen.getByRole('alert').textContent).toMatch(/alterado em outro dispositivo/i)
})

it('envia a versão da abertura, mesmo que a query tenha sido revalidada', async () => {
  const { rerender } = render(tree())
  fireEvent.change(screen.getByLabelText(/Telefone/), { target: { value: '11999999999' } })
  subjectQuery.mockReturnValue({ data: { ...subject, updated_at: '2026-09-08T11:00:00Z' }, isPending: false, isError: false })
  rerender(tree())
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  await waitFor(() => expect(update).toHaveBeenCalledOnce())
  expect(update.mock.calls[0][0]).toMatchObject({
    patch: { phone: '11999999999', height_cm: 168 },
    expectedUpdatedAt: subject.updated_at,
  })
})

it('erro de refetch com dados preservados não retira o formulário', () => {
  const { rerender } = render(tree())
  fireEvent.change(screen.getByLabelText(/Telefone/), { target: { value: '11999999999' } })
  subjectQuery.mockReturnValue({ data: subject, isPending: false, isError: true, refetch: vi.fn() })
  rerender(tree())
  expect(screen.getByLabelText(/Telefone/)).toHaveProperty('value', '11999999999')
  expect(screen.getByRole('button', { name: 'Salvar' })).toBeTruthy()
})

it('recusa de versão mantém o preenchimento e mostra o motivo', async () => {
  update.mockRejectedValue(new Error('Este cadastro foi alterado em outro dispositivo.'))
  render(tree())
  fireEvent.change(screen.getByLabelText(/Telefone/), { target: { value: '11999999999' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  await screen.findByText('Este cadastro foi alterado em outro dispositivo.')
  expect(screen.getByLabelText(/Telefone/)).toHaveProperty('value', '11999999999')
})
