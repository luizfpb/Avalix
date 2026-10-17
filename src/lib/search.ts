// Busca por texto tolerante a acento e caixa: "elevacao" acha "Elevação",
// "SUPINO" acha "supino". Cada palavra digitada precisa aparecer no texto,
// em qualquer ordem ("supino halter" acha "Supino reto com halteres").
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function searchTerms(query: string): string[] {
  return foldText(query).split(/\s+/).filter((t) => t.length > 0)
}

export function matchesSearch(text: string, terms: readonly string[]): boolean {
  if (terms.length === 0) return true
  const folded = foldText(text)
  return terms.every((t) => folded.includes(t))
}
