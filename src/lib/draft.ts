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
  privateScope = userId && orgId ? { userId, orgId } : null
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
      storage.removeItem(fullKey)
      return null
    }
    return (env.data as T) ?? null
  } catch {
    storage.removeItem(fullKey)
    return null
  }
}

export function clearDraft(key: string, options: DraftOptions = {}): void {
  const kind = options.storage ?? 'private'
  const storage = storageOrNull(kind)
  const fullKey = scopedKey(key, kind)
  if (!storage || !fullKey) return
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
    const stale: string[] = []
    for (const key of keysWithPrefix(storage, PREFIX)) {
      // Remove automaticamente o formato antigo, que nao tinha dono, e nunca
      // deixa um tipo de draft aparecer no storage errado.
      if (!key.startsWith(expectedPrefix)) {
        stale.push(key)
        continue
      }
      try {
        const env = JSON.parse(storage.getItem(key) ?? '') as Envelope
        if (
          typeof env?.savedAt !== 'number' ||
          env.savedAt > now + 60_000 ||
          now - env.savedAt > ttlFor(kind)
        ) {
          stale.push(key)
        }
      } catch {
        stale.push(key)
      }
    }
    for (const key of stale) storage.removeItem(key)
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
  const ready = useRef(false)
  const restoreRef = useRef(restore)
  const storageKind = options.storage ?? 'private'
  restoreRef.current = restore

  useEffect(() => {
    ready.current = false
    setRestored(false)
    if (!key) {
      ready.current = true
      return
    }
    purgeExpiredDrafts()
    const draft = loadDraft<T>(key, Date.now(), { storage: storageKind })
    if (draft != null) {
      restoreRef.current(draft)
      setRestored(true)
    }
    ready.current = true
  }, [key, storageKind])

  useEffect(() => {
    if (!key || !ready.current) return
    const timer = setTimeout(
      () => saveDraft(key, value, Date.now(), { storage: storageKind }),
      SAVE_DEBOUNCE_MS
    )
    return () => clearTimeout(timer)
  }, [key, value, storageKind])

  return { restored, dismiss: () => setRestored(false) }
}
