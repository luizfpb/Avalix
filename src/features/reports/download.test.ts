// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadBlob } from './download'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('downloadBlob', () => {
  it('mantém a URL do arquivo viva enquanto o Safari ainda lê o blob', () => {
    vi.useFakeTimers()
    const create = vi.fn(() => 'blob:avalix/laudo')
    const revoke = vi.fn()
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadBlob(new Blob(['%PDF'], { type: 'application/pdf' }), 'laudo.pdf')

    expect(click).toHaveBeenCalledOnce()
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(revoke).toHaveBeenCalledWith('blob:avalix/laudo')
  })
})
