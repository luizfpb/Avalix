import type { StudentHistorySession, StudentPlanDetail, StudentWorkout, SubmitSet } from './studentApi'

// Armazenamento local da página do aluno: o que permite treinar sem internet.
//
// Duas decisões que sustentam isto, e nenhuma delas é exceção de segurança:
//
// 1. O SERVICE WORKER CONTINUA SEM CACHEAR O SUPABASE. A regra do projeto fica
//    intacta; quem decide persistir é este módulo, e só persiste o pacote de
//    divulgação mínima que a RPC devolve — treino e cargas do próprio aluno,
//    nunca dado clínico, identidade completa ou dado de terceiro.
// 2. A FILA DE SAÍDA SÓ É SEGURA PORQUE O ENVIO É IDEMPOTENTE. Cada sessão
//    carrega um client_ref próprio; reenviar a mesma sessão atualiza em vez de
//    duplicar (0027). Sem isso, "offline" seria sinônimo de adesão inflada.
//
// IndexedDB, e não localStorage: o histórico pode passar de alguns MB, e o
// acesso é assíncrono, o que evita travar a interface no meio do treino.

const DB_NAME = 'avalix-treino'
const DB_VERSION = 1
const STORE = 'kv'

// A chave de tudo é o hash do token, nunca o token cru: o índice do banco local
// não pode ser, ele mesmo, uma cópia da credencial.
type Key = string

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      // navegação privada, cota esgotada, storage bloqueado: a página tem de
      // continuar funcionando online, só sem offline
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

async function idbGet<T>(key: Key): Promise<T | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => resolve((req.result as T) ?? null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function idbSet(key: Key, value: unknown): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

async function idbDelete(key: Key): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

async function idbClearAll(): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

// ---------------------------------------------------------------- token local

// O token fica no aparelho para a página abrir sem o fragmento — que é o que
// permite instalar (`start_url` de manifest não carrega `#`) e reabrir offline.
// Divergência deliberada da anamnese, que usa sessionStorage por ser formulário
// de uso único. Aqui o aluno volta três vezes por semana.
const TOKEN_KEY = 'avalix:treino:token'

export function loadStudentToken(): string | null {
  try {
    const value = localStorage.getItem(TOKEN_KEY)
    return /^[A-Za-z0-9_-]{43}$/.test(value ?? '') ? value : null
  } catch {
    return null
  }
}

export function saveStudentToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // sem persistência: a página funciona nesta carga, e o aluno reabre pelo link
  }
}

// "Sair deste aparelho": apaga token, cache e fila. É o contrapeso de guardar
// uma credencial de vida longa num aparelho que pode ser emprestado ou perdido.
export async function forgetStudentDevice(): Promise<void> {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // segue para limpar o resto
  }
  await idbClearAll()
}

// Pede ao navegador para não despejar o armazenamento. No iOS o Safari apaga
// dado de site sem uso por sete dias, o que atingiria a fila de saída de quem
// sumiu por uma semana; instalado, o armazenamento persiste.
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.()
  } catch {
    // best-effort: é uma otimização, não um requisito
  }
}

// ---------------------------------------------------------------- cache

export type CachedWorkout = { at: string; data: StudentWorkout }

export async function readCachedWorkout(scope: string): Promise<CachedWorkout | null> {
  return idbGet<CachedWorkout>(`workout:${scope}`)
}

export async function writeCachedWorkout(scope: string, data: StudentWorkout): Promise<void> {
  await idbSet(`workout:${scope}`, { at: new Date().toISOString(), data } satisfies CachedWorkout)
}

export async function readCachedHistory(scope: string): Promise<StudentHistorySession[] | null> {
  return idbGet<StudentHistorySession[]>(`history:${scope}`)
}

export async function writeCachedHistory(
  scope: string,
  sessions: StudentHistorySession[]
): Promise<void> {
  await idbSet(`history:${scope}`, sessions)
}

export async function readCachedPlan(
  scope: string,
  planId: string
): Promise<StudentPlanDetail | null> {
  return idbGet<StudentPlanDetail>(`plan:${scope}:${planId}`)
}

export async function writeCachedPlan(
  scope: string,
  planId: string,
  detail: StudentPlanDetail
): Promise<void> {
  await idbSet(`plan:${scope}:${planId}`, detail)
}

// ---------------------------------------------------------------- fila

export type QueuedSession = {
  clientRef: string
  planId: string | null
  dayLabel: string | null
  weekNumber: number | null
  performedAt: string
  notes: string | null
  sets: SubmitSet[]
  queuedAt: string
  // motivo da última recusa definitiva, quando houver
  error?: string
}

export async function readQueue(scope: string): Promise<QueuedSession[]> {
  return (await idbGet<QueuedSession[]>(`queue:${scope}`)) ?? []
}

async function writeQueue(scope: string, queue: QueuedSession[]): Promise<void> {
  await idbSet(`queue:${scope}`, queue)
}

// Enfileirar a MESMA sessão de novo substitui a anterior: o aluno que salva
// três vezes durante o treino tem uma pendência, não três.
export async function enqueueSession(scope: string, session: QueuedSession): Promise<void> {
  const queue = await readQueue(scope)
  const next = queue.filter((q) => q.clientRef !== session.clientRef)
  next.push(session)
  await writeQueue(scope, next)
}

export async function dequeueSession(scope: string, clientRef: string): Promise<void> {
  const queue = await readQueue(scope)
  await writeQueue(
    scope,
    queue.filter((q) => q.clientRef !== clientRef)
  )
}

export async function clearQueue(scope: string): Promise<void> {
  await idbDelete(`queue:${scope}`)
}

// ---------------------------------------------------------------- rascunho

// A sessão em andamento, antes de ser salva. Sobrevive a fechar a aba no meio
// do treino, que numa academia acontece o tempo todo.
export type DraftSession = {
  clientRef: string
  planId: string | null
  dayId: string | null
  weekNumber: number | null
  performedAt: string
  notes: string
  rows: Record<string, { weight: string; reps: string; rir: string }[]>
}

export async function readDraft(scope: string): Promise<DraftSession | null> {
  return idbGet<DraftSession>(`draft:${scope}`)
}

export async function writeDraft(scope: string, draft: DraftSession): Promise<void> {
  await idbSet(`draft:${scope}`, draft)
}

export async function clearDraftSession(scope: string): Promise<void> {
  await idbDelete(`draft:${scope}`)
}
