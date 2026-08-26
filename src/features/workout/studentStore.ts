import type {
  StudentHistoryCursor,
  StudentHistorySession,
  StudentPlanDetail,
  StudentWorkout,
  SubmitSet,
} from './studentApi'

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

export class StudentStorageError extends Error {
  constructor() {
    super('Não foi possível salvar no aparelho. Libere o armazenamento do navegador e tente de novo.')
    this.name = 'StudentStorageError'
  }
}

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

async function idbGet<T>(key: Key, required = false): Promise<T | null> {
  const db = await openDb()
  if (!db) {
    if (required) throw new StudentStorageError()
    return null
  }
  return new Promise((resolve, reject) => {
    const fail = () => (required ? reject(new StudentStorageError()) : resolve(null))
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => resolve((req.result as T) ?? null)
      req.onerror = fail
    } catch {
      fail()
    }
  })
}

async function idbSet(key: Key, value: unknown, required = false): Promise<void> {
  const db = await openDb()
  if (!db) {
    if (required) throw new StudentStorageError()
    return
  }
  await new Promise<void>((resolve, reject) => {
    const fail = () => (required ? reject(new StudentStorageError()) : resolve())
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = fail
      tx.onabort = fail
    } catch {
      fail()
    }
  })
}

// Read-modify-write dentro da mesma transação. O IndexedDB serializa
// transações readwrite concorrentes sobre o object store, inclusive entre
// abas; separar get() e put() permitia que uma aba gravasse um snapshot velho.
async function idbUpdate<T>(
  key: Key,
  update: (current: T | null) => T | null,
  required = false
): Promise<void> {
  const db = await openDb()
  if (!db) {
    if (required) throw new StudentStorageError()
    return
  }
  await new Promise<void>((resolve, reject) => {
    const fail = () => (required ? reject(new StudentStorageError()) : resolve())
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const request = store.get(key)
      request.onsuccess = () => {
        try {
          const next = update((request.result as T) ?? null)
          if (next == null) store.delete(key)
          else store.put(next, key)
        } catch {
          tx.abort()
        }
      }
      request.onerror = fail
      tx.oncomplete = () => resolve()
      tx.onerror = fail
      tx.onabort = fail
    } catch {
      fail()
    }
  })
}

async function idbDelete(key: Key, required = false): Promise<void> {
  const db = await openDb()
  if (!db) {
    if (required) throw new StudentStorageError()
    return
  }
  await new Promise<void>((resolve, reject) => {
    const fail = () => (required ? reject(new StudentStorageError()) : resolve())
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = fail
      tx.onabort = fail
    } catch {
      fail()
    }
  })
}

async function idbClearAll(required = false): Promise<void> {
  const db = await openDb()
  if (!db) {
    if (required) throw new StudentStorageError()
    return
  }
  await new Promise<void>((resolve, reject) => {
    const fail = () => (required ? reject(new StudentStorageError()) : resolve())
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = fail
      tx.onabort = fail
    } catch {
      fail()
    }
  })
}

// ---------------------------------------------------------------- token local

// O token fica no aparelho para a página abrir sem o fragmento — que é o que
// permite instalar (`start_url` de manifest não carrega `#`) e reabrir offline.
// Divergência deliberada da anamnese, que usa sessionStorage por ser formulário
// de uso único. Aqui o aluno volta três vezes por semana.
export const STUDENT_TOKEN_KEY = 'avalix:treino:token'

export function loadStudentToken(): string | null {
  try {
    const value = localStorage.getItem(STUDENT_TOKEN_KEY)
    return /^[A-Za-z0-9_-]{43}$/.test(value ?? '') ? value : null
  } catch {
    return null
  }
}

export function saveStudentToken(token: string): void {
  try {
    localStorage.setItem(STUDENT_TOKEN_KEY, token)
  } catch {
    // sem persistência: a página funciona nesta carga, e o aluno reabre pelo link
  }
}

// "Sair deste aparelho": apaga token, cache e fila. É o contrapeso de guardar
// uma credencial de vida longa num aparelho que pode ser emprestado ou perdido.
export async function forgetStudentDevice(): Promise<void> {
  await idbClearAll()
  removeStudentToken()
}

function removeStudentToken(): void {
  try {
    localStorage.removeItem(STUDENT_TOKEN_KEY)
  } catch {
    // O IndexedDB ja foi limpo; sem localStorage, nao ha mais o que fazer.
  }
}

// Ao descobrir que o servidor revogou o link, a limpeza deixa de ser best-effort:
// nunca confirmamos a revogacao local enquanto cache, fila ou rascunho puderem
// reaparecer na proxima abertura offline.
export async function purgeRevokedStudentDevice(): Promise<void> {
  let storageError: unknown
  try {
    if (typeof indexedDB !== 'undefined') await idbClearAll(true)
  } catch (error) {
    storageError = error
  } finally {
    // Mesmo que o IndexedDB esteja bloqueado, remover a chave impede que uma
    // nova carga reencontre o escopo e volte a exibir o cache revogado.
    removeStudentToken()
  }
  if (storageError) throw storageError
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

export type CachedHistory = {
  sessions: StudentHistorySession[]
  nextCursor: StudentHistoryCursor | null
}

export async function readCachedHistory(scope: string): Promise<CachedHistory | null> {
  const cached = await idbGet<CachedHistory | StudentHistorySession[]>(`history:${scope}`)
  if (!cached) return null
  // Compatibilidade com o cache gravado pela primeira versao da pagina.
  if (Array.isArray(cached)) return { sessions: cached, nextCursor: null }
  return cached
}

export async function writeCachedHistory(
  scope: string,
  sessions: StudentHistorySession[],
  nextCursor: StudentHistoryCursor | null
): Promise<void> {
  await idbSet(`history:${scope}`, { sessions, nextCursor } satisfies CachedHistory)
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

export async function removeCachedPlan(scope: string, planId: string): Promise<void> {
  await idbDelete(`plan:${scope}:${planId}`)
}

// ---------------------------------------------------------------- fila

export type QueuedSession = {
  clientRef: string
  revision: number
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
  return (await idbGet<QueuedSession[]>(`queue:${scope}`, true)) ?? []
}

// Enfileirar a MESMA sessão de novo substitui a anterior: o aluno que salva
// três vezes durante o treino tem uma pendência, não três.
export async function enqueueSession(scope: string, session: QueuedSession): Promise<void> {
  await idbUpdate<QueuedSession[]>(
    `queue:${scope}`,
    (queue) => [...(queue ?? []).filter((item) => item.clientRef !== session.clientRef), session],
    true
  )
}

export async function dequeueSession(
  scope: string,
  clientRef: string,
  required = true
): Promise<void> {
  await idbUpdate<QueuedSession[]>(
    `queue:${scope}`,
    (queue) => (queue ?? []).filter((item) => item.clientRef !== clientRef),
    required
  )
}

export async function markSessionRejected(
  scope: string,
  clientRef: string,
  message: string
): Promise<void> {
  await idbUpdate<QueuedSession[]>(
    `queue:${scope}`,
    (queue) =>
      (queue ?? []).map((item) =>
        item.clientRef === clientRef ? { ...item, error: message } : item
      ),
    true
  )
}

export async function clearQueue(scope: string): Promise<void> {
  await idbDelete(`queue:${scope}`, true)
}

// ---------------------------------------------------------------- rascunho

// A sessão em andamento, antes de ser salva. Sobrevive a fechar a aba no meio
// do treino, que numa academia acontece o tempo todo.
export type DraftSession = {
  clientRef: string
  revision: number
  planId: string | null
  dayId: string | null
  weekNumber: number | null
  performedAt: string
  notes: string
  rows: Record<string, { weight: string; reps: string; rir: string }[]>
}

type StoredDraftSession = DraftSession & { updatedAt: string }
type DraftBucket = {
  version: 2
  active: string
  sessions: StoredDraftSession[]
}

function draftKey(scope: string, planId: string | null): string {
  return `draft:${scope}:${planId ?? 'sem-plano'}`
}

function draftSessionKey(dayId: string | null, performedAt: string): string {
  return `${dayId ?? 'sem-divisao'}:${performedAt}`
}

function isDraftBucket(value: DraftBucket | DraftSession): value is DraftBucket {
  return 'version' in value && value.version === 2 && Array.isArray(value.sessions)
}

export async function readDraft(
  scope: string,
  planId: string | null,
  dayId?: string | null,
  performedAt?: string
): Promise<DraftSession | null> {
  const scoped = await idbGet<DraftBucket | DraftSession>(draftKey(scope, planId))
  if (scoped) {
    if (!isDraftBucket(scoped)) {
      const legacy = { ...scoped, revision: scoped.revision ?? 0 }
      const exact =
        dayId === undefined || performedAt === undefined
        || (legacy.dayId === dayId && legacy.performedAt === performedAt)
      return exact ? legacy : null
    }
    const wanted =
      dayId !== undefined && performedAt !== undefined
        ? draftSessionKey(dayId, performedAt)
        : scoped.active
    const found = scoped.sessions.find(
      (session) => draftSessionKey(session.dayId, session.performedAt) === wanted
    )
    return found ? { ...found, revision: found.revision ?? 0 } : null
  }

  // Migra o formato da primeira versão, que tinha um único rascunho por token.
  const legacy = await idbGet<DraftSession>(`draft:${scope}`)
  if (!legacy || legacy.planId !== planId) return null
  const migrated = { ...legacy, revision: legacy.revision ?? 0 }
  await writeDraft(scope, migrated)
  await idbDelete(`draft:${scope}`)
  const exact =
    dayId === undefined || performedAt === undefined
    || (migrated.dayId === dayId && migrated.performedAt === performedAt)
  return exact ? migrated : null
}

export async function writeDraft(
  scope: string,
  draft: DraftSession,
  required = false
): Promise<void> {
  const key = draftSessionKey(draft.dayId, draft.performedAt)
  const now = new Date().toISOString()
  await idbUpdate<DraftBucket | DraftSession>(
    draftKey(scope, draft.planId),
    (current) => {
      const sessions = current
        ? isDraftBucket(current)
          ? current.sessions
          : [{ ...current, revision: current.revision ?? 0, updatedAt: now }]
        : []
      const previous = sessions.find(
        (session) => draftSessionKey(session.dayId, session.performedAt) === key
      )
      const incomingRevision = Math.max(0, Math.trunc(draft.revision || 0))
      const updated: StoredDraftSession =
        previous && previous.revision > incomingRevision
          ? previous
          : { ...draft, revision: incomingRevision, updatedAt: now }
      return {
        version: 2,
        active: key,
        sessions: [
          updated,
          ...sessions.filter(
            (session) => draftSessionKey(session.dayId, session.performedAt) !== key
          ),
        ].slice(0, 14),
      }
    },
    required
  )
}

// Reserva atomica da próxima revisão da sessão. Como a leitura e a escrita
// usam uma única transação readwrite, duas abas nunca recebem o mesmo número.
// O próprio rascunho é persistido junto da reserva, eliminando a janela entre
// "Salvar progresso" e o debounce do autosave.
export async function reserveDraftRevision(
  scope: string,
  draft: DraftSession,
  required = false
): Promise<number> {
  const fallback = Math.max(0, Math.trunc(draft.revision || 0)) + 1
  const db = await openDb()
  if (!db) {
    if (required) throw new StudentStorageError()
    return fallback
  }
  return new Promise<number>((resolve, reject) => {
    let allocated = fallback
    const fail = () => (required ? reject(new StudentStorageError()) : resolve(fallback))
    try {
      const key = draftSessionKey(draft.dayId, draft.performedAt)
      const now = new Date().toISOString()
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const request = store.get(draftKey(scope, draft.planId))
      request.onsuccess = () => {
        try {
          const current = (request.result as DraftBucket | DraftSession | undefined) ?? null
          const sessions = current
            ? isDraftBucket(current)
              ? current.sessions
              : [{ ...current, revision: current.revision ?? 0, updatedAt: now }]
            : []
          const previous = sessions.find(
            (session) => draftSessionKey(session.dayId, session.performedAt) === key
          )
          allocated = Math.max(
            Math.trunc(previous?.revision ?? 0),
            Math.trunc(draft.revision || 0)
          ) + 1
          const updated: StoredDraftSession = { ...draft, revision: allocated, updatedAt: now }
          const bucket: DraftBucket = {
            version: 2,
            active: key,
            sessions: [
              updated,
              ...sessions.filter(
                (session) => draftSessionKey(session.dayId, session.performedAt) !== key
              ),
            ].slice(0, 14),
          }
          store.put(bucket, draftKey(scope, draft.planId))
        } catch {
          tx.abort()
        }
      }
      request.onerror = fail
      tx.oncomplete = () => resolve(allocated)
      tx.onerror = fail
      tx.onabort = fail
    } catch {
      fail()
    }
  })
}

export async function clearDraftSession(
  scope: string,
  planId: string | null,
  dayId?: string | null,
  performedAt?: string
): Promise<void> {
  if (dayId === undefined || performedAt === undefined) {
    await idbDelete(draftKey(scope, planId))
    return
  }
  const removed = draftSessionKey(dayId, performedAt)
  await idbUpdate<DraftBucket | DraftSession>(draftKey(scope, planId), (current) => {
    if (!current) return null
    if (!isDraftBucket(current)) {
      return draftSessionKey(current.dayId, current.performedAt) === removed ? null : current
    }
    const sessions = current.sessions.filter(
      (session) => draftSessionKey(session.dayId, session.performedAt) !== removed
    )
    if (sessions.length === 0) return null
    return {
      ...current,
      active:
        current.active === removed
          ? draftSessionKey(sessions[0].dayId, sessions[0].performedAt)
          : current.active,
      sessions,
    }
  })
}
