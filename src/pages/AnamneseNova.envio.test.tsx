// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import AnamneseNova from './AnamneseNova'
import { emptyAnamnesis, PARQ_ITEMS } from '../features/anamnesis/spec'

// Auditoria de 06/10/2026, A05: só o botão Salvar ficava desabilitado durante
// o envio. O que fosse digitado depois do clique ficava fora do payload, e a
// resposta levava para o detalhe sem aviso nem segunda gravação. Aqui o
// isPending acompanha a gravação de verdade, como no useMutation.

const m = vi.hoisted(() => ({ save: vi.fn(), existing: null as unknown }))
vi.mock('../features/anamnesis/hooks', async () => {
  const { useState } = await import('react')
  function useSave() {
    const [isPending, setPending] = useState(false)
    return {
      isPending,
      mutateAsync: async (input: unknown) => {
        setPending(true)
        try {
          return await m.save(input)
        } finally {
          setPending(false)
        }
      },
    }
  }
  return {
    useAnamnese: () => ({ data: m.existing, isPending: false, isError: false }),
    useCreateAnamnese: useSave,
    useUpdateAnamnese: useSave,
  }
})
vi.mock('../features/subjects/hooks', () => ({
  useSubject: () => ({ data: { id: 's1', full_name: 'Pessoa Fictícia', sex: 'F' }, isPending: false, isError: false }),
}))
vi.mock('../features/consent/hooks', () => ({
  useActiveConsent: () => ({ data: { id: 'consent' }, isPending: false, isError: false }),
}))
vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org' }, role: 'owner' }),
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('trava o formulário enquanto salva: nada fica de fora do envio', async () => {
  const answers = {
    ...emptyAnamnesis(),
    parq: Object.fromEntries(PARQ_ITEMS.map(({ key }) => [key, false])),
    ativo_regular: false, doenca_cmr_confirmada: true, sinais_sintomas_confirmados: true,
    medicamentos_confirmados: true, ocupacao: 'Professora',
    declaracao_veracidade: true, consentimento_lgpd: true,
  }
  m.existing = {
    id: 'an1', subject_id: 's1', org_id: 'org', assessed_at: '2026-10-05', payload: answers,
    created_at: '2026-10-05T12:00:00Z', updated_at: '2026-10-05T12:00:00Z',
  }
  let concluir!: (row: unknown) => void
  m.save.mockImplementation(() => new Promise((resolve) => { concluir = resolve }))
  const router = createMemoryRouter([
    { path: '/avaliados/:id/anamnese/:anamneseId/editar', element: <AnamneseNova /> },
    { path: '/avaliados/:id/anamnese/:anamneseId', element: <div>Detalhe depois de salvar</div> },
  ], { initialEntries: ['/avaliados/s1/anamnese/an1/editar'] })
  render(<RouterProvider router={router} />)

  fireEvent.change(screen.getByDisplayValue('Professora'), { target: { value: 'Professora corrigida' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => expect(m.save).toHaveBeenCalledOnce())

  // Campos, datas e confirmações ficam travados até a resposta chegar.
  const campo = screen.getByDisplayValue('Professora corrigida')
  expect(campo.matches(':disabled')).toBe(true)
  expect(screen.getByLabelText('Data da anamnese').matches(':disabled')).toBe(true)
  expect(screen.getByRole('checkbox', { name: /informações fornecidas são verdadeiras/ }).matches(':disabled')).toBe(true)

  await act(async () => concluir({ id: 'an1', updated_at: '2026-10-05T12:00:30Z' }))
  expect(await screen.findByText('Detalhe depois de salvar')).toBeTruthy()
  expect(m.save).toHaveBeenCalledOnce()
  expect(m.save.mock.calls[0][0].answers.ocupacao).toBe('Professora corrigida')
})
