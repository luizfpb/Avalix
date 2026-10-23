// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AvaliadoForm from './AvaliadoForm'

// Resposta perdida depois de gravar: o servidor criou o aluno, a tela recebeu
// "Falha de conexão… tente de novo", e o segundo "Salvar" criava OUTRO aluno
// (que ainda ocupa vaga do plano). A identidade tem de ser da ação, não de
// cada tentativa. O "servidor" abaixo imita o PostgREST: grava, pode perder a
// resposta e recusa id repetido com 23505 na chave primária.
const { tabela, perderResposta } = vi.hoisted(() => ({
  tabela: [] as Array<Record<string, unknown>>,
  perderResposta: { vezes: 0 },
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'subjects') throw new Error(`tabela inesperada: ${table}`)
      return {
        insert: (values: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              const id = (values.id as string | undefined) ?? crypto.randomUUID()
              if (tabela.some((row) => row.id === id)) {
                return {
                  data: null,
                  error: { code: '23505', message: 'duplicate key value violates unique constraint "subjects_pkey"' },
                }
              }
              const row = { ...values, id, is_active: true, updated_at: '2026-10-23T12:00:00Z' }
              tabela.push(row)
              if (perderResposta.vezes > 0) {
                perderResposta.vezes -= 1
                throw new TypeError('Failed to fetch')
              }
              return { data: row, error: null }
            },
          }),
        }),
        select: () => ({
          eq: (_col: string, id: string) => ({
            maybeSingle: async () => ({ data: tabela.find((row) => row.id === id) ?? null, error: null }),
          }),
        }),
      }
    },
  },
}))

vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org-1', subject_term: 'aluno' }, role: 'owner' }),
}))

afterEach(() => {
  cleanup()
  tabela.length = 0
})

describe('Novo aluno com resposta perdida', () => {
  it('o segundo "Salvar" não cria outro aluno', async () => {
    perderResposta.vezes = 1
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <MemoryRouter initialEntries={['/avaliados/novo']}>
          <Routes>
            <Route path="/avaliados/novo" element={<AvaliadoForm />} />
            <Route path="/avaliados/:id" element={<p>ficha do aluno</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Maria da Silva' } })
    fireEvent.change(screen.getByLabelText('Data de nascimento'), { target: { value: '1990-05-10' } })
    fireEvent.change(screen.getByLabelText('Sexo'), { target: { value: 'F' } })

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/conexão/i)
    expect(tabela).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('ficha do aluno')).toBeTruthy()
    expect(tabela).toHaveLength(1)
  })
})
