import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: mocks.rpc },
}))

import { logDataAction } from './audit'

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ error: null })
})

describe('auditoria de dados', () => {
  it('omite identificadores nulos ou indefinidos da chamada RPC', async () => {
    await logDataAction({
      orgId: 'org-1',
      action: 'EXPORT_CSV',
      tableName: 'subjects',
      rowId: null,
    })

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'log_data_action', {
      p_org: 'org-1',
      p_action: 'EXPORT_CSV',
      p_table_name: 'subjects',
    })

    await logDataAction({
      orgId: 'org-1',
      action: 'PDF_REPORT',
      tableName: 'assessments',
      rowId: 'assessment-1',
      subjectId: null,
    })

    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'log_data_action', {
      p_org: 'org-1',
      p_action: 'PDF_REPORT',
      p_table_name: 'assessments',
      p_row_id: 'assessment-1',
    })
  })

  it('inclui os identificadores quando presentes', async () => {
    await logDataAction({
      orgId: 'org-1',
      action: 'SUBJECT_EXPORT',
      tableName: 'subjects',
      rowId: 'subject-1',
      subjectId: 'subject-1',
    })

    expect(mocks.rpc).toHaveBeenCalledWith('log_data_action', {
      p_org: 'org-1',
      p_action: 'SUBJECT_EXPORT',
      p_table_name: 'subjects',
      p_row_id: 'subject-1',
      p_subject_id: 'subject-1',
    })
  })
})

// O Postgres não promete ordem entre linhas empatadas, e com LIMIT/OFFSET cada
// página é uma consulta nova: os gatilhos de auditoria gravam o now() da
// transação, então excluir um aluno em cascata deixa dezenas de eventos com o
// mesmo "at". Prova no banco descartável: 8 de 1000 eventos nunca apareciam.
describe('paginação da trilha de auditoria', () => {
  it('cada evento aparece uma única vez mesmo com horários empatados', async () => {
    const rows = Array.from({ length: 130 }, (_, i) => ({
      id: i + 1,
      org_id: 'org-1',
      at: i < 120 ? '2026-10-20T12:00:00.000Z' : `2026-10-20T11:${String(i - 100).padStart(2, '0')}:00.000Z`,
    }))
    let consulta = 0
    // Ordena pelas colunas pedidas e embaralha o que sobrar empatado de um
    // jeito diferente a cada consulta, como um plano por ordenação faria.
    function builder() {
      const orders: Array<{ column: string; ascending: boolean }> = []
      const semente = ++consulta
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: (column: string, options: { ascending: boolean }) => {
          orders.push({ column, ascending: options.ascending })
          return chain
        },
        range: (from: number, to: number) => {
          const embaralho = (id: number) => (id * 7919 * semente) % 104729
          const sorted = [...rows].sort((a, b) => {
            for (const { column, ascending } of orders) {
              const x = a[column as keyof typeof a]
              const y = b[column as keyof typeof b]
              if (x < y) return ascending ? -1 : 1
              if (x > y) return ascending ? 1 : -1
            }
            return embaralho(a.id) - embaralho(b.id)
          })
          return Promise.resolve({ data: sorted.slice(from, to + 1), error: null, count: rows.length })
        },
      }
      return chain
    }
    const { supabase } = await import('../../lib/supabase')
    ;(supabase as unknown as { from: () => unknown }).from = builder

    const { listAuditLogs, AUDIT_PAGE_SIZE } = await import('./audit')
    const vistos: number[] = []
    for (let page = 0; page * AUDIT_PAGE_SIZE < rows.length; page += 1) {
      const { rows: pagina } = await listAuditLogs('org-1', page)
      vistos.push(...pagina.map((r) => r.id))
    }
    expect(vistos).toHaveLength(rows.length)
    expect(new Set(vistos).size).toBe(rows.length)
  })
})
