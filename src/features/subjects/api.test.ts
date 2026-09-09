import { beforeEach, expect, it, vi } from 'vitest'
const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { from } }))
import { updateSubject } from './api'

let row: Record<string, unknown> | null
beforeEach(() => {
  row = { id: 's1', phone: 'novo telefone', height_cm: 170, updated_at: 'versao-2' }
  from.mockReset().mockImplementation(() => {
    let patch: Record<string, unknown> | undefined
    const filters: [string, unknown][] = []
    const query = {
      update(value: Record<string, unknown>) { patch = value; return query },
      eq(column: string, value: unknown) { filters.push([column, value]); return query },
      select() { return query },
      async maybeSingle() {
        if (!row || !filters.every(([key, value]) => row![key] === value)) return { data: null, error: null }
        if (patch) row = { ...row, ...patch }
        return { data: row, error: null }
      },
    }
    return query
  })
})

it('recusa o snapshot antigo e mantém os dados mais recentes', async () => {
  await expect(updateSubject('s1', { phone: 'antigo', height_cm: 168 }, 'versao-1')).rejects.toThrow('alterado em outro dispositivo')
  expect(row).toMatchObject({ phone: 'novo telefone', height_cm: 170, updated_at: 'versao-2' })
})

it('salva quando a versão carregada ainda é atual', async () => {
  await expect(updateSubject('s1', { phone: 'alterado agora' }, 'versao-2')).resolves.toMatchObject({
    phone: 'alterado agora', height_cm: 170,
  })
})

it('não envia update sem uma versão-base', async () => {
  await expect(updateSubject('s1', { phone: 'alterado' }, '')).rejects.toThrow('confirmar a versão')
  expect(from).not.toHaveBeenCalled()
})

it('distingue registro indisponível de edição concorrente', async () => {
  row = null
  await expect(updateSubject('s1', { phone: 'alterado' }, 'versao-1')).rejects.toThrow('não está mais disponível')
})
