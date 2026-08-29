// Agrupamento de exercícios dentro de uma divisão: super-série (bi-set,
// tri-set, série gigante) e circuito, mais as técnicas de intensidade que
// acontecem dentro de UM exercício (drop-set, rest-pause, cluster, myo-reps).
//
// Puro e sem React de propósito: as mesmas regras valem no builder, no detalhe
// do plano, no PDF, no texto de WhatsApp, na execução e no app do aluno. O
// projeto já pagou o preço de ter a mesma regra reescrita por superfície (a
// contagem de sessões por semana estava em três arquivos, e o WhatsApp
// contradizia o PDF do mesmo plano) — agrupamento nasce com um dono só.
//
// INVARIANTE, o mesmo que a RPC de gravação confere no banco (migration
// 0030): um grupo é um trecho CONTÍGUO de dois ou mais exercícios da mesma
// divisão, todos do mesmo tipo. Grupo furado (A, B, A) não tem execução
// possível — não existe "sem descanso entre eles" com outro exercício no meio.
// `normalizeGroups` é o que garante isso depois de qualquer edição, e é a
// última coisa que roda antes de gravar.

export const GROUP_KINDS = ['superset', 'circuit'] as const
export type GroupKind = (typeof GROUP_KINDS)[number]

export const TECHNIQUES = ['drop_set', 'rest_pause', 'cluster', 'myo_reps'] as const
export type Technique = (typeof TECHNIQUES)[number]

export const TECHNIQUE_LABELS: Record<Technique, string> = {
  drop_set: 'Drop-set',
  rest_pause: 'Rest-pause',
  cluster: 'Cluster',
  myo_reps: 'Myo-reps',
}

// O detalhe da técnica ("3 quedas de 20%") continua nas observações do
// exercício: aqui só o nome, que é o que muda a execução da série.
export const TECHNIQUE_OPTIONS = TECHNIQUES.map((t) => ({ value: t, label: TECHNIQUE_LABELS[t] }))

export function isGroupKind(v: unknown): v is GroupKind {
  return typeof v === 'string' && (GROUP_KINDS as readonly string[]).includes(v)
}

export function isTechnique(v: unknown): v is Technique {
  return typeof v === 'string' && (TECHNIQUES as readonly string[]).includes(v)
}

export function techniqueLabel(t: string | null | undefined): string | null {
  return isTechnique(t) ? TECHNIQUE_LABELS[t] : null
}

// Bi-set, tri-set e série gigante são o MESMO mecanismo com 2, 3 e 4+
// exercícios — por isso o nome sai do tamanho do grupo e não de um valor
// gravado. Mover um exercício para dentro do grupo não pode deixar um "bi-set"
// de três exercícios registrado no banco.
export function groupLabel(kind: GroupKind, size: number): string {
  if (kind === 'circuit') return 'Circuito'
  if (size >= 4) return 'Série gigante'
  if (size === 3) return 'Tri-set'
  return 'Super-série'
}

// Como executar, em uma linha. Vai no cabeçalho do bloco em toda superfície —
// o aluno não deveria precisar saber o jargão para fazer certo.
export function groupHint(kind: GroupKind, size: number): string {
  if (kind === 'circuit') {
    return `${size} exercícios em sequência; o descanso fica só no fim de cada volta`
  }
  return `${size} exercícios em sequência, sem descanso entre eles`
}

export type Groupable = {
  groupKey: string | null
  groupKind: GroupKind | null
}

// ---- leitura: lista plana -> blocos ----------------------------------

export type Block<T> = {
  // null nas duas pontas = exercício solto (bloco de um item só)
  key: string | null
  kind: GroupKind | null
  items: T[]
  // índice do primeiro item do bloco na lista plana, para a numeração seguir
  // contínua (1, 2, 3...) mesmo com blocos no meio
  start: number
}

// Corre a lista uma vez e junta as sequências de mesma chave. Assume a lista já
// normalizada; se não estiver, ainda assim não inventa grupo — só corta na
// primeira quebra de contiguidade.
function blocksBy<T>(
  list: T[],
  read: (item: T) => { key: string | null; kind: GroupKind | null }
): Block<T>[] {
  const blocks: Block<T>[] = []
  for (let i = 0; i < list.length; i++) {
    const { key, kind } = read(list[i])
    const previous = blocks[blocks.length - 1]
    if (key != null && previous && previous.key === key) {
      previous.items.push(list[i])
      continue
    }
    blocks.push({ key, kind: key != null ? kind : null, items: [list[i]], start: i })
  }
  return blocks
}

export function toBlocks<T extends Groupable>(list: T[]): Block<T>[] {
  return blocksBy(list, (item) => ({ key: item.groupKey, kind: item.groupKind }))
}

// Mesma leitura direto das linhas do banco (snake_case) e do pacote do aluno,
// sem passar pelo editor. Campo ausente — plano gravado antes da 0030, ou
// pacote em cache no aparelho do aluno — lê como exercício solto.
export type GroupableRow = { group_key?: string | null; group_kind?: string | null }

export function toRowBlocks<T extends GroupableRow>(rows: T[]): Block<T>[] {
  return blocksBy(rows, (row) => ({
    key: row.group_key ?? null,
    kind: isGroupKind(row.group_kind) ? row.group_kind : null,
  }))
}

// ---- escrita: normalização -------------------------------------------

// Repara a lista depois de qualquer edição (reordenar, remover, desagrupar),
// em duas passadas:
//
// 1. ABSORVER. Item solto espremido entre dois membros do MESMO grupo entra no
//    grupo. É o que faz arrastar um exercício para dentro de uma super-série
//    funcionar; sem essa regra, soltar no meio do bloco destruiria o bloco, que
//    é o oposto do que o gesto pede.
// 2. FECHAR. Cada sequência contígua vira um grupo de verdade: sequência de um
//    item só é desfeita (grupo de um não existe) e o tipo do trecho passa a ser
//    o do primeiro membro, para um trecho nunca ficar meio super-série meio
//    circuito.
//
// Devolve os MESMOS objetos quando nada muda: o React não re-renderiza linha
// que não mexeu, e o teste de igualdade fica óbvio.
export function normalizeGroups<T extends Groupable>(list: T[]): T[] {
  const draft: { key: string | null; kind: GroupKind | null }[] = list.map((item) => ({
    key: item.groupKey,
    kind: item.groupKey != null ? item.groupKind : null,
  }))

  // 1. absorver os soltos cercados pelo mesmo grupo
  let i = 0
  while (i < draft.length) {
    if (draft[i].key != null) {
      i++
      continue
    }
    let end = i
    while (end < draft.length && draft[end].key == null) end++
    const before = i > 0 ? draft[i - 1] : null
    const after = end < draft.length ? draft[end] : null
    if (before && after && before.key != null && before.key === after.key) {
      for (let j = i; j < end; j++) {
        draft[j] = { key: before.key, kind: before.kind }
      }
    }
    i = end
  }

  // 2. fechar cada trecho contíguo
  const used = new Set<string>()
  i = 0
  while (i < draft.length) {
    const key = draft[i].key
    if (key == null) {
      i++
      continue
    }
    let end = i
    while (end < draft.length && draft[end].key === key) end++
    const size = end - i
    if (size < 2) {
      draft[i] = { key: null, kind: null }
    } else {
      // trecho repetido depois de uma quebra ganha chave própria: duas metades
      // com a mesma etiqueta seriam um grupo furado para o banco. A base é
      // truncada porque a coluna tem 40 caracteres e derivar sem limite faria
      // a chave crescer a cada quebra.
      const finalKey = used.has(key) ? splitKey(key, i) : key
      used.add(finalKey)
      const kind = draft[i].kind ?? 'superset'
      for (let j = i; j < end; j++) draft[j] = { key: finalKey, kind }
    }
    i = end
  }

  let changed = false
  const out = list.map((item, idx) => {
    const { key, kind } = draft[idx]
    if (item.groupKey === key && item.groupKind === kind) return item
    changed = true
    return { ...item, groupKey: key, groupKind: kind }
  })
  return changed ? out : list
}

// ---- escrita: ações do editor ----------------------------------------

// Junta o exercício de `index` com o anterior. Entrar num grupo que já existe
// preserva o tipo dele; par novo nasce super-série, que é o agrupamento de
// longe mais comum — trocar para circuito é um clique no cabeçalho do bloco.
export function groupWithPrevious<T extends Groupable>(
  list: T[],
  index: number,
  newKey: () => string
): T[] {
  if (index <= 0 || index >= list.length) return list
  const previous = list[index - 1]
  const key = previous.groupKey ?? newKey()
  const kind: GroupKind = previous.groupKey != null ? (previous.groupKind ?? 'superset') : 'superset'
  const out = list.map((item, i) => {
    if (i !== index && i !== index - 1) return item
    if (item.groupKey === key && item.groupKind === kind) return item
    return { ...item, groupKey: key, groupKind: kind }
  })
  return normalizeGroups(out)
}

// Chave derivada de outra, com tamanho limitado: a coluna aceita 40 caracteres
// e derivar sem truncar faria a chave crescer a cada quebra do bloco.
function splitKey(base: string, index: number): string {
  return `${base.slice(0, 30)}#${index}`
}

// Tira UM exercício do bloco, PARTINDO o bloco nele: o que vem depois ganha
// chave própria. Sem isso a regra de absorção desfaria a ação no ato — o item
// continua fisicamente cercado pelos ex-colegas de grupo, e o botão pareceria
// quebrado. Cada metade que sobrar com um item só é dissolvida pela
// normalização, então tirar o do meio de um tri-set desfaz o tri-set inteiro,
// que é o certo: "A e C sem descanso entre eles, com B no meio" não existe.
export function ungroupAt<T extends Groupable>(list: T[], index: number): T[] {
  if (index < 0 || index >= list.length) return list
  const key = list[index].groupKey
  if (key == null) return list
  const suffix = splitKey(key, index)
  const out = list.map((item, i) => {
    if (i === index) return { ...item, groupKey: null, groupKind: null }
    if (i > index && item.groupKey === key) return { ...item, groupKey: suffix }
    return item
  })
  return normalizeGroups(out)
}

export function setGroupKind<T extends Groupable>(list: T[], key: string, kind: GroupKind): T[] {
  const out = list.map((item) =>
    item.groupKey === key && item.groupKind !== kind ? { ...item, groupKind: kind } : item
  )
  return normalizeGroups(out)
}

// Num circuito, o `sets` de cada exercício É o número de voltas — não existe
// coluna de voltas justamente para não haver duas fontes para a mesma
// contagem. Membros com séries diferentes são o único caso de verdade
// ambíguo, e a tela avisa em vez de escolher no lugar do profissional.
export function circuitSetsMismatch(items: { sets: number }[]): boolean {
  return new Set(items.map((it) => it.sets)).size > 1
}
