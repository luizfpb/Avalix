import { useEffect, useRef, useState } from 'react'

// Rascunho local de formulários longos (P4 da auditoria v2.0). O app é de
// coleta: uma avaliação inteira digitada com sinal ruim não pode morrer num
// refresh. Persistimos o estado do formulário em localStorage (debounce),
// restauramos ao montar e limpamos no save. Decisões:
//   - TTL de 24h: dado de saúde não fica esquecido no aparelho;
//   - só no modo CRIAR (editar tem o servidor como fonte de verdade);
//   - a página pública limpa o rascunho no envio (aparelho do aluno).

const PREFIX = 'avalix:draft:'
const TTL_MS = 24 * 60 * 60 * 1000
const SAVE_DEBOUNCE_MS = 600

type Envelope = { savedAt: number; data: unknown }

function storageOrNull(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function saveDraft(key: string, data: unknown, now = Date.now()): void {
  const ls = storageOrNull()
  if (!ls) return
  try {
    ls.setItem(PREFIX + key, JSON.stringify({ savedAt: now, data } satisfies Envelope))
  } catch {
    // storage cheio/indisponível: rascunho é conveniência, nunca erro
  }
}

export function loadDraft<T>(key: string, now = Date.now()): T | null {
  const ls = storageOrNull()
  if (!ls) return null
  try {
    const raw = ls.getItem(PREFIX + key)
    if (!raw) return null
    const env = JSON.parse(raw) as Envelope
    if (typeof env?.savedAt !== 'number' || now - env.savedAt > TTL_MS) {
      ls.removeItem(PREFIX + key)
      return null
    }
    return (env.data as T) ?? null
  } catch {
    return null
  }
}

export function clearDraft(key: string): void {
  const ls = storageOrNull()
  if (!ls) return
  try {
    ls.removeItem(PREFIX + key)
  } catch {
    // idem: nunca quebra o app
  }
}

// remove rascunhos vencidos (chamado ao montar qualquer formulário com draft)
export function purgeExpiredDrafts(now = Date.now()): void {
  const ls = storageOrNull()
  if (!ls) return
  try {
    const stale: string[] = []
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i)
      if (!k || !k.startsWith(PREFIX)) continue
      try {
        const env = JSON.parse(ls.getItem(k) ?? '') as Envelope
        if (typeof env?.savedAt !== 'number' || now - env.savedAt > TTL_MS) stale.push(k)
      } catch {
        stale.push(k)
      }
    }
    for (const k of stale) ls.removeItem(k)
  } catch {
    // best-effort
  }
}

// Hook: persiste `value` (debounce) e restaura uma vez ao montar.
// key null = desativado (ex.: modo edição). `restore` é chamado no mount se
// houver rascunho válido; o retorno diz se restaurou (pra exibir o aviso).
export function useFormDraft<T>(
  key: string | null,
  value: T,
  restore: (draft: T) => void
): { restored: boolean; dismiss: () => void } {
  const [restored, setRestored] = useState(false)
  const ready = useRef(false)
  const restoreRef = useRef(restore)
  restoreRef.current = restore

  useEffect(() => {
    if (!key) {
      ready.current = true
      return
    }
    purgeExpiredDrafts()
    const d = loadDraft<T>(key)
    if (d != null) {
      restoreRef.current(d)
      setRestored(true)
    }
    ready.current = true
  }, [key])

  useEffect(() => {
    if (!key || !ready.current) return
    const t = setTimeout(() => saveDraft(key, value), SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [key, value])

  return { restored, dismiss: () => setRestored(false) }
}
