// Ordem e remoções da sessão que o profissional conduz na Execução.
//
// O plano diz uma ordem, a academia impõe outra: aparelho ocupado, o avulso
// que entrou no lugar de um prescrito e precisa ficar no meio, o exercício que
// hoje não vai ser feito. Nada disso muda o PLANO — é a ordem e o conteúdo
// desta sessão só. O registro (workout_log_sets) não guarda ordem, então ela
// vive no estado da tela e no rascunho do aparelho.

// Aplica a ordem escolhida e tira os exercícios removidos da sessão. Linha que
// não está em `order` (o avulso adicionado depois de reordenar, ou tudo quando
// ninguém mexeu) vai para o fim, na ordem natural: plano e, depois, avulsos.
export function orderSessionRows<T extends { rowId: string }>(
  rows: T[],
  order: readonly string[],
  skipped: readonly string[] = []
): T[] {
  const fora = new Set(skipped)
  const posicao = new Map(order.map((rowId, i) => [rowId, i]))
  const visiveis = rows.filter((row) => !fora.has(row.rowId))
  const ordenadas = visiveis
    .filter((row) => posicao.has(row.rowId))
    .sort((a, b) => posicao.get(a.rowId)! - posicao.get(b.rowId)!)
  return [...ordenadas, ...visiveis.filter((row) => !posicao.has(row.rowId))]
}

// Leva o item de `from` para a posição `to`, empurrando os do meio.
export function moveRow<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return list.slice()
  }
  const out = list.slice()
  const [item] = out.splice(from, 1)
  out.splice(to, 0, item)
  return out
}
