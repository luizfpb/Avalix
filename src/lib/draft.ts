import { useEffect, useRef, useState } from 'react'

// Rascunhos profissionais ficam no localStorage para sobreviver a reload, mas
// sempre dentro do escopo usuario + organizacao. A pagina publica usa
// sessionStorage: o dado some ao fechar a aba e nunca cruza para outro link.
const PREFIX = 'avalix:draft:'
const PRIVATE_PREFIX = `${PREFIX}private:`
const SESSION_PREFIX = `${PREFIX}session:`
const PRIVATE_TTL_MS = 24 * 60 * 60 * 1000
const SESSION_TTL_MS = 2 * 60 * 60 * 1000
const SAVE_DEBOUNCE_MS = 600

type Envelope = { savedAt: number; data: unknown }
export type DraftStorageKind = 'private' | 'session'
export type DraftOptions = { storage?: DraftStorageKind }

let privateScope: { userId: string; orgId: string } | null = null
let privateScopeRevision = 0
const clearedRevisions = new Map<string, number>()
const expiredRevisions = new Map<string, number>()

function invalidateDraft(fullKey: string, expired = false): void {
  const revisions = expired ? expiredRevisions : clearedRevisions
  revisions.set(fullKey, (revisions.get(fullKey) ?? 0) + 1)
}

function storageOrNull(kind: DraftStorageKind): Storage | null {
  try {
    if (kind === 'session') {
      return typeof sessionStorage !== 'undefined' ? sessionStorage : null
    }
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

function safeSegment(value: string): string {
  return encodeURIComponent(value)
}

function scopedKey(key: string, kind: DraftStorageKind): string | null {
  if (kind === 'session') return `${SESSION_PREFIX}${safeSegment(key)}`
  if (!privateScope) return null
  return `${PRIVATE_PREFIX}${safeSegment(privateScope.userId)}:${safeSegment(privateScope.orgId)}:${safeSegment(key)}`
}

function ttlFor(kind: DraftStorageKind): number {
  return kind === 'session' ? SESSION_TTL_MS : PRIVATE_TTL_MS
}

// Chamado antes de montar as telas profissionais. Sem ambos os identificadores
// o modulo se recusa a ler/gravar para evitar um rascunho sem dono.
export function setPrivateDraftScope(userId: string | null, orgId: string | null): void {
  const next = userId && orgId ? { userId, orgId } : null
  if (next?.userId !== privateScope?.userId || next?.orgId !== privateScope?.orgId) {
    privateScopeRevision++
  }
  privateScope = next
}

export function saveDraft(
  key: string,
  data: unknown,
  now = Date.now(),
  options: DraftOptions = {}
): void {
  const kind = options.storage ?? 'private'
  const storage = storageOrNull(kind)
  const fullKey = scopedKey(key, kind)
  if (!storage || !fullKey) return
  try {
    storage.setItem(fullKey, JSON.stringify({ savedAt: now, data } satisfies Envelope))
  } catch {
    // rascunho e conveniencia; quota/indisponibilidade nao quebra o formulario
  }
}

export function loadDraft<T>(
  key: string,
  now = Date.now(),
  options: DraftOptions = {}
): T | null {
  const kind = options.storage ?? 'private'
  const storage = storageOrNull(kind)
  const fullKey = scopedKey(key, kind)
  if (!storage || !fullKey) return null
  try {
    const raw = storage.getItem(fullKey)
    if (!raw) return null
    const env = JSON.parse(raw) as Envelope
    if (
      typeof env?.savedAt !== 'number' ||
      env.savedAt > now + 60_000 ||
      now - env.savedAt > ttlFor(kind)
    ) {
      invalidateDraft(fullKey, typeof env.savedAt === 'number' && now - env.savedAt > ttlFor(kind))
      storage.removeItem(fullKey)
      return null
    }
    return (env.data as T) ?? null
  } catch {
    invalidateDraft(fullKey)
    storage.removeItem(fullKey)
    return null
  }
}

export function clearDraft(key: string, options: DraftOptions = {}): void {
  const kind = options.storage ?? 'private'
  const storage = storageOrNull(kind)
  const fullKey = scopedKey(key, kind)
  if (!fullKey) return
  // Cancelar também o debounce/cleanup já agendado no editor. Apagar só o
  // localStorage permitiria que a desmontagem recriasse um registro concluído.
  invalidateDraft(fullKey)
  if (!storage) return
  try {
    storage.removeItem(fullKey)
  } catch {
    // best-effort
  }
}

function keysWithPrefix(storage: Storage, prefix: string): string[] {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key?.startsWith(prefix)) keys.push(key)
  }
  return keys
}

// Logout/troca de identidade deve remover inclusive chaves legadas sem escopo.
export function clearAllPrivateDrafts(): void {
  const storage = storageOrNull('private')
  privateScope = null
  privateScopeRevision++
  if (!storage) return
  try {
    for (const key of keysWithPrefix(storage, PREFIX)) storage.removeItem(key)
  } catch {
    // best-effort
  }
}

function purgeStorage(kind: DraftStorageKind, now: number): void {
  const storage = storageOrNull(kind)
  if (!storage) return
  const expectedPrefix = kind === 'private' ? PRIVATE_PREFIX : SESSION_PREFIX
  try {
    const stale: { key: string; expired: boolean }[] = []
    for (const key of keysWithPrefix(storage, PREFIX)) {
      // Remove automaticamente o formato antigo, que nao tinha dono, e nunca
      // deixa um tipo de draft aparecer no storage errado.
      if (!key.startsWith(expectedPrefix)) {
        stale.push({ key, expired: false })
        continue
      }
      try {
        const env = JSON.parse(storage.getItem(key) ?? '') as Envelope
        if (
          typeof env?.savedAt !== 'number' ||
          env.savedAt > now + 60_000 ||
          now - env.savedAt > ttlFor(kind)
        ) {
          stale.push({ key, expired: typeof env?.savedAt === 'number' && now - env.savedAt > ttlFor(kind) })
        }
      } catch {
        stale.push({ key, expired: false })
      }
    }
    for (const { key, expired } of stale) {
      invalidateDraft(key, expired)
      storage.removeItem(key)
    }
  } catch {
    // best-effort
  }
}

export function purgeExpiredDrafts(now = Date.now()): void {
  purgeStorage('private', now)
  purgeStorage('session', now)
}

// Bootstrap + timer: TTL passa a ser limpeza fisica, nao apenas logica na
// proxima abertura de um formulario.
export function startDraftHousekeeping(intervalMs = 15 * 60 * 1000): () => void {
  purgeExpiredDrafts()
  if (typeof window === 'undefined') return () => undefined
  const timer = window.setInterval(() => purgeExpiredDrafts(), intervalMs)
  return () => window.clearInterval(timer)
}

export function useFormDraft<T>(
  key: string | null,
  value: T,
  restore: (draft: T) => void,
  options: DraftOptions = {}
): { restored: boolean; dismiss: () => void } {
  const [restored, setRestored] = useState(false)
  const restoreRef = useRef(restore)
  const valueRef = useRef(value)
  const writerRef = useRef<{ replace: (value: T) => void; skipInitial: boolean } | null>(null)
  const storageKind = options.storage ?? 'private'
  restoreRef.current = restore
  valueRef.current = value

  useEffect(() => {
    setRestored(false)
    if (!key) return
    purgeExpiredDrafts()
    const draft = loadDraft<T>(key, Date.now(), { storage: storageKind })
    const fullKey = scopedKey(key, storageKind)
    if (!fullKey) return
    const scopeRevision = privateScopeRevision
    const clearedRevision = clearedRevisions.get(fullKey) ?? 0
    let expirationRevision = expiredRevisions.get(fullKey) ?? 0
    let pendingValue = draft ?? valueRef.current
    let encodedValue = JSON.stringify(pendingValue)
    let editedAt: number | null = null
    let pending = true
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const flush = () => {
      clearTimeout(timer)
      if (!pending) return
      pending = false
      if (cancelled || scopedKey(key, storageKind) !== fullKey) return
      if (storageKind === 'private' && scopeRevision !== privateScopeRevision) return
      if ((clearedRevisions.get(fullKey) ?? 0) !== clearedRevision) return
      if ((expiredRevisions.get(fullKey) ?? 0) !== expirationRevision) {
        // TTL cancela conteúdo antigo, mas não desativa um formulário para
        // sempre. Só uma alteração recente rearma a persistência; cleanup
        // sem edição não pode trazer de volta o registro expirado.
        if (editedAt === null || Date.now() - editedAt > ttlFor(storageKind)) return
        expirationRevision = expiredRevisions.get(fullKey) ?? 0
      }
      saveDraft(key, pendingValue, Date.now(), { storage: storageKind })
      editedAt = null
    }
    const writer = {
      // O primeiro efeito de valor ainda enxerga o formulário anterior à
      // restauração. Nunca descarregar esses valores por cima do rascunho lido.
      skipInitial: true,
      replace(next: T) {
        const nextEncoded = JSON.stringify(next)
        if (nextEncoded !== encodedValue) editedAt = Date.now()
        encodedValue = nextEncoded
        pendingValue = next
        pending = true
        clearTimeout(timer)
        timer = setTimeout(flush, SAVE_DEBOUNCE_MS)
      },
    }
    writerRef.current = writer
    timer = setTimeout(flush, SAVE_DEBOUNCE_MS)
    if (draft != null) {
      restoreRef.current(draft)
      setRestored(true)
    }

    const onHidden = () => { if (document.visibilityState === 'hidden') flush() }
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== storageOrNull(storageKind)) return
      if (event.key === null || (event.key === fullKey && event.newValue === null)) cancelled = true
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('storage', onStorage)
    return () => {
      // Usa o último valor desta chave, e não o valor de outro registro que
      // possa já ter renderizado. A invalidação acima cobre sucesso e logout.
      flush()
      if (writerRef.current === writer) writerRef.current = null
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('storage', onStorage)
    }
  }, [key, storageKind])

  useEffect(() => {
    const writer = writerRef.current
    if (!writer) return
    if (writer.skipInitial) writer.skipInitial = false
    else writer.replace(value)
  }, [key, value, storageKind])

  return { restored, dismiss: () => setRestored(false) }
}
