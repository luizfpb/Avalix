import { describe, expect, it, vi } from 'vitest'
// @ts-expect-error helper JS operacional sem declaração .d.ts
import { isTransientError, withRetry } from '../../scripts/lib/retry.mjs'

describe('retry de scripts operacionais (backup/storage)', () => {
  it('classifica HTTP 522 do Supabase Storage e erros de rede como transitórios', () => {
    expect(isTransientError({ __isStorageError: true, status: 522, statusCode: '522' })).toBe(true)
    expect(isTransientError({ statusCode: '503' })).toBe(true)
    expect(isTransientError({ code: 'ECONNRESET' })).toBe(true)
    expect(isTransientError({ cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } })).toBe(true)
    expect(isTransientError(Object.assign(new Error('truncado'), { transient: true }))).toBe(true)
  })

  it('não retenta erros permanentes de autenticação, permissão ou requisição inválida', () => {
    expect(isTransientError({ status: 400 })).toBe(false)
    expect(isTransientError({ status: 401 })).toBe(false)
    expect(isTransientError({ status: 403 })).toBe(false)
    expect(isTransientError({ status: 404 })).toBe(false)
    expect(isTransientError(new Error('Objeto do Storage contém path inseguro'))).toBe(false)
  })

  it('refaz a operação com backoff e retorna sucesso quando a instabilidade passa', async () => {
    const delays: number[] = []
    let calls = 0

    const result = await withRetry(
      'download photos/a.jpg',
      async () => {
        calls++
        if (calls < 3) {
          throw { __isStorageError: true, status: 522, statusCode: '522' }
        }
        return 'ok'
      },
      {
        attempts: 4,
        delaysMs: [5_000, 15_000, 30_000],
        sleep: async (ms: number) => { delays.push(ms) },
        onRetry: vi.fn(),
      },
    )

    expect(result).toBe('ok')
    expect(calls).toBe(3)
    expect(delays).toEqual([5_000, 15_000])
  })

  it('aborta imediatamente em erro permanente sem esperar backoff', async () => {
    const sleep = vi.fn()
    const fn = vi.fn().mockRejectedValue({ status: 403, message: 'Forbidden' })

    await expect(
      withRetry('list photos', fn, { attempts: 4, delaysMs: [100], sleep, onRetry: vi.fn() }),
    ).rejects.toMatchObject({ status: 403 })

    expect(fn).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('propaga o último erro quando esgota todas as tentativas', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const err = { status: 522, statusCode: '522' }
    const fn = vi.fn().mockRejectedValue(err)

    await expect(
      withRetry('download photos/b.jpg', fn, { attempts: 3, delaysMs: [100, 200], sleep, onRetry: vi.fn() }),
    ).rejects.toBe(err)

    expect(fn).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })
})
