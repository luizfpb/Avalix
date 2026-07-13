import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  list: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({ remove: mocks.remove, list: mocks.list })),
    },
  },
}))

import { removePhotoObjectsVerified, StorageRemovalError } from './storage'

beforeEach(() => {
  mocks.remove.mockReset().mockResolvedValue({ error: null })
  mocks.list.mockReset()
})

describe('remocao verificada de fotos', () => {
  it('divide remocoes acima de 1000 objetos', async () => {
    const paths = Array.from({ length: 1001 }, (_, i) => `org/session/foto-${i}.webp`)
    mocks.list
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, (_, i) => ({ name: `outro-${i}` })),
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null })

    await removePhotoObjectsVerified(paths)

    expect(mocks.remove).toHaveBeenCalledTimes(2)
    expect(mocks.remove.mock.calls[0][0]).toHaveLength(1000)
    expect(mocks.remove.mock.calls[1][0]).toHaveLength(1)
    expect(mocks.list).toHaveBeenNthCalledWith(
      2,
      'org/session',
      expect.objectContaining({ limit: 1000, offset: 1000 })
    )
  })

  it('encontra remanescente depois da primeira pagina', async () => {
    const target = 'org/session/foto-restante.webp'
    mocks.list
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, (_, i) => ({ name: `outro-${i}` })),
        error: null,
      })
      .mockResolvedValueOnce({ data: [{ name: 'foto-restante.webp' }], error: null })

    await expect(removePhotoObjectsVerified([target])).rejects.toEqual(
      expect.objectContaining<Partial<StorageRemovalError>>({ remaining: [target] })
    )
  })

  it('remove duplicatas antes de chamar a API', async () => {
    mocks.list.mockResolvedValue({ data: [], error: null })
    await removePhotoObjectsVerified(['org/s/a.webp', 'org/s/a.webp'])
    expect(mocks.remove).toHaveBeenCalledWith(['org/s/a.webp'])
  })
})
