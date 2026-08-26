// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { enqueueSession, StudentStorageError } from './studentStore'

describe('fila offline autoritativa', () => {
  it('falha explicitamente quando o IndexedDB não está disponível', async () => {
    vi.stubGlobal('indexedDB', undefined)

    await expect(
      enqueueSession('escopo', {
        clientRef: 'ref-1',
        revision: 1,
        planId: 'plan-1',
        dayLabel: 'A',
        weekNumber: 1,
        performedAt: '2026-08-26',
        notes: null,
        sets: [],
        queuedAt: '2026-08-26T12:00:00.000Z',
      })
    ).rejects.toBeInstanceOf(StudentStorageError)
  })
})
