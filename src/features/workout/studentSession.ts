import { sha256Hex } from '../../lib/hash'
import { isValidWorkoutToken } from './link'
import { submitSession, type SubmitSet } from './studentApi'
import {
  dequeueSession,
  loadStudentToken,
  readQueue,
  saveStudentToken,
  type QueuedSession,
} from './studentStore'

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
    try {
      await submitSession({
        token,
        clientRef: item.clientRef,
        sets: item.sets,
        dayLabel: item.dayLabel,
        weekNumber: item.weekNumber,
        performedAt: item.performedAt,
        notes: item.notes,
        planId: item.planId,
      })
      await dequeueSession(scope, item.clientRef)
      result.sent += 1
    } catch (error) {
      if (isNetworkFailure(error)) {
        // ainda sem rede: para por aqui e tenta tudo de novo depois
        result.pending = queue.length - result.sent
        return result
      }
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message ?? '')
          : 'não foi possível registrar'
      await dequeueSession(scope, item.clientRef)
      result.rejected.push({ clientRef: item.clientRef, message })
    }
  }

  result.pending = (await readQueue(scope)).length
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

export function queuedSessionLabel(item: QueuedSession): string {
  const data = item.performedAt.split('-').reverse().join('/')
  return item.dayLabel ? `Treino ${item.dayLabel} · ${data}` : data
}
