// O servidor guarda apenas o hash do capability token. A copia local usada
// para compartilhar novamente o convite fica isolada por usuario + org e e
// removida em logout, troca de conta, cancelamento, aceite, rejeicao ou TTL.

const PREFIX = 'avalix:intakelink:'
const V2_PREFIX = `${PREFIX}v2:`

type Entry = { url: string; expiresAt: string }
let scope: { userId: string; orgId: string } | null = null

function storageOrNull(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

function safe(value: string): string {
  return encodeURIComponent(value)
}

function scopedKey(intakeId: string): string | null {
  if (!scope) return null
  return `${V2_PREFIX}${safe(scope.userId)}:${safe(scope.orgId)}:${safe(intakeId)}`
}

function normalizeStoredUrl(raw: string): string | null {
  try {
    const base = typeof location !== 'undefined' ? location.origin : 'https://local.invalid'
    const url = new URL(raw, base)
    if (typeof location !== 'undefined' && url.origin !== location.origin) return null

    const legacy = url.pathname.match(/^\/a\/([A-Za-z0-9_-]{43})$/)?.[1]
    const fragment = url.pathname === '/a' ? url.hash.slice(1) : ''
    const token = legacy ?? fragment
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
    return `${url.origin}/a#${token}`
  } catch {
    return null
  }
}

function parseEntry(raw: string | null, now: number): Entry | null {
  if (!raw) return null
  try {
    const entry = JSON.parse(raw) as Entry
    const expiresAt = new Date(entry.expiresAt).getTime()
    const url = normalizeStoredUrl(entry.url)
    if (!url || !Number.isFinite(expiresAt) || expiresAt <= now) return null
    return { url, expiresAt: entry.expiresAt }
  } catch {
    return null
  }
}

function discardUnscopedLegacyEntries(): void {
  const storage = storageOrNull()
  if (!storage || !scope) return
  try {
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(PREFIX) && !key.startsWith(V2_PREFIX)) keys.push(key)
    }
    for (const oldKey of keys) {
      // A versao antiga nao registrava usuario/org. Atribuir o capability
      // token ao login atual poderia expo-lo para outra conta no mesmo aparelho.
      storage.removeItem(oldKey)
    }
  } catch {
    // best-effort
  }
}

export function setIntakeLinkScope(userId: string | null, orgId: string | null): void {
  scope = userId && orgId ? { userId, orgId } : null
  if (scope) discardUnscopedLegacyEntries()
}

export function saveIntakeLinkLocal(intakeId: string, url: string, expiresAt: string): void {
  const storage = storageOrNull()
  const key = scopedKey(intakeId)
  const normalizedUrl = normalizeStoredUrl(url)
  const expiration = new Date(expiresAt).getTime()
  if (!storage || !key || !normalizedUrl || !Number.isFinite(expiration) || expiration <= Date.now()) {
    return
  }
  try {
    storage.setItem(key, JSON.stringify({ url: normalizedUrl, expiresAt } satisfies Entry))
  } catch {
    // o link ainda aparece no card da geracao
  }
}

export function loadIntakeLinkLocal(intakeId: string, now = Date.now()): string | null {
  const storage = storageOrNull()
  const key = scopedKey(intakeId)
  if (!storage || !key) return null
  try {
    const entry = parseEntry(storage.getItem(key), now)
    if (!entry) {
      storage.removeItem(key)
      return null
    }
    // Regrava links antigos no formato com fragmento.
    storage.setItem(key, JSON.stringify(entry))
    return entry.url
  } catch {
    return null
  }
}

export function clearIntakeLinkLocal(intakeId: string): void {
  const storage = storageOrNull()
  const key = scopedKey(intakeId)
  if (!storage || !key) return
  try {
    storage.removeItem(key)
  } catch {
    // best-effort
  }
}

export function clearAllIntakeLinksLocal(): void {
  const storage = storageOrNull()
  scope = null
  if (!storage) return
  try {
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }
    for (const key of keys) storage.removeItem(key)
  } catch {
    // best-effort
  }
}

export function purgeExpiredIntakeLinks(now = Date.now()): void {
  const storage = storageOrNull()
  if (!storage) return
  try {
    const stale: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key?.startsWith(PREFIX)) continue
      // Capability legado nao tem dono verificavel: sempre descartar.
      if (!key.startsWith(V2_PREFIX)) {
        stale.push(key)
        continue
      }
      if (!parseEntry(storage.getItem(key), now)) stale.push(key)
    }
    for (const key of stale) storage.removeItem(key)
  } catch {
    // best-effort
  }
}
