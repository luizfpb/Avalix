import { isEmptyLogRow, type LogRow } from './logRows'

// Rascunho da sessão que o profissional registra na Execução.
//
// A tela guardava tudo só na memória: um toque em "Início" na barra do celular,
// o Android descartando a aba enquanto o educador abria a câmera ou o WhatsApp,
// ou o "Atualizar" do aviso de versão nova jogavam fora uma hora de séries sem
// perguntar. Mesmo mecanismo dos outros formulários longos (lib/draft: escopo
// usuário + organização, 24 horas).
//
// As linhas do plano são indexadas pelo id de workout_exercises, que muda
// quando o plano é regravado. Por isso o rascunho guarda também o exercício do
// CATÁLOGO de cada linha e o rótulo da divisão — a mesma identidade estável que
// o rascunho do aluno usa (studentDraft.ts) — e é remapeado na volta, em vez de
// perder as séries caladas. O que não tem para onde ir é contado e avisado.

export type ExecucaoRestTimer = {
  rowId: string
  index: number
  name: string
  targetSeconds: number | null
  // instante do início (ms): o cronômetro continua certo depois de restaurado
  startedAt: number
}

export type ExecucaoExtra = { rowId: string; exerciseId: string }

export type ExecucaoDraft = {
  version: 1
  dayKey: string
  dayLabel: string | null
  date: string
  week: string
  weekTouched: boolean
  notes: string
  // só as linhas da divisão escolhida e dos avulsos: é o que seria registrado
  sets: Record<string, LogRow[]>
  // linha do plano -> exercício do catálogo
  rowExercises: Record<string, string>
  extras: ExecucaoExtra[]
  restTimer: ExecucaoRestTimer | null
}

// O cronômetro restaurado só faz sentido dentro do teto do descanso (3600 s).
export const RESTORE_TIMER_MAX_MS = 3_600_000

export function execucaoHasContent(
  value: Pick<ExecucaoDraft, 'sets' | 'extras' | 'notes'>
): boolean {
  return (
    value.notes.trim() !== '' ||
    value.extras.length > 0 ||
    Object.values(value.sets).some((rows) => rows.some((row) => !isEmptyLogRow(row)))
  )
}

export function isExecucaoDraft(value: unknown): value is ExecucaoDraft {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<ExecucaoDraft>
  return (
    v.version === 1 &&
    typeof v.dayKey === 'string' &&
    typeof v.date === 'string' &&
    typeof v.notes === 'string' &&
    typeof v.week === 'string' &&
    !!v.sets && typeof v.sets === 'object' &&
    Array.isArray(v.extras)
  )
}

type PlanoAtual = {
  days: { id: string; label: string }[]
  exercises: { id: string; day_id: string; exercise_id: string }[]
}

export type ExecucaoDraftReconciled = {
  draft: ExecucaoDraft
  // séries com conteúdo que não puderam ser reatribuídas
  lostRows: number
}

export function reconcileExecucaoDraft(
  draft: ExecucaoDraft,
  plano: PlanoAtual
): ExecucaoDraftReconciled {
  const diaPorId = plano.days.find((d) => d.id === draft.dayKey)
  const diaPorRotulo = draft.dayLabel
    ? plano.days.find((d) => d.label === draft.dayLabel)
    : undefined
  const dia = diaPorId ?? diaPorRotulo ?? null

  const extrasIds = new Set(draft.extras.map((x) => x.rowId))
  const sets: Record<string, LogRow[]> = {}
  const rowExercises: Record<string, string> = {}
  let lostRows = 0

  for (const [rowId, rows] of Object.entries(draft.sets)) {
    if (extrasIds.has(rowId)) {
      sets[rowId] = rows
      continue
    }
    const catalogo = draft.rowExercises[rowId]
    const mesmoId = plano.exercises.find((e) => e.id === rowId && e.day_id === dia?.id)
    const alvo = mesmoId
      ?? (catalogo && dia
        ? plano.exercises.find((e) => e.day_id === dia.id && e.exercise_id === catalogo)
        : undefined)
    if (!alvo) {
      lostRows += rows.filter((row) => !isEmptyLogRow(row)).length
      continue
    }
    sets[alvo.id] = rows
    rowExercises[alvo.id] = alvo.exercise_id
  }

  // O cronômetro aponta para uma linha; se ela mudou de id, acompanha.
  let restTimer = draft.restTimer
  if (restTimer && !extrasIds.has(restTimer.rowId)) {
    const catalogo = draft.rowExercises[restTimer.rowId]
    const alvo = plano.exercises.find((e) => e.id === restTimer!.rowId && e.day_id === dia?.id)
      ?? (catalogo && dia
        ? plano.exercises.find((e) => e.day_id === dia.id && e.exercise_id === catalogo)
        : undefined)
    restTimer = alvo ? { ...restTimer, rowId: alvo.id } : null
  }

  return {
    draft: {
      ...draft,
      dayKey: dia?.id ?? plano.days[0]?.id ?? '',
      dayLabel: dia?.label ?? null,
      sets,
      rowExercises,
      restTimer,
    },
    lostRows,
  }
}
