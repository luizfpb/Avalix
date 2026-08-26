// O servidor guarda apenas o hash do capability token do treino. A cópia local
// da URL — usada para reexibir Copiar/WhatsApp — fica isolada por usuário + org
// e some no logout, na troca de conta, na revogação ou no TTL.
//
// Mesmo desenho do linkStore da anamnese, com chave própria. Não foi
// generalizado num módulo só de propósito: são dois segredos com ciclos de vida
// diferentes (o da anamnese é de uso único e curto; este vale meses), e
// compartilhar o armazenamento faria a limpeza de um mexer no outro.

const PREFIX = 'avalix:workoutlink:'
const V1_PREFIX = `${PREFIX}v1:`

type Entry = { url: string; expiresAt: string }
let scope: { userId: string; orgId: string } | null = null

function storageOrNull(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

function scopedKey(subjectId: string): string | null {
  if (!scope) return null
  return `${V1_PREFIX}${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.orgId)}:${encodeURIComponent(subjectId)}`
}

// Só aceita URL da própria origem e no formato com fragmento: uma entrada
// adulterada no localStorage não pode virar link para outro domínio no botão
// de compartilhar.
function normalizeStoredUrl(raw: string): string | null {
  try {
    const base = typeof location !== 'undefined' ? location.origin : 'https://local.invalid'
    const url = new URL(raw, base)
    if (typeof location !== 'undefined' && url.origin !== location.origin) return null
    if (url.pathname !== '/t') return null
    const token = url.hash.slice(1)
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
    return `${url.origin}/t#${token}`
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

export function setWorkoutLinkScope(userId: string | null, orgId: string | null): void {
  scope = userId && orgId ? { userId, orgId } : null
}

export function saveWorkoutLinkLocal(subjectId: string, url: string, expiresAt: string): void {
  const storage = storageOrNull()
  const key = scopedKey(subjectId)
  const normalizedUrl = normalizeStoredUrl(url)
  const expiration = new Date(expiresAt).getTime()
  if (!storage || !key || !normalizedUrl || !Number.isFinite(expiration) || expiration <= Date.now()) {
    return
  }
  try {
    storage.setItem(key, JSON.stringify({ url: normalizedUrl, expiresAt } satisfies Entry))
  } catch {
    // o link ainda aparece no card logo após a emissão
  }
}

export function loadWorkoutLinkLocal(subjectId: string, now = Date.now()): string | null {
  const storage = storageOrNull()
  const key = scopedKey(subjectId)
  if (!storage || !key) return null
  try {
    const entry = parseEntry(storage.getItem(key), now)
    if (!entry) {
      storage.removeItem(key)
      return null
    }
    return entry.url
  } catch {
    return null
  }
}

export function clearWorkoutLinkLocal(subjectId: string): void {
  const storage = storageOrNull()
  const key = scopedKey(subjectId)
  if (!storage || !key) return
  try {
    storage.removeItem(key)
  } catch {
    // best-effort
  }
}

export function clearAllWorkoutLinksLocal(): void {
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
