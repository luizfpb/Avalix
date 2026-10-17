import { foldText, matchesSearch, searchTerms } from '@/lib/search'

// Busca no catálogo de exercícios: nome e apelidos (0047), sem acento e sem
// ordem de palavras. "pulley" acha a puxada pelo apelido, e a tela mostra o
// apelido que bateu para ninguém estranhar um resultado com outro nome.
//
// Ordem dos resultados: primeiro quem tem o nome começando pelo que foi
// digitado, depois quem tem tudo no nome, depois quem só bate pelo apelido.
// Dentro de cada faixa vale a ordem de chegada (grupo muscular e nome).

export type SearchableExercise = { name: string; aliases?: string[] | null }
export type ExerciseHit<T> = { exercise: T; alias: string | null }

export function searchExercises<T extends SearchableExercise>(list: readonly T[], query: string): ExerciseHit<T>[] {
  const terms = searchTerms(query)
  if (terms.length === 0) return list.map((exercise) => ({ exercise, alias: null }))
  const ranked: { hit: ExerciseHit<T>; rank: number; index: number }[] = []
  list.forEach((exercise, index) => {
    const found = rankExercise(exercise, terms)
    if (found) ranked.push({ hit: { exercise, alias: found.alias }, rank: found.rank, index })
  })
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index)
  return ranked.map((r) => r.hit)
}

function rankExercise(e: SearchableExercise, terms: string[]): { rank: number; alias: string | null } | null {
  if (matchesSearch(e.name, terms)) {
    return { rank: foldText(e.name).startsWith(terms[0]) ? 0 : 1, alias: null }
  }
  const aliases = e.aliases ?? []
  const whole = aliases.find((a) => matchesSearch(a, terms))
  if (whole) return { rank: 2, alias: whole }
  // palavras divididas entre o nome e um apelido ("voador maquina")
  if (matchesSearch([e.name, ...aliases].join(' '), terms)) {
    const partial = aliases.find((a) => terms.some((t) => foldText(a).includes(t))) ?? null
    return { rank: 3, alias: partial }
  }
  return null
}
