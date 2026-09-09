// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { DraftSession, QueuedSession } from './studentStore'
import type { PlanoVigente } from './studentDraft'

let store: typeof import('./studentStore')
const draft = (over: Partial<DraftSession> = {}): DraftSession => ({
  clientRef: 'ref-A', revision: 0, planId: 'p', dayId: 'old-A', weekNumber: 1,
  performedAt: '2026-09-08', notes: '', rows: { 'old-ex': [{ weight: '40', reps: '10', rir: '' }] },
  identity: { dayLabel: 'A', rowExercises: { 'old-ex': 'catalog' } }, ...over,
})
const plan = (prefix: string): PlanoVigente => ({
  days: ['A', 'B'].map((label, position) => ({ id: `${prefix}-${label}`, label, name: null, position })),
  exercises: [{ id: `${prefix}-ex`, day_id: `${prefix}-A`, exercise_id: 'catalog', name: 'Supino',
    position: 0, sets: 3, reps: '8-12', rir: 2, rest_seconds: 90, tempo: null, notes: null }],
})
const queued = (revision = 1): QueuedSession => ({ clientRef: 'ref-A', revision, planId: 'p',
  dayLabel: 'A', weekNumber: 1, performedAt: '2026-09-08', notes: null, sets: [], queuedAt: '2026-09-08T12:00:00Z' })

async function raw(key: string, value?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('avalix-treino', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('kv')
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('kv', value === undefined ? 'readonly' : 'readwrite')
      const op = value === undefined ? tx.objectStore('kv').get(key) : tx.objectStore('kv').put(value, key)
      tx.oncomplete = () => { db.close(); resolve(op.result) }
      tx.onabort = () => { db.close(); reject(tx.error) }
    }
    request.onerror = () => reject(request.error)
  })
}

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  store = await import('./studentStore')
})
afterEach(() => vi.unstubAllGlobals())

describe('rascunhos e acesso com transações IndexedDB reais', () => {
  it('recusa duas abas que gravam a mesma revisão-base sem promover conteúdo antigo', async () => {
    await store.writeDraft('scope', draft(), true)
    const first = (await store.readDraft('scope', 'p'))!
    vi.resetModules()
    const otherTab = await import('./studentStore')
    const second = (await otherTab.readDraft('scope', 'p'))!
    expect(await store.writeDraft('scope', { ...first, notes: 'Atualizado na primeira aba' }, true)).toBe(2)
    await expect(otherTab.reserveDraftRevision('scope', { ...second, notes: 'Antigo na segunda' }, true))
      .rejects.toBeInstanceOf(otherTab.StudentDraftConflictError)
    expect(await store.readDraft('scope', 'p')).toMatchObject({ revision: 2, notes: 'Atualizado na primeira aba' })
  })

  it('migra o rascunho v1 sem perder a revisão, removendo a chave antiga atomicamente', async () => {
    await raw('draft:scope', draft({ revision: 4 }))
    const result = await store.readReconciledDraft('scope', 'p', plan('new'))
    expect(result?.draft).toMatchObject({ dayId: 'new-A', revision: 5, rows: { 'new-ex': [{ weight: '40' }] } })
    expect(await raw('draft:scope')).toBeUndefined()
    expect(await raw('draft:scope:p')).toMatchObject({ version: 3, active: 'ref-A' })
  })

  it('migra todas as sessões v2, elimina cópias antigas e preserva identidade após duas regravações', async () => {
    const a = { ...draft({ revision: 2 }), updatedAt: '2026-09-08T12:00:00Z' }
    const b = { ...draft({ clientRef: 'ref-B', dayId: 'old-B', performedAt: '2026-09-07',
      identity: { dayLabel: 'B', rowExercises: { 'old-ex': 'catalog' } } }), updatedAt: a.updatedAt }
    await raw('draft:scope:p', { version: 2, active: 'old-A:2026-09-08', sessions: [a, b, { ...a, revision: 1 }] })
    const current = await store.readReconciledDraft('scope', 'p', plan('new'))
    expect(current?.draft.revision).toBe(3)
    const second = await store.readReconciledDraft('scope', 'p', plan('newer'), undefined, 'newer-B', '2026-09-07')
    expect(second?.draft).toMatchObject({ clientRef: 'ref-B', dayId: 'newer-B', rows: { 'newer-ex': [{ weight: '40' }] } })
    const bucket = await raw('draft:scope:p') as { sessions: DraftSession[] }
    expect(bucket.sessions).toHaveLength(2)
    expect(bucket.sessions.every((session) => !Object.keys(session.rows).includes('old-ex'))).toBe(true)
    await expect(store.writeDraft('scope', a, true)).rejects.toBeInstanceOf(store.StudentDraftConflictError)
  })

  it('concluir remove todas as cópias por clientRef e impede ressurreição em gravação atrasada', async () => {
    await store.writeDraft('scope', draft(), true)
    const read = (await store.readDraft('scope', 'p'))!
    await store.clearDraftSession('scope', 'p', read.dayId, read.performedAt, undefined, read.clientRef, read.revision)
    await expect(store.writeDraft('scope', read, true)).rejects.toBeInstanceOf(store.StudentDraftConflictError)
    expect(await store.readDraft('scope', 'p')).toBeNull()
    expect(await store.writeDraft('scope', draft({ clientRef: 'new-session' }), true)).toBe(1)
  })

  it('conclusão obsoleta não apaga progresso mais recente nem rascunho de outra data', async () => {
    await store.writeDraft('scope', draft(), true)
    const stale = (await store.readDraft('scope', 'p'))!
    await store.writeDraft('scope', { ...stale, notes: 'Série nova' }, true)
    await store.writeDraft('scope', draft({ clientRef: 'other-date', performedAt: '2026-09-07' }), true)
    await expect(store.clearDraftSession('scope', 'p', stale.dayId, stale.performedAt, undefined, stale.clientRef, stale.revision))
      .rejects.toBeInstanceOf(store.StudentDraftConflictError)
    expect(await store.readDraft('scope', 'p', 'old-A', '2026-09-08')).toMatchObject({ notes: 'Série nova' })
    expect(await store.readDraft('scope', 'p', 'old-A', '2026-09-07')).toMatchObject({ clientRef: 'other-date' })
  })

  it('não elimina rascunhos antigos apenas por ultrapassar 14 sessões', async () => {
    for (let i = 0; i < 20; i++) await store.writeDraft('scope', draft({ clientRef: `ref-${i}`, performedAt: `2026-08-${String(i + 1).padStart(2, '0')}` }), true)
    expect(await store.readDraft('scope', 'p', 'old-A', '2026-08-01')).toMatchObject({ clientRef: 'ref-0' })
  })

  it('a resposta de outra aba capturada antes da purga não repovoa cache, rascunho ou fila', async () => {
    const oldAccess = await store.captureStudentStorageAccess()
    await store.writeDraft('scope', draft(), true, oldAccess)
    vi.resetModules()
    const otherTab = await import('./studentStore')
    await otherTab.purgeRevokedStudentDevice()
    await expect(store.writeCachedHistory('scope', [], null, oldAccess)).rejects.toBeInstanceOf(store.StudentAccessEndedError)
    await expect(store.enqueueSession('scope', queued(), oldAccess)).rejects.toBeInstanceOf(store.StudentAccessEndedError)
    await expect(store.writeDraft('scope', draft(), true, oldAccess)).rejects.toBeInstanceOf(store.StudentAccessEndedError)
    expect(await store.readCachedHistory('scope')).toBeNull()
    expect(await store.readQueue('scope')).toEqual([])
    const newAccess = await store.captureStudentStorageAccess()
    await expect(store.writeDraft('scope', draft(), true, newAccess)).resolves.toBe(1)
  })

  it('invalida uma escrita já iniciada antes que a transação persista seu resultado', async () => {
    const access = await store.captureStudentStorageAccess()
    const pending = store.writeDraft('scope', draft(), true, access)
    store.invalidateStudentStorageAccess(access)
    await expect(pending).rejects.toBeInstanceOf(store.StudentAccessEndedError)
    expect(await store.readDraft('scope', 'p')).toBeNull()
  })

  it('reenvio antigo não remove nem marca uma versão nova da fila', async () => {
    await store.enqueueSession('scope', queued(1))
    await store.enqueueSession('scope', queued(2))
    await store.dequeueSession('scope', 'ref-A', true, undefined, 1)
    await store.markSessionRejected('scope', 'ref-A', 'Falha antiga', undefined, 1)
    expect(await store.readQueue('scope')).toEqual([queued(2)])
    await expect(store.enqueueSession('scope', queued(1))).rejects.toBeInstanceOf(store.StudentDraftConflictError)
  })

  it('remove e rejeita filas legadas sem revision usando a revisão inicial 1', async () => {
    const legacy: Partial<QueuedSession> = queued()
    delete legacy.revision
    await raw('queue:scope', [legacy])
    await store.markSessionRejected('scope', 'ref-A', 'Recusa definitiva', undefined, 1)
    expect((await store.readQueue('scope'))[0].error).toBe('Recusa definitiva')
    await store.dequeueSession('scope', 'ref-A', true, undefined, 1)
    expect(await store.readQueue('scope')).toEqual([])
  })

  it('falha de transação não promove revisão nem confirma remoção do rascunho', async () => {
    await store.writeDraft('scope', draft(), true)
    const saved = (await store.readDraft('scope', 'p'))!
    const prototype = (await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('avalix-treino', 1)
      request.onsuccess = () => resolve(request.result)
    })).constructor.prototype
    const transaction = vi.spyOn(prototype, 'transaction').mockImplementation(() => { throw new Error('Storage blocked') })
    await expect(store.readDraft('scope', 'p')).rejects.toBeInstanceOf(store.StudentStorageError)
    await expect(store.readReconciledDraft('scope', 'p', plan('new'))).rejects.toBeInstanceOf(store.StudentStorageError)
    await expect(store.writeDraft('scope', saved)).rejects.toBeInstanceOf(store.StudentStorageError)
    await expect(store.clearDraftSession('scope', 'p', saved.dayId, saved.performedAt, undefined, saved.clientRef, saved.revision))
      .rejects.toBeInstanceOf(store.StudentStorageError)
    transaction.mockRestore()
    expect(await store.readDraft('scope', 'p')).toMatchObject({ revision: 1 })
  })
})
