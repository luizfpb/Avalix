// @vitest-environment jsdom
import { StrictMode, useState } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllPrivateDrafts, clearDraft, loadDraft, purgeExpiredDrafts, saveDraft, setPrivateDraftScope, useFormDraft } from './draft'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  setPrivateDraftScope('user-a', 'org-a')
  vi.useFakeTimers()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

function editor(key = 'cadastro') {
  return renderHook(({ text }) => useFormDraft(key, { text }, vi.fn()), {
    initialProps: { text: 'inicial' },
  })
}

describe('persistência do rascunho nas transições', () => {
  it('descarrega a última alteração ao desmontar antes dos 600 ms', () => {
    const { rerender, unmount } = editor()
    act(() => vi.advanceTimersByTime(650))
    rerender({ text: 'última alteração' })
    act(() => vi.advanceTimersByTime(100))
    unmount()
    expect(loadDraft('cadastro')).toEqual({ text: 'última alteração' })
  })

  it('descarrega ao sair do documento, sem depender do timer da aba', () => {
    const { rerender } = editor()
    rerender({ text: 'antes de fechar' })
    act(() => window.dispatchEvent(new Event('pagehide')))
    expect(loadDraft('cadastro')).toEqual({ text: 'antes de fechar' })
  })

  it('não ressuscita o rascunho limpo após salvar com sucesso', () => {
    const { rerender, unmount } = editor()
    rerender({ text: 'conteúdo enviado' })
    clearDraft('cadastro')
    act(() => vi.advanceTimersByTime(650))
    unmount()
    expect(loadDraft('cadastro')).toBeNull()
  })

  it('logout seguido de outra conta não recebe a escrita pendente', () => {
    const { rerender, unmount } = editor()
    rerender({ text: 'privado de A' })
    clearAllPrivateDrafts()
    setPrivateDraftScope('user-b', 'org-b')
    unmount()
    expect(localStorage.length).toBe(0)
  })

  it('mudar a organização sem desmontar antes não transfere o rascunho', () => {
    const { rerender, unmount } = editor()
    rerender({ text: 'pertence a org A' })
    setPrivateDraftScope('user-a', 'org-b')
    act(() => vi.advanceTimersByTime(650))
    unmount()
    expect(loadDraft('cadastro')).toBeNull()
  })

  it('separa a descarga da chave antiga do preenchimento da nova', () => {
    const { rerender, unmount } = renderHook(
      ({ key, text }) => useFormDraft(key, { text }, vi.fn()),
      { initialProps: { key: 'pessoa-a', text: 'valor A' } },
    )
    rerender({ key: 'pessoa-a', text: 'final A' })
    rerender({ key: 'pessoa-b', text: 'valor B' })
    unmount()
    expect(loadDraft('pessoa-a')).toEqual({ text: 'final A' })
    expect(loadDraft('pessoa-b')).toEqual({ text: 'valor B' })
  })

  it('restauração em StrictMode nunca descarrega os valores vazios sobre o salvo', () => {
    saveDraft('existente', { text: 'preservar' })
    const { result, unmount } = renderHook(() => {
      const [value, setValue] = useState({ text: '' })
      useFormDraft('existente', value, setValue)
      return value
    }, { wrapper: StrictMode })
    expect(result.current.text).toBe('preservar')
    unmount()
    expect(loadDraft('existente')).toEqual({ text: 'preservar' })
  })

  it('não recria o rascunho público limpo ao concluir o intake', () => {
    const { rerender, unmount } = renderHook(
      ({ text }) => useFormDraft('intake:a', { text }, vi.fn(), { storage: 'session' }),
      { initialProps: { text: 'respostas' } },
    )
    rerender({ text: 'respostas finais' })
    clearDraft('intake:a', { storage: 'session' })
    unmount()
    expect(loadDraft('intake:a', Date.now(), { storage: 'session' })).toBeNull()
  })

  it('nova edição após o TTL público volta a persistir sem remontar a tela', () => {
    const { rerender, unmount } = renderHook(
      ({ text }) => useFormDraft('intake:ttl', { text }, vi.fn(), { storage: 'session' }),
      { initialProps: { text: 'antes da pausa' } },
    )
    act(() => vi.advanceTimersByTime(650))
    act(() => { vi.advanceTimersByTime(2 * 60 * 60_000 + 1); purgeExpiredDrafts() })
    expect(loadDraft('intake:ttl', Date.now(), { storage: 'session' })).toBeNull()
    rerender({ text: 'nova resposta depois da pausa' })
    unmount()
    expect(loadDraft('intake:ttl', Date.now(), { storage: 'session' })).toEqual({ text: 'nova resposta depois da pausa' })
  })

  it('desmontagem após expirar não recria o conteúdo antigo', () => {
    const { unmount } = editor()
    act(() => vi.advanceTimersByTime(650))
    act(() => { vi.advanceTimersByTime(24 * 60 * 60_000 + 1); purgeExpiredDrafts() })
    unmount()
    expect(loadDraft('cadastro')).toBeNull()
  })

  it('housekeeping conserva uma edição recente ainda esperando o debounce', () => {
    const { rerender, unmount } = editor()
    act(() => vi.advanceTimersByTime(650))
    act(() => vi.advanceTimersByTime(24 * 60 * 60_000 + 1))
    rerender({ text: 'nova edição pouco antes da limpeza' })
    purgeExpiredDrafts()
    unmount()
    expect(loadDraft('cadastro')).toEqual({ text: 'nova edição pouco antes da limpeza' })
  })
})
