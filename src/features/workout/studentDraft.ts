import type { StudentDay, StudentExercise } from './studentApi'
import type { DraftSession, DraftRow } from './studentStore'

// Reconciliação do rascunho do aluno com a prescrição vigente.
//
// O PROBLEMA. `replace_workout_plan_children` apaga e recria as divisões e os
// exercícios do plano a cada gravação: os ids FILHOS mudam mesmo quando o
// exercício do catálogo é exatamente o mesmo. O rascunho da sessão em
// andamento aponta para esses ids (`dayId` e as chaves de `rows`), então bastava
// o treinador salvar um ajuste enquanto o aluno treinava para o aparelho
// reconectar, receber ids novos e descartar o rascunho inteiro — as cargas já
// marcadas sumiam da tela.
//
// A CORREÇÃO. O rascunho passa a guardar, junto dos ids, a identidade ESTÁVEL
// do que ele descreve: o rótulo da divisão (A, B, C...) e, para cada linha, o
// exercício do CATÁLOGO. Catálogo é o que não muda quando o plano é regravado —
// é a mesma chave que a 0009 escolheu para `workout_log_sets.exercise_id`, pelo
// mesmo motivo. Com isso o rascunho é remapeado para a estrutura nova em vez de
// jogado fora.
//
// O que NÃO é feito de propósito: adivinhar. Exercício que saiu do plano não é
// aproximado por outro parecido — a linha é descartada e a tela avisa quantas
// foram, porque um registro atribuído ao movimento errado é pior do que um
// registro perdido.

export type PlanoVigente = {
  days: StudentDay[]
  exercises: StudentExercise[]
}

export type RascunhoReconciliado = {
  draft: DraftSession
  /** os ids do rascunho precisaram ser remapeados (o plano foi regravado) */
  remapeado: boolean
  /** linhas preenchidas que não puderam ser reatribuídas (exercício saiu do plano) */
  perdidas: number
}

function temConteudo(rows: DraftRow[] | undefined): boolean {
  return (rows ?? []).some((r) => r.weight.trim() || r.reps.trim() || r.rir.trim())
}

function preenchidas(rows: DraftRow[] | undefined): number {
  return (rows ?? []).filter((r) => r.weight.trim() || r.reps.trim() || r.rir.trim()).length
}

/**
 * Identidade estável da sessão, gravada junto do rascunho. Opcional no tipo:
 * rascunho gravado por uma versão anterior do app não a tem, e nesse caso a
 * reconciliação só consegue confirmar o que ainda existe por id.
 */
export function identidadeDaSessao(
  dias: StudentDay[],
  dayId: string | null,
  linhas: Record<string, DraftRow[]>,
  exercicios: StudentExercise[]
): DraftSession['identity'] {
  const porId = new Map(exercicios.map((e) => [e.id, e]))
  const rowExercises: Record<string, string> = {}
  for (const key of Object.keys(linhas)) {
    const ex = porId.get(key)
    if (ex) rowExercises[key] = ex.exercise_id
  }
  return {
    dayLabel: dias.find((d) => d.id === dayId)?.label ?? null,
    rowExercises,
  }
}

/**
 * Devolve o rascunho já apontando para os ids do plano vigente, ou `null`
 * quando a divisão que ele descreve não existe mais de forma alguma.
 */
export function reconciliarRascunho(
  draft: DraftSession,
  plano: PlanoVigente
): RascunhoReconciliado | null {
  const diaPorId = new Map(plano.days.map((d) => [d.id, d]))
  const identity = draft.identity

  // 1. a divisão: por id enquanto ele existir; senão pelo rótulo, que é o que
  //    o aluno enxerga e o que o treinador preserva ao reeditar o plano.
  let dayId = draft.dayId
  if (dayId && !diaPorId.has(dayId)) {
    const porRotulo = identity?.dayLabel
      ? plano.days.find((d) => d.label === identity.dayLabel)
      : undefined
    if (!porRotulo) return null
    dayId = porRotulo.id
  }

  // 2. as linhas. Cada chave antiga vira a linha do MESMO exercício do catálogo
  //    na estrutura nova — preferindo a divisão da sessão, e aceitando outra
  //    divisão (o exercício vira um avulso, que é exatamente o que ele passou a
  //    ser na prescrição nova).
  const noDia = new Map<string, StudentExercise>()
  const noPlano = new Map<string, StudentExercise>()
  for (const ex of plano.exercises) {
    if (ex.day_id === dayId && !noDia.has(ex.exercise_id)) noDia.set(ex.exercise_id, ex)
    if (!noPlano.has(ex.exercise_id)) noPlano.set(ex.exercise_id, ex)
  }
  const existePorId = new Set(plano.exercises.map((e) => e.id))

  const rows: Record<string, DraftRow[]> = {}
  const destinoDe = new Map<string, string>()
  let perdidas = 0
  let remapeado = draft.dayId !== dayId

  for (const [chave, linhas] of Object.entries(draft.rows ?? {})) {
    const catalogo = identity?.rowExercises?.[chave]
    const alvo = catalogo
      ? (noDia.get(catalogo) ?? noPlano.get(catalogo))
      : existePorId.has(chave)
        ? plano.exercises.find((e) => e.id === chave)
        : undefined
    if (!alvo) {
      perdidas += preenchidas(linhas)
      continue
    }
    if (alvo.id !== chave) remapeado = true
    // duas chaves antigas apontando para a mesma linha nova: fica a que tem
    // mais registro, para o remapeamento nunca custar dado ao aluno
    const anterior = rows[alvo.id]
    rows[alvo.id] =
      anterior && preenchidas(anterior) >= preenchidas(linhas) ? anterior : linhas
    destinoDe.set(chave, alvo.id)
  }

  // 3. os avulsos: os que continuam fora da divisão da sessão, mais os que
  //    passaram a estar fora dela por causa da edição do plano.
  const extras = new Set<string>()
  for (const antigo of draft.extras ?? []) {
    const novo = destinoDe.get(antigo)
    if (novo) extras.add(novo)
  }
  for (const [antigo, novo] of destinoDe) {
    const ex = plano.exercises.find((e) => e.id === novo)
    if (!ex || ex.day_id === dayId) continue
    // linha que sobreviveu mas ficou fora da divisão: só vale manter se o aluno
    // registrou alguma coisa nela
    if (temConteudo(rows[novo]) || (draft.extras ?? []).includes(antigo)) extras.add(novo)
  }

  return {
    draft: { ...draft, dayId, rows, extras: [...extras] },
    remapeado,
    perdidas,
  }
}
