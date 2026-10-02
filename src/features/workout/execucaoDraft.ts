import { isEmptyLogRow, type LogRow } from './logRows'
import type { RestTimer } from './RestTimerBar'

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

export type ExecucaoRestTimer = RestTimer

export type ExecucaoExtra = { rowId: string; exerciseId: string }

// Sessão salva no servidor com "Salvar e continuar depois" (0041) que esta
// tela está continuando. A versão é a que o servidor devolveu no último
// salvamento: outro aparelho que salve antes faz o próximo salvamento ser
// recusado, em vez de um sobrescrever o outro.
export type ExecucaoContinuing = { logId: string; updatedAt: string; savedAt: string }

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
  // opcional: rascunho gravado antes da 0041 não tem o campo
  continuing?: ExecucaoContinuing | null
  // ordem escolhida para esta sessão e linhas do plano tiradas dela
  // (sessionOrder.ts); opcionais pelo mesmo motivo
  order?: string[]
  skipped?: string[]
}

// O cronômetro restaurado só faz sentido dentro do teto do descanso (3600 s).
export const RESTORE_TIMER_MAX_MS = 3_600_000

// Linha tirada da sessão não é registrada: o que estiver nela não conta.
function linhasDaSessao(
  value: Pick<ExecucaoDraft, 'sets' | 'skipped'>
): [string, LogRow[]][] {
  const fora = new Set(value.skipped ?? [])
  return Object.entries(value.sets).filter(([rowId]) => !fora.has(rowId))
}

export function execucaoHasContent(
  value: Pick<ExecucaoDraft, 'sets' | 'extras' | 'notes' | 'skipped'>
): boolean {
  return (
    value.notes.trim() !== '' ||
    value.extras.length > 0 ||
    linhasDaSessao(value).some(([, rows]) => rows.some((row) => !isEmptyLogRow(row)))
  )
}

// O que a sessão tem, sem o que não muda o registro: linhas vazias (a tela
// completa a grade até o número prescrito), cronômetro, ordem das chaves e
// ordem dos exercícios (o registro não guarda ordem). Dois
// estados com a mesma chave gravariam a mesma sessão — é o que diz se houve
// mudança desde o último "Salvar e continuar depois".
export function execucaoContentKey(
  value: Pick<ExecucaoDraft, 'dayKey' | 'date' | 'week' | 'notes' | 'sets' | 'extras' | 'skipped'>
): string {
  const sets = linhasDaSessao(value)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .flatMap(([rowId, rows]) => {
      const linhas = rows.flatMap((row, index) =>
        isEmptyLogRow(row)
          ? []
          : [[index, row.weight.trim(), row.reps.trim(), row.rir.trim(), (row.rest ?? '').trim(),
              row.failure === true, row.done === true]]
      )
      return linhas.length > 0 ? [[rowId, linhas]] : []
    })
  return JSON.stringify({
    dayKey: value.dayKey,
    date: value.date,
    week: value.week.trim(),
    notes: value.notes.trim(),
    extras: value.extras.map((x) => x.rowId).sort(),
    sets,
  })
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

export type SavedSessionSet = {
  exercise_id: string
  set_number: number
  weight_kg: number | null
  reps: number | null
  rir: number | null
  rest_seconds?: number | null
  reached_failure?: boolean | null
}

// Sessão salva no servidor -> formulário da Execução, para continuar de onde
// parou. As séries vão para a linha do mesmo exercício do catálogo na divisão
// da sessão, na posição do número da série; exercício que não está na divisão
// volta como avulso. Tudo o que foi gravado volta marcado como feito.
export function sessionToForm(
  session: { day_label: string | null },
  sets: SavedSessionSet[],
  plano: PlanoAtual
): { dayKey: string; sets: Record<string, LogRow[]>; extras: ExecucaoExtra[] } {
  const dia = plano.days.find((d) => d.label === session.day_label) ?? plano.days[0] ?? null
  const rows: Record<string, LogRow[]> = {}
  const extras: ExecucaoExtra[] = []
  const vazia = (): LogRow => ({ weight: '', reps: '', rir: '', rest: '', failure: false })
  for (const set of [...sets].sort((a, b) => a.set_number - b.set_number)) {
    const doDia = dia
      ? plano.exercises.find((e) => e.day_id === dia.id && e.exercise_id === set.exercise_id)
      : undefined
    let rowId = doDia?.id
    if (!rowId) {
      rowId = `extra:${set.exercise_id}`
      if (!extras.some((x) => x.rowId === rowId)) extras.push({ rowId, exerciseId: set.exercise_id })
    }
    const linhas = (rows[rowId] ??= [])
    const index = Math.max(0, set.set_number - 1)
    while (linhas.length <= index) linhas.push(vazia())
    linhas[index] = {
      weight: set.weight_kg != null ? String(set.weight_kg) : '',
      reps: set.reps != null ? String(set.reps) : '',
      rir: set.rir != null ? String(set.rir) : '',
      rest: set.rest_seconds != null ? String(set.rest_seconds) : '',
      failure: set.reached_failure === true,
      done: true,
    }
  }
  return { dayKey: dia?.id ?? '', sets: rows, extras }
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

  // A linha do plano no plano de agora: mesmo id ou, se ele foi regravado, o
  // mesmo exercício do catálogo na mesma divisão.
  const linhaAtual = (rowId: string) => {
    const catalogo = draft.rowExercises[rowId]
    return plano.exercises.find((e) => e.id === rowId && e.day_id === dia?.id)
      ?? (catalogo && dia
        ? plano.exercises.find((e) => e.day_id === dia.id && e.exercise_id === catalogo)
        : undefined)
  }
  const remapear = (ids: string[] | undefined) =>
    (ids ?? []).flatMap((rowId) => {
      if (extrasIds.has(rowId)) return [rowId]
      const alvo = linhaAtual(rowId)
      return alvo ? [alvo.id] : []
    })

  for (const [rowId, rows] of Object.entries(draft.sets)) {
    if (extrasIds.has(rowId)) {
      sets[rowId] = rows
      continue
    }
    const alvo = linhaAtual(rowId)
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
    const alvo = linhaAtual(restTimer.rowId)
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
      order: remapear(draft.order),
      skipped: remapear(draft.skipped),
    },
    lostRows,
  }
}
