// Guarda LOCAL (por aparelho) da URL dos links de intake gerados. Motivo (v2.1):
// o banco guarda só o HASH do token (desenho de segurança da 0017 — vazamento
// do banco não revela link usável), então após um reload nem o servidor sabe
// mais a URL; o personal recarregava a página e "perdia" o link. Persistir no
// localStorage DO APARELHO QUE GEROU resolve o reload sem furar o desenho: o
// segredo continua nunca saindo do dispositivo do profissional.
//
// Limpeza: expira junto com o convite (expires_at), some no cancelamento e o
// purge roda a cada leitura de lista.

const PREFIX = 'avalix:intakelink:'

type Entry = { url: string; expiresAt: string }

function storageOrNull(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function saveIntakeLinkLocal(intakeId: string, url: string, expiresAt: string): void {
  const ls = storageOrNull()
  if (!ls) return
  try {
    ls.setItem(PREFIX + intakeId, JSON.stringify({ url, expiresAt } satisfies Entry))
  } catch {
    // storage cheio/indisponível: o link ainda aparece no card da geração
  }
}

export function loadIntakeLinkLocal(intakeId: string, now = Date.now()): string | null {
  const ls = storageOrNull()
  if (!ls) return null
  try {
    const raw = ls.getItem(PREFIX + intakeId)
    if (!raw) return null
    const entry = JSON.parse(raw) as Entry
    const exp = new Date(entry.expiresAt).getTime()
    if (!entry.url || !Number.isFinite(exp) || exp <= now) {
      ls.removeItem(PREFIX + intakeId)
      return null
    }
    return entry.url
  } catch {
    return null
  }
}

export function clearIntakeLinkLocal(intakeId: string): void {
  const ls = storageOrNull()
  if (!ls) return
  try {
    ls.removeItem(PREFIX + intakeId)
  } catch {
    // best-effort
  }
}

export function purgeExpiredIntakeLinks(now = Date.now()): void {
  const ls = storageOrNull()
  if (!ls) return
  try {
    const stale: string[] = []
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i)
      if (!k || !k.startsWith(PREFIX)) continue
      try {
        const entry = JSON.parse(ls.getItem(k) ?? '') as Entry
        const exp = new Date(entry.expiresAt).getTime()
        if (!Number.isFinite(exp) || exp <= now) stale.push(k)
      } catch {
        stale.push(k)
      }
    }
    for (const k of stale) ls.removeItem(k)
  } catch {
    // best-effort
  }
}
