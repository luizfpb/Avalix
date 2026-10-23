import { afterEach, describe, expect, it, vi } from 'vitest'

// Resposta perdida depois de gravar: a tela dizia "Falha de conexão… tente de
// novo" e o segundo "Salvar" gravava outra anamnese igual (dado de saúde em
// dobro no histórico do aluno). O "servidor" abaixo imita o PostgREST: grava,
// pode perder a resposta e recusa id repetido com 23505 na chave primária.
const { tabela, perder } = vi.hoisted(() => ({
  tabela: [] as Array<Record<string, unknown>>,
  perder: { vezes: 0 },
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: (values: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            const id = (values.id as string | undefined) ?? crypto.randomUUID()
            if (tabela.some((row) => row.id === id)) {
              return {
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint "anamneses_pkey"' },
              }
            }
            const row = { ...values, id }
            tabela.push(row)
            if (perder.vezes > 0) {
              perder.vezes -= 1
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
    }),
  },
}))

import { createAnamnese } from './api'
import { emptyAnamnesis, PARQ_ITEMS } from './spec'

afterEach(() => {
  tabela.length = 0
})

describe('createAnamnese com resposta perdida', () => {
  it('a nova tentativa da mesma ação devolve a anamnese gravada, sem outra', async () => {
    const input = {
      orgId: 'org-1',
      subjectId: 'subject-1',
      assessedAt: '2026-10-23',
      answers: {
        ...emptyAnamnesis(),
        parq: Object.fromEntries(PARQ_ITEMS.map((i) => [i.key, false])),
        ativo_regular: false,
        doenca_cmr_confirmada: true,
        sinais_sintomas_confirmados: true,
        medicamentos_confirmados: true,
      },
      id: '0b9f3c1e-8a52-4e0e-9a51-6b6f7d2a1c11',
    }
    perder.vezes = 1
    await expect(createAnamnese(input)).rejects.toThrow('Failed to fetch')
    const segunda = await createAnamnese(input)
    expect(segunda.id).toBe(input.id)
    expect(tabela).toHaveLength(1)
  })
})
