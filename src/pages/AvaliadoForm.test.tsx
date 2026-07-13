// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import AvaliadoForm, { DangerZone } from './AvaliadoForm'

// Fluxo crítico (v2.0): a exclusão definitiva (LGPD) só pode disparar com o
// nome exato digitado — trava contra clique acidental.

const { deleteMock, refetchMock } = vi.hoisted(() => ({ deleteMock: vi.fn(), refetchMock: vi.fn() }))

vi.mock('../features/subjects/hooks', () => ({
  useSubject: () => ({ data: null, isPending: false, isError: true, refetch: refetchMock }),
  useCreateSubject: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useUpdateSubject: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useDeleteSubject: () => ({ mutateAsync: deleteMock, isPending: false, error: null }),
}))

vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org1', subject_term: 'aluno' }, role: 'owner' }),
}))

function renderZone() {
  return render(
    <MemoryRouter>
      <DangerZone subjectId="s1" subjectName="Maria Silva" orgId="org1" termSingular="aluno" />
    </MemoryRouter>
  )
}

beforeEach(() => deleteMock.mockReset().mockResolvedValue(undefined))
afterEach(cleanup)

describe('DangerZone — exclusão definitiva', () => {
  it('botão começa desabilitado e nome errado não habilita', () => {
    renderZone()
    const btn = screen.getByRole('button', { name: /Excluir definitivamente/ })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('Maria Silva'), {
      target: { value: 'Maria' },
    })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(btn)
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('nome exato habilita e dispara a exclusão', async () => {
    renderZone()
    fireEvent.change(screen.getByPlaceholderText('Maria Silva'), {
      target: { value: 'Maria Silva' },
    })
    const btn = screen.getByRole('button', { name: /Excluir definitivamente/ })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(btn)
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('s1'))
  })

  it('nome com espaços nas pontas ainda casa (trim)', () => {
    renderZone()
    fireEvent.change(screen.getByPlaceholderText('Maria Silva'), {
      target: { value: '  Maria Silva  ' },
    })
    const btn = screen.getByRole('button', { name: /Excluir definitivamente/ })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('AvaliadoForm — falha no modo de edição', () => {
  it('bloqueia o formulário vazio e oferece nova tentativa', () => {
    render(
      <MemoryRouter initialEntries={['/avaliados/s1/editar']}>
        <Routes>
          <Route path="/avaliados/:id/editar" element={<AvaliadoForm />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByRole('alert').textContent).toMatch(/formulário foi bloqueado/i)
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(refetchMock).toHaveBeenCalledTimes(1)
  })
})
