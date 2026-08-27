import { sha256Hex } from '../../lib/hash'
import { isValidWorkoutToken } from './link'
import { submitSession, type SubmitSet } from './studentApi'
import {
  dequeueSession,
  loadStudentToken,
  markSessionRejected,
  readQueue,
  saveStudentToken,
  type QueuedSession,
} from './studentStore'

const localSyncTails = new Map<string, Promise<void>>()

async function withLocalSyncLock<T>(scope: string, task: () => Promise<T>): Promise<T> {
  const previous = localSyncTails.get(scope) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  localSyncTails.set(scope, current)
  await previous
  try {
    return await task()
  } finally {
    release()
    if (localSyncTails.get(scope) === current) localSyncTails.delete(scope)
  }
}

// Um unico escritor por token: o Web Lock cobre abas distintas; o mutex local
// e o fallback para navegadores sem a API. A revisao monotona no banco continua
// sendo a ultima barreira contra replays originados por clientes antigos.
export async function withStudentSyncLock<T>(
  scope: string,
  task: () => Promise<T>
): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(`avalix-treino-sync:${scope}`, task)
  }
  return withLocalSyncLock(scope, task)
}

type StudentLocation = Pick<Location, 'pathname' | 'hash' | 'search'>
type StudentHistory = Pick<History, 'replaceState' | 'state'>

// Captura o token do fragmento e o guarda no aparelho, limpando a URL na mesma
// carga. Sem fragmento (o caso de reabrir instalado ou offline), recupera o que
// ficou guardado.
//
// A limpeza do fragmento é o mesmo cuidado do link de anamnese: o token não
// fica visível na barra de endereço nem no histórico do navegador, onde
// qualquer pessoa com o aparelho na mão o leria.
export function resolveStudentToken(
  currentLocation: StudentLocation = window.location,
  currentHistory: StudentHistory = window.history
): string | null {
  const fromHash = currentLocation.hash.slice(1)

  if (isValidWorkoutToken(fromHash)) {
    saveStudentToken(fromHash)
    try {
      currentHistory.replaceState(currentHistory.state, '', '/t')
    } catch {
      // sem history (teste, webview exótica): o token já está guardado
    }
    return fromHash
  }

  if (currentLocation.hash || currentLocation.search) {
    try {
      currentHistory.replaceState(currentHistory.state, '', '/t')
    } catch {
      // best-effort
    }
  }

  // Um fragmento explícito representa uma tentativa de abrir OUTRO link. Se
  // ele está malformado, usar o treino antigo salvo no aparelho pode registrar
  // a sessão para a pessoa errada. O token antigo continua armazenado para uma
  // abertura futura e consciente de /t sem fragmento.
  if (currentLocation.hash) return null

  return loadStudentToken()
}

// Chave do armazenamento local: o hash do token, nunca o cru.
export async function studentScope(token: string): Promise<string> {
  return sha256Hex(token)
}

// Falha de rede é temporária (o item fica na fila); recusa do servidor é
// definitiva (o item sai com aviso). Insistir eternamente num envio que o
// servidor nunca vai aceitar é como se perde a confiança do usuário na fila.
export function isNetworkFailure(error: unknown): boolean {
  const message = (
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '')
  ).toLowerCase()
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('fetch failed') ||
    message.includes('load failed') ||
    message.includes('network request failed')
  )
}

export function isInvalidStudentLinkError(error: unknown): boolean {
  const message = (
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '')
  )
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return message.includes('link invalido ou expirado')
}

export function isStudentLinkExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false
  const expires = Date.parse(expiresAt)
  // Uma validade malformada não é evidência suficiente para renderizar dados
  // privados do cache. O chamador trata o cache legado sem campo separadamente.
  return !Number.isFinite(expires) || expires <= now
}

export type FlushResult = {
  sent: number
  pending: number
  rejected: { clientRef: string; message: string }[]
}

// Sobe a fila inteira. Reenviar é inofensivo por construção (client_ref), então
// não há estado a proteger contra execução concorrente além de não duplicar
// esforço — quem chama evita isso com o `flushing` da página.
export async function flushQueue(token: string, scope: string): Promise<FlushResult> {
  const queue = await readQueue(scope)
  const result: FlushResult = { sent: 0, pending: 0, rejected: [] }

  for (const item of queue) {
    if (item.error) continue
    try {
      await submitSession({
        token,
        clientRef: item.clientRef,
        revision: item.revision ?? 1,
        sets: item.sets,
        dayLabel: item.dayLabel,
        weekNumber: item.weekNumber,
        performedAt: item.performedAt,
        notes: item.notes,
        planId: item.planId,
      })
    } catch (error) {
      if (isNetworkFailure(error)) {
        // ainda sem rede: para por aqui e tenta tudo de novo depois
        result.pending = (await readQueue(scope)).filter((q) => !q.error).length
        return result
      }
      if (isInvalidStudentLinkError(error)) throw error
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message ?? '')
          : 'não foi possível registrar'
      await markSessionRejected(scope, item.clientRef, message)
      result.rejected.push({ clientRef: item.clientRef, message })
      continue
    }

    // Se remover do IndexedDB falhar, a exceção sobe. O item permanece e o
    // replay é seguro pelo client_ref; fingir sucesso perderia rastreabilidade.
    await dequeueSession(scope, item.clientRef)
    result.sent += 1
  }

  result.pending = (await readQueue(scope)).filter((q) => !q.error).length
  return result
}

// Achata a grade da tela (linhas por exercício) no formato da RPC, numerando as
// séries por exercício — a unique do banco é (log, exercício, nº da série).
// Linha sem carga E sem repetição é linha não feita: não vira série.
export function buildSets(
  rows: Record<string, { weight: string; reps: string; rir: string }[]>,
  exercises: { id: string; exercise_id: string }[]
): SubmitSet[] {
  const sets: SubmitSet[] = []
  for (const exercise of exercises) {
    let n = 0
    for (const row of rows[exercise.id] ?? []) {
      const weight = row.weight.trim() === '' ? null : Number(row.weight)
      const reps = row.reps.trim() === '' ? null : Number(row.reps)
      const rir = row.rir.trim() === '' ? null : Number(row.rir)
      if (weight == null && reps == null) continue
      if (Number.isNaN(weight) || Number.isNaN(reps) || Number.isNaN(rir)) continue
      n += 1
      sets.push({
        exercise_id: exercise.exercise_id,
        set_number: n,
        weight_kg: weight,
        reps,
        rir,
      })
    }
  }
  return sets
}

export type StudentSetRow = { weight: string; reps: string; rir: string }

function emptySetRow(): StudentSetRow {
  return { weight: '', reps: '', rir: '' }
}

function rowIsEmpty(row: StudentSetRow): boolean {
  return !row.weight.trim() && !row.reps.trim() && !row.rir.trim()
}

// Ajusta a grade à prescrição sem apagar série preenchida. Linhas vazias que
// excedem a nova quantidade somem; uma série extra com dado continua explícita.
export function reconcileSetRows(rows: StudentSetRow[], prescribedSets: number): StudentSetRow[] {
  const target = Math.max(0, Math.min(Math.trunc(prescribedSets), 12))
  const next = rows.slice()
  while (next.length > target && rowIsEmpty(next[next.length - 1])) next.pop()
  while (next.length < target) next.push(emptySetRow())
  return next
}

export function suggestedWorkoutDayId(
  weeklySchedule: string[],
  days: { id: string; label: string }[],
  completedSessions: number | null | undefined
): string {
  if (days.length === 0) return ''
  const labels = new Set(days.map((day) => day.label))
  const schedule = weeklySchedule.filter((label) => labels.has(label))
  const sequence = schedule.length > 0 ? schedule : days.map((day) => day.label)
  const completed = Math.max(0, Math.trunc(completedSessions ?? 0))
  const nextLabel = sequence[completed % sequence.length]
  return days.find((day) => day.label === nextLabel)?.id ?? days[0].id
}

export function queuedSessionLabel(item: QueuedSession): string {
  const data = item.performedAt.split('-').reverse().join('/')
  return item.dayLabel ? `Treino ${item.dayLabel} · ${data}` : data
}
