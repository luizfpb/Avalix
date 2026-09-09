import type {
  StudentHistoryCursor,
  StudentHistorySession,
  StudentPlanDetail,
  StudentWorkout,
  SubmitSet,
} from './studentApi'
import { reconciliarRascunho, type PlanoVigente, type RascunhoReconciliado } from './studentDraft'

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
const ACCESS_GENERATION = '@access-generation'
let localGeneration = 0

// Capturada antes de iniciar rede/rascunho. A geração persistida fecha também
// a corrida entre abas: a purga troca o carimbo na MESMA transação do clear.
export type StudentStorageAccess = { generation: string; localGeneration: number; active: boolean; parent?: StudentStorageAccess }

export class StudentAccessEndedError extends Error {
  constructor() { super('O acesso a este aparelho foi encerrado.'); this.name = 'StudentAccessEndedError' }
}

export class StudentDraftConflictError extends Error {
  constructor() {
    super('Este treino mudou ou foi concluído em outra aba. Seu preenchimento foi mantido nesta tela. Atualize o treino antes de continuar.')
    this.name = 'StudentDraftConflictError'
  }
}

export async function captureStudentStorageAccess(): Promise<StudentStorageAccess> {
  const generation = localGeneration
  return { generation: await idbGet<string>(ACCESS_GENERATION) ?? '', localGeneration: generation, active: true }
}

export function isStudentStorageAccessCurrent(access: StudentStorageAccess): boolean {
  return access.active && access.localGeneration === localGeneration && (!access.parent || isStudentStorageAccessCurrent(access.parent))
}

export function invalidateStudentStorageAccess(access: StudentStorageAccess): void { access.active = false }

function assertAccess(access: StudentStorageAccess): void {
  if (!isStudentStorageAccessCurrent(access)) throw new StudentAccessEndedError()
}

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

async function idbSet(key: Key, value: unknown, access?: StudentStorageAccess): Promise<void> {
  await idbUpdate(key, () => value, false, access)
}

// Read-modify-write dentro da mesma transação. O IndexedDB serializa
// transações readwrite concorrentes sobre o object store, inclusive entre
// abas; separar get() e put() permitia que uma aba gravasse um snapshot velho.
async function idbUpdate<T>(
  key: Key,
  update: (current: T | null) => T | null,
  required = false,
  access?: StudentStorageAccess,
  legacy?: { key: string; matches: (value: T) => boolean }
): Promise<void> {
  const lease = access ?? await captureStudentStorageAccess()
  assertAccess(lease)
  const db = await openDb()
  assertAccess(lease)
  if (!db) {
    if (required) throw new StudentStorageError()
    return
  }
  await new Promise<void>((resolve, reject) => {
    let cause: unknown
    const fail = () => (cause ? reject(cause) : required ? reject(new StudentStorageError()) : resolve())
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const generation = store.get(ACCESS_GENERATION)
      generation.onsuccess = () => {
        try {
          assertAccess(lease)
          if ((generation.result ?? '') !== lease.generation) throw new StudentAccessEndedError()
          const request = store.get(key)
          const apply = (current: T | null) => {
            try {
              assertAccess(lease)
              const next = update(current)
              if (next == null) store.delete(key)
              else store.put(next, key)
            } catch (error) { cause = error; tx.abort() }
          }
          request.onsuccess = () => {
            if (request.result != null || !legacy) { apply((request.result as T) ?? null); return }
            const old = store.get(legacy.key)
            old.onsuccess = () => {
              const value = old.result as T | undefined
              if (value != null && legacy.matches(value)) { store.delete(legacy.key); apply(value) }
              else apply(null)
            }
            old.onerror = fail
          }
          request.onerror = fail
        } catch (error) {
          cause = error
          tx.abort()
        }
      }
      generation.onerror = fail
      tx.oncomplete = () => resolve()
      tx.onerror = fail
      tx.onabort = fail
    } catch {
      fail()
    }
  })
}

async function idbDelete(key: Key, required = false, access?: StudentStorageAccess): Promise<void> {
  await idbUpdate(key, () => null, required, access)
}

async function idbClearAll(required = false): Promise<void> {
  localGeneration += 1
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
      store.clear()
      store.put(crypto.randomUUID(), ACCESS_GENERATION)
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
  removeStudentToken()
  await idbClearAll(true)
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
  removeStudentToken()
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

export async function writeCachedWorkout(scope: string, data: StudentWorkout, access?: StudentStorageAccess): Promise<void> {
  await idbSet(`workout:${scope}`, { at: new Date().toISOString(), data } satisfies CachedWorkout, access)
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
  nextCursor: StudentHistoryCursor | null,
  access?: StudentStorageAccess
): Promise<void> {
  await idbSet(`history:${scope}`, { sessions, nextCursor } satisfies CachedHistory, access)
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
  detail: StudentPlanDetail,
  access?: StudentStorageAccess
): Promise<void> {
  await idbSet(`plan:${scope}:${planId}`, detail, access)
}

export async function removeCachedPlan(scope: string, planId: string, access?: StudentStorageAccess): Promise<void> {
  await idbDelete(`plan:${scope}:${planId}`, false, access)
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
  retryAt?: number
  retries?: number
}

export async function readQueue(scope: string): Promise<QueuedSession[]> {
  return (await idbGet<QueuedSession[]>(`queue:${scope}`, true)) ?? []
}

// Enfileirar a MESMA sessão de novo substitui a anterior: o aluno que salva
// três vezes durante o treino tem uma pendência, não três.
export async function enqueueSession(scope: string, session: QueuedSession, access?: StudentStorageAccess): Promise<void> {
  await idbUpdate<QueuedSession[]>(
    `queue:${scope}`,
    (queue) => {
      const previous = queue?.find((item) => item.clientRef === session.clientRef)
      if (previous && previous.revision > session.revision) throw new StudentDraftConflictError()
      return [...(queue ?? []).filter((item) => item.clientRef !== session.clientRef), session]
    },
    true, access
  )
}

export async function dequeueSession(
  scope: string,
  clientRef: string,
  required = true,
  access?: StudentStorageAccess,
  revision?: number
): Promise<void> {
  await idbUpdate<QueuedSession[]>(
    `queue:${scope}`,
    (queue) => (queue ?? []).filter((item) => item.clientRef !== clientRef || (revision != null && (item.revision ?? 1) !== revision)),
    required, access
  )
}

export async function markSessionRejected(
  scope: string,
  clientRef: string,
  message: string,
  access?: StudentStorageAccess,
  revision?: number
): Promise<void> {
  await idbUpdate<QueuedSession[]>(
    `queue:${scope}`,
    (queue) =>
      (queue ?? []).map((item) =>
        item.clientRef === clientRef && (revision == null || (item.revision ?? 1) === revision) ? { ...item, error: message } : item
      ),
    true, access
  )
}

export async function clearQueue(scope: string): Promise<void> {
  await idbDelete(`queue:${scope}`, true)
}

export async function markSessionRetry(scope: string, session: QueuedSession, access?: StudentStorageAccess): Promise<void> {
  await idbUpdate<QueuedSession[]>(`queue:${scope}`, (queue) => (queue ?? []).map((item) => {
    if (item.clientRef !== session.clientRef || (item.revision ?? 1) !== (session.revision ?? 1)) return item
    const retries = Math.min((item.retries ?? 0) + 1, 6)
    return { ...item, error: undefined, retries, retryAt: Date.now() + Math.min(300_000, 15_000 * 2 ** (retries - 1)) }
  }), true, access)
}

// ---------------------------------------------------------------- rascunho

// A sessão em andamento, antes de ser salva. Sobrevive a fechar a aba no meio
// do treino, que numa academia acontece o tempo todo.
export type DraftRow = {
  weight: string
  reps: string
  rir: string
  rest?: string
  failure?: boolean | null
}

export type DraftSession = {
  clientRef: string
  revision: number
  planId: string | null
  dayId: string | null
  weekNumber: number | null
  performedAt: string
  notes: string
  rows: Record<string, DraftRow[]>
  // Exercícios de OUTRA divisão do plano feitos nesta sessão (substituição de
  // última hora). Guardados como id do exercício do plano, que é a mesma chave
  // de `rows`. Opcional: rascunho gravado antes desta versão não tem o campo.
  extras?: string[]
  // IDENTIDADE ESTÁVEL do que este rascunho descreve, para ele sobreviver a uma
  // regravação do plano (que troca todos os ids filhos). Ver studentDraft.ts.
  // Opcional: rascunho gravado antes desta versão não tem o campo.
  identity?: {
    /** rótulo da divisão (A, B, C...) */
    dayLabel: string | null
    /** chave de `rows` -> exercício do CATÁLOGO */
    rowExercises: Record<string, string>
  }
}

type StoredDraftSession = DraftSession & { updatedAt: string }
type LegacyDraftBucket = { version: 2; active: string; sessions: StoredDraftSession[] }
type DraftBucket = {
  version: 3
  // A divisão pode trocar de ID; a sessão mantém seu clientRef.
  active: string | null
  sessions: StoredDraftSession[]
  completed: string[]
}
type DraftStorage = DraftBucket | LegacyDraftBucket | DraftSession

function draftKey(scope: string, planId: string | null): string {
  return `draft:${scope}:${planId ?? 'sem-plano'}`
}
function draftSessionKey(dayId: string | null, performedAt: string): string {
  return `${dayId ?? 'sem-divisao'}:${performedAt}`
}
function bucketOf(value: DraftStorage | null): DraftBucket {
  if (!value) return { version: 3, active: null, sessions: [], completed: [] }
  if (!('version' in value)) {
    return { version: 3, active: value.clientRef, completed: [],
      sessions: [{ ...value, revision: value.revision ?? 0, updatedAt: '' }] }
  }
  const completed = value.version === 3 ? value.completed ?? [] : []
  const unique = new Map<string, StoredDraftSession>()
  for (const session of value.sessions) {
    if (completed.includes(session.clientRef)) continue
    const previous = unique.get(session.clientRef)
    if (!previous || session.revision > previous.revision ||
      (session.revision === previous.revision && session.updatedAt > previous.updatedAt)) {
      unique.set(session.clientRef, { ...session, revision: session.revision ?? 0 })
    }
  }
  const sessions = [...unique.values()]
  const active = value.version === 3 ? value.active : value.sessions.find((session) =>
    draftSessionKey(session.dayId, session.performedAt) === value.active)?.clientRef
  return { version: 3, completed, sessions,
    active: sessions.some((session) => session.clientRef === active) ? active ?? null : sessions[0]?.clientRef ?? null }
}
function legacyDraft(scope: string, planId: string | null) {
  return { key: `draft:${scope}`, matches: (value: DraftStorage) =>
    !('version' in value) && value.planId === planId }
}
function selectedDraft(bucket: DraftBucket, dayId?: string | null, date?: string) {
  return bucket.sessions.find((session) => dayId === undefined || date === undefined
    ? session.clientRef === bucket.active : session.dayId === dayId && session.performedAt === date) ?? null
}

export async function readDraft(
  scope: string, planId: string | null, dayId?: string | null, performedAt?: string,
  access?: StudentStorageAccess
): Promise<DraftSession | null> {
  if (access) assertAccess(access)
  if (!await openDb()) return null
  let selected: DraftSession | null = null
  await idbUpdate<DraftStorage>(draftKey(scope, planId), (value) => {
    const bucket = bucketOf(value)
    selected = selectedDraft(bucket, dayId, performedAt)
    return bucket
  }, true, access, legacyDraft(scope, planId))
  return selected
}

// Migra TODO o bucket na mesma transação, sem deixar cópias nos IDs antigos.
// Rascunho cuja divisão desapareceu permanece armazenado; não o apagamos para
// fabricar uma restauração bem-sucedida. Os rascunhos válidos seguem acessíveis.
export async function readReconciledDraft(
  scope: string, planId: string | null, plan: PlanoVigente,
  access?: StudentStorageAccess, dayId?: string | null, performedAt?: string
): Promise<RascunhoReconciliado | null> {
  if (access) assertAccess(access)
  if (!await openDb()) return null
  let selected: RascunhoReconciliado | null = null
  await idbUpdate<DraftStorage>(draftKey(scope, planId), (value) => {
    const bucket = bucketOf(value)
    const changes = new Map<string, RascunhoReconciliado>()
    bucket.sessions = bucket.sessions.map((session) => {
      const result = reconciliarRascunho(session, plan)
      if (!result) return session
      if (result.remapeado || result.perdidas > 0) result.draft.revision = (session.revision ?? 0) + 1
      changes.set(session.clientRef, result)
      return { ...result.draft, updatedAt: session.updatedAt }
    })
    const session = selectedDraft(bucket, dayId, performedAt)
    selected = session ? changes.get(session.clientRef) ?? null : null
    return bucket
  }, true, access, legacyDraft(scope, planId))
  return selected
}

export async function writeDraft(
  scope: string, draft: DraftSession, _required = false, access?: StudentStorageAccess
): Promise<number> {
  const base = Math.max(0, Math.trunc(draft.revision || 0))
  const revision = base + 1
  await idbUpdate<DraftStorage>(draftKey(scope, draft.planId), (value) => {
    const bucket = bucketOf(value)
    if (bucket.completed.includes(draft.clientRef)) throw new StudentDraftConflictError()
    const previous = bucket.sessions.find((session) => session.clientRef === draft.clientRef)
      ?? bucket.sessions.find((session) => session.dayId === draft.dayId && session.performedAt === draft.performedAt)
    if (previous ? previous.clientRef !== draft.clientRef || previous.revision !== base : base !== 0) {
      throw new StudentDraftConflictError()
    }
    const updated = { ...draft, revision, updatedAt: new Date().toISOString() }
    return { ...bucket, active: draft.clientRef,
      sessions: [updated, ...bucket.sessions.filter((session) => session.clientRef !== draft.clientRef)] }
  }, true, access, legacyDraft(scope, draft.planId))
  return revision
}

// A revisão-base é do conteúdo conhecido pela aba. Nunca promovemos conteúdo
// antigo usando a revisão mais recente encontrada no banco local.
export async function reserveDraftRevision(
  scope: string, draft: DraftSession, required = false, access?: StudentStorageAccess
): Promise<number> {
  // Sem conexão IndexedDB desde a abertura, não há rascunho recuperado nem
  // gravação local a confirmar. Só a conclusão online admite revisão efêmera.
  if (!required && !await openDb()) {
    if (access) assertAccess(access)
    return Math.max(0, Math.trunc(draft.revision || 0)) + 1
  }
  return writeDraft(scope, draft, required, access)
}

export async function clearDraftSession(
  scope: string, planId: string | null, dayId?: string | null, performedAt?: string,
  access?: StudentStorageAccess, clientRef?: string, expectedRevision?: number
): Promise<void> {
  if (access) assertAccess(access)
  if (!await openDb()) return
  await idbUpdate<DraftStorage>(draftKey(scope, planId), (value) => {
    const bucket = bucketOf(value)
    const removed = bucket.sessions.filter((session) => clientRef != null ? session.clientRef === clientRef
      : dayId === undefined || performedAt === undefined ||
        (session.dayId === dayId && session.performedAt === performedAt))
    if (expectedRevision != null && removed.some((session) => session.revision !== expectedRevision)) {
      throw new StudentDraftConflictError()
    }
    const refs = new Set([...removed.map((session) => session.clientRef), ...(clientRef ? [clientRef] : [])])
    const sessions = bucket.sessions.filter((session) => !refs.has(session.clientRef))
    return { ...bucket, sessions, completed: [...new Set([...bucket.completed, ...refs])],
      active: bucket.active && !refs.has(bucket.active) ? bucket.active : sessions[0]?.clientRef ?? null }
  }, true, access, legacyDraft(scope, planId))
}
