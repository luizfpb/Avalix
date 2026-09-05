// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useBaseVersion } from './baseVersion'

// O defeito que este hook fecha: o editor mantém os VALORES com que abriu, mas
// lia a VERSÃO do resultado da query, que o React Query revalida por
// foco/reconexão. A tela passava a mandar a versão nova com os dados velhos, e
// o guard de concorrência do banco (0023) deixava de reconhecer a edição
// defasada — a proteção se desarmava sozinha no cenário para o qual existe.

describe('useBaseVersion', () => {
  it('congela a versão com que a tela abriu, mesmo quando a query revalida', () => {
    const { result, rerender } = renderHook(({ v }) => useBaseVersion(v), {
      initialProps: { v: '2026-09-04T10:00:00.000Z' as string | null },
    })

    expect(result.current.base).toBe('2026-09-04T10:00:00.000Z')
    expect(result.current.conflict).toBe(false)

    rerender({ v: '2026-09-04T11:00:00.000Z' })

    expect(result.current.base).toBe('2026-09-04T10:00:00.000Z')
    expect(result.current.conflict).toBe(true)
  })

  it('adota a primeira versão conhecida quando a tela monta antes da query', () => {
    const { result, rerender } = renderHook(({ v }) => useBaseVersion(v), {
      initialProps: { v: null as string | null },
    })

    expect(result.current.base).toBeNull()
    expect(result.current.conflict).toBe(false)

    rerender({ v: '2026-09-04T10:00:00.000Z' })

    expect(result.current.base).toBe('2026-09-04T10:00:00.000Z')
    expect(result.current.conflict).toBe(false)
  })

  it('adopt move a base para a versão gravada, encerrando o conflito', () => {
    const { result, rerender } = renderHook(({ v }) => useBaseVersion(v), {
      initialProps: { v: '2026-09-04T10:00:00.000Z' as string | null },
    })

    rerender({ v: '2026-09-04T11:00:00.000Z' })
    expect(result.current.conflict).toBe(true)

    act(() => result.current.adopt('2026-09-04T11:00:00.000Z'))
    expect(result.current.base).toBe('2026-09-04T11:00:00.000Z')
    expect(result.current.conflict).toBe(false)
  })

  it('adopt ignora versão ausente, para não zerar a base por acidente', () => {
    const { result } = renderHook(() => useBaseVersion('2026-09-04T10:00:00.000Z'))

    act(() => result.current.adopt(null))
    expect(result.current.base).toBe('2026-09-04T10:00:00.000Z')
  })
})
