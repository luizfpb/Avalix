import { sha256Hex } from '../../lib/hash'
import { isValidWorkoutToken } from './link'
import { validateLogRows, type LogRow } from './logRows'
import { submitSession, type SubmitSet } from './studentApi'
import {
  dequeueSession,
  captureStudentStorageAccess,
  isStudentStorageAccessCurrent,
  StudentAccessEndedError,
  loadStudentToken,
  markSessionRejected,
  markSessionRetry,
  readQueue,
  saveStudentToken,
  type QueuedSession,
  type StudentStorageAccess,
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

// Prazo para esperar a trava de outra aba. Cada toque no link do WhatsApp abre
// uma aba nova, e o Safari congela as antigas: uma aba congelada no meio de um
// envio segura a trava sem nunca devolvê-la, e "Concluindo..." giraria para
// sempre na aba nova. Passado o prazo, segue sem a trava — o envio é idempotente
// pelo client_ref, e a fila local muda só dentro de transações do IndexedDB.
export const SYNC_LOCK_WAIT_MS = 8_000

// Um unico escritor por token: o Web Lock cobre abas distintas; o mutex local
// e o fallback para navegadores sem a API. A revisao monotona no banco continua
// sendo a ultima barreira contra replays originados por clientes antigos.
export async function withStudentSyncLock<T>(
  scope: string,
  task: () => Promise<T>,
  waitMs = SYNC_LOCK_WAIT_MS
): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), waitMs)
    let acquired = false
    try {
      return await navigator.locks.request(`avalix-treino-sync:${scope}`, { signal: controller.signal }, () => {
        acquired = true
        clearTimeout(timer)
        return task()
      })
    } catch (error) {
      if (acquired) throw error
      return task()
    } finally {
      clearTimeout(timer)
    }
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

// O link colado pelo aluno, de onde quer que ele tenha copiado: a URL inteira,
// a mensagem do WhatsApp com texto em volta, ou só o token. Existe por causa do
// iPhone: o app instalado na tela de início tem armazenamento separado do
// Safari e o link do WhatsApp sempre abre no Safari, então o app instalado só
// recebe o token se o aluno colar o link nele uma vez.
export function tokenFromPastedLink(text: string): string | null {
  const trimmed = text.trim()
  if (isValidWorkoutToken(trimmed)) return trimmed
  const match = /\/t#([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/.exec(trimmed)
  return match ? match[1] : null
}

// Chave do armazenamento local: o hash do token, nunca o cru.
export async function studentScope(token: string): Promise<string> {
  return sha256Hex(token)
}

// Falha de rede é temporária (o item fica na fila); recusa do servidor é
// definitiva (o item sai com aviso). Insistir eternamente num envio que o
// servidor nunca vai aceitar é como se perde a confiança do usuário na fila.
export function isNetworkFailure(error: unknown): boolean {
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name) : ''
  if (name === 'AbortError' || name === 'TimeoutError') return true
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
    message.includes('network request failed') ||
    // Prazo das chamadas da página do aluno (studentApi): resposta que não
    // chegou a tempo é tratada como falta de rede, nunca como recusa.
    message.includes('aborterror') ||
    message.includes('aborted') ||
    message.includes('timeouterror')
  )
}

export function isTransientStudentError(error: unknown): boolean {
  if (isNetworkFailure(error)) return true
  const detail = error && typeof error === 'object' ? error as { code?: string; status?: number; message?: string } : {}
  if (detail.status === 408 || detail.status === 425 || detail.status === 429 || (detail.status ?? 0) >= 500) return true
  if (/^(08|53|57)/.test(detail.code ?? '') || ['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', '40001', '40P01'].includes(detail.code ?? '')) return true
  const message = (detail.message ?? String(error ?? '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return /schema cache|statement timeout|too many requests|rate limit|muitas requisicoes|muitas tentativas/.test(message)
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

export const CORRECTED_SESSION_MESSAGE =
  'Este treino foi editado no histórico. O envio antigo não substituiu a correção.'

// Sobe a fila inteira. Reenviar é inofensivo por construção (client_ref), então
// não há estado a proteger contra execução concorrente além de não duplicar
// esforço — quem chama evita isso com o `flushing` da página.
export async function flushQueue(token: string, scope: string, access?: StudentStorageAccess, force = false): Promise<FlushResult> {
  const lease = access ?? await captureStudentStorageAccess()
  const queue = await readQueue(scope)
  const result: FlushResult = { sent: 0, pending: 0, rejected: [] }

  for (const item of queue) {
    if (!isStudentStorageAccessCurrent(lease)) throw new StudentAccessEndedError()
    if (item.error && !isTransientStudentError({ message: item.error })) continue
    if (!force && (item.retryAt ?? 0) > Date.now()) continue
    let submitted: Awaited<ReturnType<typeof submitSession>>
    try {
      submitted = await submitSession({
        token,
        clientRef: item.clientRef,
        revision: item.revision ?? 1,
        sets: item.sets,
        dayLabel: item.dayLabel,
        weekNumber: item.weekNumber,
        performedAt: item.performedAt,
        notes: item.notes,
        planId: item.planId,
        feel: item.feel ?? null,
        inProgress: item.inProgress === true,
      })
    } catch (error) {
      if (!isStudentStorageAccessCurrent(lease)) throw new StudentAccessEndedError()
      if (isTransientStudentError(error)) {
        await markSessionRetry(scope, item, lease)
        // ainda sem rede: para por aqui e tenta tudo de novo depois
        result.pending = (await readQueue(scope)).filter((q) => !q.error).length
        return result
      }
      if (isInvalidStudentLinkError(error)) throw error
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message ?? '')
          : 'não foi possível registrar'
      await markSessionRejected(scope, item.clientRef, message, lease, item.revision ?? 1)
      result.rejected.push({ clientRef: item.clientRef, message })
      continue
    }

    if (!isStudentStorageAccessCurrent(lease)) throw new StudentAccessEndedError()
    if (submitted.corrected) {
      // A correção feita no histórico prevalece sobre o rascunho anterior.
      // Mantém o envio local visível, sem repetir nem confirmar uma gravação
      // que não aconteceu. O rascunho em andamento continua no aparelho.
      await markSessionRejected(scope, item.clientRef, CORRECTED_SESSION_MESSAGE, lease, item.revision ?? 1)
      result.rejected.push({ clientRef: item.clientRef, message: CORRECTED_SESSION_MESSAGE })
      continue
    }

    // Se remover do IndexedDB falhar, a exceção sobe. O item permanece e o
    // replay é seguro pelo client_ref; fingir sucesso perderia rastreabilidade.
    await dequeueSession(scope, item.clientRef, true, lease, item.revision ?? 1)
    result.sent += 1
  }

  result.pending = (await readQueue(scope)).filter((q) => !q.error).length
  return result
}

// Achata a grade da tela (linhas por exercício) no formato da RPC, numerando as
// séries por exercício — a unique do banco é (log, exercício, nº da série).
// Linha sem carga E sem repetição é linha não feita: não vira série.
//
// A contagem é por exercício do CATÁLOGO, e não por linha do plano: a sessão
// pode ter o mesmo movimento em duas grades (o prescrito e um trocado de outra
// divisão, se o plano mudar no meio do treino). Numerando por linha do plano,
// as duas começariam na série 1 e o servidor recusaria o envio INTEIRO por
// série repetida — perdendo o treino que a pessoa já tinha feito.
export function buildSets(
  rows: Record<string, LogRow[]>,
  exercises: { id: string; exercise_id: string }[]
): SubmitSet[] {
  const rowError = validateLogRows(Object.fromEntries(
    exercises.map((exercise) => [exercise.id, rows[exercise.id] ?? []])
  ))
  if (rowError) throw new Error(rowError)
  const sets: SubmitSet[] = []
  const contador = new Map<string, number>()
  for (const exercise of exercises) {
    for (const row of rows[exercise.id] ?? []) {
      const weight = row.weight.trim() === '' ? null : Number(row.weight)
      const reps = row.reps.trim() === '' ? null : Number(row.reps)
      const rir = row.rir.trim() === '' ? null : Number(row.rir)
      const rest = (row.rest ?? '').trim()
      if (weight == null && reps == null) continue
      if (Number.isNaN(weight) || Number.isNaN(reps) || Number.isNaN(rir)) continue
      const n = (contador.get(exercise.exercise_id) ?? 0) + 1
      contador.set(exercise.exercise_id, n)
      sets.push({
        exercise_id: exercise.exercise_id,
        set_number: n,
        weight_kg: weight,
        reps,
        rir,
        rest_seconds: rest === '' ? null : Number(rest),
        reached_failure: row.failure ?? null,
      })
    }
  }
  return sets
}

export type StudentSetRow = LogRow
export { reconcileSetRows } from './logRows'

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

function numeroBr(n: number): string {
  return String(n).replace('.', ',')
}

// O treino recusado em definitivo (data fora da janela de 7 dias, limite de
// sessões na data...) só tinha "Descartar" — que apagava o que a pessoa fez.
// Este texto é o que ela copia e manda ao treinador, que registra a sessão
// pela tela dele, na data certa. Os nomes vêm do plano; exercício que não está
// mais nele aparece como "Exercício".
export function queuedSessionText(item: QueuedSession, names: Record<string, string>): string {
  const cabecalho = [
    queuedSessionLabel(item),
    item.weekNumber != null ? `semana ${item.weekNumber}` : null,
  ].filter(Boolean).join(' · ')
  const porExercicio = new Map<string, SubmitSet[]>()
  for (const set of item.sets) {
    const lista = porExercicio.get(set.exercise_id) ?? []
    lista.push(set)
    porExercicio.set(set.exercise_id, lista)
  }
  const linhas = [...porExercicio].map(([exerciseId, sets]) => {
    const series = sets
      .slice()
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) => {
        const carga = s.weight_kg != null ? `${numeroBr(s.weight_kg)} kg` : null
        const reps = s.reps != null ? `${s.reps} reps` : null
        const extras = [
          s.rir != null ? `RIR ${numeroBr(s.rir)}` : null,
          s.reached_failure === true ? 'falha' : null,
          s.rest_seconds != null ? `descanso ${s.rest_seconds} s` : null,
        ].filter(Boolean)
        const base = [carga, reps].filter(Boolean).join(' × ')
        return extras.length > 0 ? `${base} (${extras.join(', ')})` : base
      })
    return `${names[exerciseId] ?? 'Exercício'}: ${series.join(' · ')}`
  })
  return [cabecalho, ...linhas, ...(item.notes ? [`Observações: ${item.notes}`] : [])].join('\n')
}
