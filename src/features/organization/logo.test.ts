// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { signed } = vi.hoisted(() => ({ signed: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { storage: { from: () => ({ createSignedUrl: signed }) } } }))
import { loadOrgLogoDataUrl } from './logo'

const fetchMock = vi.fn()
beforeEach(() => {
  signed.mockReset().mockResolvedValue({ data: { signedUrl: 'https://example.test/logo' }, error: null })
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function respond(blob: Blob) {
  fetchMock.mockResolvedValue({ ok: true, blob: async () => blob })
}

describe('logo nos relatórios', () => {
  it('retorna null somente quando não há logo configurado', async () => {
    expect(await loadOrgLogoDataUrl(null)).toBeNull()
    expect(signed).not.toHaveBeenCalled()
  })
  it.each(['image/png', 'image/jpeg'])('preserva %s sem reencodar', async (mime) => {
    respond(new Blob(['bytes originais'], { type: mime }))
    expect(await loadOrgLogoDataUrl('org/logo.png')).toBe(`data:${mime};base64,Ynl0ZXMgb3JpZ2luYWlz`)
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/logo', { cache: 'no-store' })
  })
  it('converte WebP para PNG, preserva proporção e libera o bitmap', async () => {
    respond(new Blob(['webp'], { type: 'image/webp' }))
    const bitmap = { width: 4096, height: 1024, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback, mime) {
      expect(this.width).toBe(2048)
      expect(this.height).toBe(512)
      expect(mime).toBe('image/png')
      callback(new Blob(['png'], { type: 'image/png' }))
    })
    expect(await loadOrgLogoDataUrl('org/logo.webp')).toBe('data:image/png;base64,cG5n')
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2048, 512)
    expect(toBlob).toHaveBeenCalledOnce()
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
  it('expõe erro de conversão e libera o bitmap, sem prometer PDF sem logo', async () => {
    respond(new Blob(['webp'], { type: 'image/webp' }))
    const bitmap = { width: 100, height: 50, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(loadOrgLogoDataUrl('org/logo.webp')).rejects.toThrow('Não foi possível preparar o logo')
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
  it('expõe falha ao assinar o logo configurado', async () => {
    signed.mockResolvedValue({ data: null, error: { message: 'Sem acesso' } })
    await expect(loadOrgLogoDataUrl('org/logo.webp')).rejects.toThrow('Não foi possível carregar o logo')
  })
  it('expõe falha HTTP no download e não a confunde com ausência de logo', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 })
    await expect(loadOrgLogoDataUrl('org/logo.png')).rejects.toThrow('Não foi possível preparar o logo')
  })
})
