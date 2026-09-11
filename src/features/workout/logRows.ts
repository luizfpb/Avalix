// Rascunhos anteriores aos campos de descanso e de série feita continuam
// legíveis: os dois são opcionais.
//
// `done` é estado de EXECUÇÃO, não dado do treino: marca a série que já foi
// feita, dá o sinal de progresso que faltava numa tela que era só formulário e
// é o gatilho do cronômetro de descanso na tela do profissional. Não vai para
// o banco — o que se registra continua sendo carga, reps, RIR e descanso.
export type LogRow = {
  weight: string
  reps: string
  rir: string
  rest?: string
  failure?: boolean | null
  done?: boolean
}

// Os limites são os mesmos da prescrição (1–20). Ao reduzir ou pular um
// exercício, só removemos linhas vazias ao final: registro real permanece.
export function reconcileSetRows(rows: LogRow[], prescribedSets: number): LogRow[] {
  const target = Math.max(0, Math.min(Math.trunc(prescribedSets), 20))
  const next = rows.slice()
  // Série marcada como feita conta como conteúdo mesmo sem números: quem
  // tocou nela está no meio da sessão, e apagar a marcação porque o plano
  // encolheu seria perder trabalho do usuário.
  const empty = (row: LogRow) => !row.weight.trim() && !row.reps.trim() && !row.rir.trim()
    && !(row.rest ?? '').trim() && row.failure !== true && row.done !== true
  while (next.length > target && empty(next[next.length - 1])) next.pop()
  while (next.length < target) next.push({ weight: '', reps: '', rir: '', rest: '', failure: false })
  return next
}

export function updateLogRow(row: LogRow, field: keyof LogRow, value: string | boolean): LogRow {
  if (field === 'failure') {
    const failure = value === true
    return { ...row, failure, ...(failure ? { rir: '0' } : {}) }
  }
  if (field === 'done') return { ...row, done: value === true }
  return typeof value === 'string' ? { ...row, [field]: value } : row
}

// Série que vai virar registro: tem carga ou repetição. É a mesma regra que o
// envio aplica (o resto é descartado), exposta aqui para a tela poder contar e
// avisar em vez de descartar calada.
export function isLoggedRow(row: LogRow): boolean {
  return !!row.weight.trim() || !!row.reps.trim()
}

export type SessionTally = {
  /** séries marcadas como feitas */
  done: number
  /** séries que serão registradas (têm carga ou repetição) */
  logged: number
  /** total de linhas na tela */
  total: number
  /** marcadas como feitas mas sem carga nem repetição: não serão registradas */
  doneWithoutNumbers: number
  /** soma de carga × repetições das séries que serão registradas */
  volumeKg: number
  /** exercícios com ao menos uma série que será registrada */
  exercises: number
}

// O que a sessão tem até agora. Serve para o progresso durante o treino e para
// o resumo da conclusão — os dois liam o mesmo estado e contavam por conta
// própria em cada tela.
export function tallySession(rows: Record<string, LogRow[]>): SessionTally {
  const tally: SessionTally = {
    done: 0, logged: 0, total: 0, doneWithoutNumbers: 0, volumeKg: 0, exercises: 0,
  }
  for (const linhas of Object.values(rows)) {
    let contou = false
    for (const row of linhas) {
      tally.total += 1
      const registra = isLoggedRow(row)
      if (row.done === true) tally.done += 1
      if (row.done === true && !registra) tally.doneWithoutNumbers += 1
      if (!registra) continue
      tally.logged += 1
      if (!contou) {
        tally.exercises += 1
        contou = true
      }
      const carga = Number(row.weight)
      const reps = Number(row.reps)
      if (Number.isFinite(carga) && Number.isFinite(reps) && carga > 0 && reps > 0) {
        tally.volumeKg += carga * reps
      }
    }
  }
  // numeric(6,2) no banco; aqui a soma é só para leitura, e o arredondamento
  // evita 0.30000000000000004 aparecendo no resumo.
  tally.volumeKg = Math.round(tally.volumeKg * 100) / 100
  return tally
}

export function validateLogRows(rows: Record<string, LogRow[]>): string | null {
  const restError = validateRestRows(rows)
  if (restError) return restError
  for (const row of Object.values(rows).flat()) {
    if (row.failure !== true) continue
    if (!row.weight.trim() && !row.reps.trim()) {
      return 'Preencha a carga ou as repetições da série em que marcou falha.'
    }
    if (!row.rir.trim() || Number(row.rir) !== 0) {
      return 'Uma série marcada com falha deve ter RIR 0.'
    }
  }
  return null
}

export function validateRestRows(rows: Record<string, LogRow[]>): string | null {
  for (const row of Object.values(rows).flat()) {
    const rest = row.rest?.trim() ?? ''
    if (!rest) continue
    const seconds = Number(rest)
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) {
      return 'Informe o descanso em segundos inteiros, de 0 a 3600, ou deixe em branco.'
    }
    if (!row.weight.trim() && !row.reps.trim()) {
      return 'Preencha a carga ou as repetições da série em que registrou descanso.'
    }
  }
  return null
}

export function ensureLogRows(
  previous: Record<string, LogRow[]>,
  exercises: { id: string; sets: number }[]
): Record<string, LogRow[]> {
  const next = { ...previous }
  for (const exercise of exercises) {
    if (!next[exercise.id]) {
      next[exercise.id] = Array.from(
        { length: Math.min(exercise.sets, 20) },
        () => ({ weight: '', reps: '', rir: '', rest: '', failure: false })
      )
    }
  }
  return next
}
