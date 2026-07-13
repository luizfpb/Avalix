import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  insertSingle: vi.fn(),
  deleteEq: vi.fn(),
  removeVerified: vi.fn(),
}))

vi.mock('../../lib/storage', () => ({
  removePhotoObjectsVerified: mocks.removeVerified,
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    storage: { from: vi.fn(() => ({ upload: mocks.upload })) },
    from: vi.fn(() => ({
      insert: vi.fn(() => ({ select: vi.fn(() => ({ single: mocks.insertSingle })) })),
      delete: vi.fn(() => ({ eq: mocks.deleteEq })),
    })),
  },
}))

import { addPhoto } from './api'

const photo = {
  id: 'photo-1',
  storage_path: 'org/session/main.webp',
  thumb_path: 'org/session/thumb.webp',
}

const input = {
  orgId: 'org',
  sessionId: 'session',
  category: 'frente' as const,
  customLabel: null,
  image: {
    main: new Blob(['main'], { type: 'image/webp' }),
    thumb: new Blob(['thumb'], { type: 'image/webp' }),
    mime: 'image/webp' as const,
    format: 'webp' as const,
    width: 100,
    height: 200,
    sizeBytes: 10,
  },
}

beforeEach(() => {
  mocks.upload.mockReset()
  mocks.insertSingle.mockReset().mockResolvedValue({ data: photo, error: null })
  mocks.deleteEq.mockReset().mockResolvedValue({ error: null })
  mocks.removeVerified.mockReset().mockResolvedValue(undefined)
})

describe('upload de foto postural', () => {
  it('desabilita cache e usa rollback verificado antes de apagar a linha', async () => {
    const uploadError = new Error('thumb falhou')
    mocks.upload
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: uploadError })

    await expect(addPhoto(input)).rejects.toBe(uploadError)
    expect(mocks.upload).toHaveBeenCalledWith(
      photo.storage_path,
      input.image.main,
      expect.objectContaining({ cacheControl: '0' })
    )
    expect(mocks.removeVerified).toHaveBeenCalledWith([photo.storage_path, photo.thumb_path])
    expect(mocks.deleteEq).toHaveBeenCalledWith('id', photo.id)
  })

  it('preserva a linha quando nao consegue provar que os arquivos sumiram', async () => {
    mocks.upload.mockResolvedValueOnce({ error: new Error('upload falhou') })
    mocks.removeVerified.mockRejectedValueOnce(new Error('objeto restante'))

    await expect(addPhoto(input)).rejects.toBeInstanceOf(AggregateError)
    expect(mocks.deleteEq).not.toHaveBeenCalled()
  })
})
