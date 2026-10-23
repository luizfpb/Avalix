// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { signed, calls, orgUpdate, updated } = vi.hoisted(() => ({
  signed: vi.fn(), calls: [] as string[], orgUpdate: vi.fn(),
  // linhas que o update devolve; a policy recusa em silêncio com 0 linhas
  updated: { rows: [{ id: 'org-1' }] as { id: string }[] },
}))
vi.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: signed,
        remove: async (paths: string[]) => { calls.push(`remove ${paths.join(',')}`); return { data: [], error: null } },
      }),
    },
    from: (table: string) => ({
      update: (values: unknown) => ({
        eq: (_col: string, id: string) => {
          calls.push(`update ${table} ${id}`)
          orgUpdate(values)
          return Object.assign(Promise.resolve({ error: null }), {
            select: async () => ({ data: updated.rows, error: null }),
          })
        },
      }),
    }),
  },
}))
import { LOGO_STORED_MAX_BYTES, loadOrgLogoDataUrl, prepareOrgLogo, removeOrgLogo } from './logo'

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

function fileOf(mime: string, size: number) {
  return new File([new Uint8Array(size)], 'logo', { type: mime })
}

function stubCanvas(sizes: Record<number, number>) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
  return vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback, mime) {
    const side = Math.max(this.width, this.height)
    callback(new Blob([new Uint8Array(sizes[side] ?? 10)], { type: mime }))
  })
}

describe('preparo do logo antes do envio', () => {
  it('sobe intacto o arquivo que já cabe em 1024 px e 1 MB', async () => {
    const bitmap = { width: 800, height: 400, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    const toBlob = stubCanvas({})
    const file = fileOf('image/png', 200_000)
    expect(await prepareOrgLogo(file)).toBe(file)
    expect(toBlob).not.toHaveBeenCalled()
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
  it('reduz JPEG grande para 1024 px mantendo JPEG', async () => {
    const bitmap = { width: 4000, height: 3000, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    const toBlob = stubCanvas({ 1024: 300_000 })
    const out = await prepareOrgLogo(fileOf('image/jpeg', 6 * 1024 * 1024))
    expect(out.type).toBe('image/jpeg')
    expect(out.size).toBe(300_000)
    expect(toBlob).toHaveBeenCalledOnce()
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
  it('converte WebP para PNG e encolhe até caber em 1 MB', async () => {
    const bitmap = { width: 2000, height: 2000, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    const toBlob = stubCanvas({ 1024: LOGO_STORED_MAX_BYTES + 1, 768: 900_000 })
    const out = await prepareOrgLogo(fileOf('image/webp', 3 * 1024 * 1024))
    expect(out.type).toBe('image/png')
    expect(out.size).toBe(900_000)
    expect(toBlob).toHaveBeenCalledTimes(2)
  })
  it('recusa quando nem 512 px cabe em 1 MB', async () => {
    const bitmap = { width: 3000, height: 3000, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    const big = LOGO_STORED_MAX_BYTES + 1
    stubCanvas({ 1024: big, 768: big, 512: big })
    await expect(prepareOrgLogo(fileOf('image/png', 5 * 1024 * 1024))).rejects.toThrow('Não foi possível reduzir')
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
  it('recusa arquivo acima de 10 MB sem decodificar', async () => {
    const decode = vi.fn()
    vi.stubGlobal('createImageBitmap', decode)
    await expect(prepareOrgLogo(fileOf('image/png', 10 * 1024 * 1024 + 1))).rejects.toThrow('no máximo 10 MB')
    expect(decode).not.toHaveBeenCalled()
  })
  it('recusa formato fora da lista e imagem que não decodifica', async () => {
    await expect(prepareOrgLogo(fileOf('image/gif', 100))).rejects.toThrow('PNG, JPEG ou WebP')
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('decode') }))
    await expect(prepareOrgLogo(fileOf('image/png', 100))).rejects.toThrow('Não foi possível ler a imagem')
  })
})

describe('remoção do logo', () => {
  beforeEach(() => { calls.length = 0; orgUpdate.mockReset(); updated.rows = [{ id: 'org-1' }] })
  it('desvincula a organização antes de apagar as três chaves canônicas', async () => {
    await removeOrgLogo('org-1')
    expect(orgUpdate).toHaveBeenCalledWith({ logo_path: null })
    expect(calls).toEqual([
      'update organizations org-1',
      'remove org-1/logo.png,org-1/logo.jpg,org-1/logo.webp',
    ])
  })
  // Sem papel de dono/admin ou com o 2FA pendente, a policy não atualiza nada
  // e não devolve erro: a tela ficava calada e o logo continuava lá.
  it('recusa quando a organização não foi atualizada, sem mexer no Storage', async () => {
    updated.rows = []
    await expect(removeOrgLogo('org-1')).rejects.toThrow(/Não foi possível remover o logo/)
    expect(calls).toEqual(['update organizations org-1'])
  })
})
