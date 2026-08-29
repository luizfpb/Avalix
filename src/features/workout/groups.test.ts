import { describe, it, expect } from 'vitest'
import {
  circuitSetsMismatch,
  groupLabel,
  groupWithPrevious,
  normalizeGroups,
  setGroupKind,
  techniqueLabel,
  toBlocks,
  ungroupAt,
  type GroupKind,
} from './groups'

type Item = { id: string; groupKey: string | null; groupKind: GroupKind | null }

function items(spec: string): Item[] {
  // "a b:g1 c:g1" => c/b agrupados em g1, a solto
  return spec.split(' ').map((token) => {
    const [id, key] = token.split(':')
    return { id, groupKey: key ?? null, groupKind: key ? ('superset' as GroupKind) : null }
  })
}

function shape(list: Item[]): string {
  return list.map((i) => (i.groupKey ? `${i.id}:${i.groupKey}` : i.id)).join(' ')
}

describe('normalizeGroups', () => {
  it('desfaz grupo de um item só — grupo de um não existe', () => {
    expect(shape(normalizeGroups(items('a:g1 b c')))).toBe('a b c')
  })

  it('mantém a lista intacta (mesma referência) quando já está válida', () => {
    const list = items('a b:g1 c:g1')
    expect(normalizeGroups(list)).toBe(list)
  })

  it('absorve o exercício solto largado no meio do grupo', () => {
    // é o que faz arrastar para dentro da super-série funcionar: sem isso o
    // gesto destruiria justamente o bloco em que se soltou
    expect(shape(normalizeGroups(items('a:g1 x b:g1')))).toBe('a:g1 x:g1 b:g1')
  })

  it('não absorve item solto entre grupos diferentes', () => {
    const out = normalizeGroups(items('a:g1 b:g1 x c:g2 d:g2'))
    expect(shape(out)).toBe('a:g1 b:g1 x c:g2 d:g2')
  })

  it('quebra o grupo furado por outro grupo no meio', () => {
    // a e c ficariam com um membro cada e são dissolvidos
    const out = normalizeGroups(items('a:g1 b:g2 c:g1'))
    expect(shape(out)).toBe('a b c')
  })

  it('dá chave própria à segunda metade quando as duas continuam válidas', () => {
    const out = normalizeGroups(items('a:g1 b:g1 x:g2 y:g2 c:g1 d:g1'))
    const keys = out.map((i) => i.groupKey)
    expect(keys[0]).toBe(keys[1])
    expect(keys[4]).toBe(keys[5])
    expect(keys[0]).not.toBe(keys[4])
  })

  it('uniformiza o tipo do trecho pelo primeiro membro', () => {
    const list = items('a:g1 b:g1')
    list[0].groupKind = 'circuit'
    const out = normalizeGroups(list)
    expect(out.map((i) => i.groupKind)).toEqual(['circuit', 'circuit'])
  })

  it('limpa o tipo órfão de quem não está em grupo', () => {
    const list: Item[] = [{ id: 'a', groupKey: null, groupKind: 'circuit' }]
    expect(normalizeGroups(list)[0].groupKind).toBeNull()
  })
})

describe('toBlocks', () => {
  it('junta a sequência e mantém o índice de origem para a numeração', () => {
    const blocks = toBlocks(items('a b:g1 c:g1 d'))
    expect(blocks.map((b) => b.items.length)).toEqual([1, 2, 1])
    expect(blocks.map((b) => b.start)).toEqual([0, 1, 3])
    expect(blocks[1].kind).toBe('superset')
    expect(blocks[0].kind).toBeNull()
  })
})

describe('groupWithPrevious', () => {
  it('cria uma super-série com o exercício anterior', () => {
    const out = groupWithPrevious(items('a b c'), 1, () => 'novo')
    expect(shape(out)).toBe('a:novo b:novo c')
    expect(out[0].groupKind).toBe('superset')
  })

  it('entra no grupo existente preservando o tipo dele', () => {
    const list = items('a:g1 b:g1 c')
    list[0].groupKind = 'circuit'
    list[1].groupKind = 'circuit'
    const out = groupWithPrevious(list, 2, () => 'novo')
    expect(shape(out)).toBe('a:g1 b:g1 c:g1')
    expect(out[2].groupKind).toBe('circuit')
  })

  it('ignora o primeiro exercício da divisão — não há anterior', () => {
    const list = items('a b')
    expect(groupWithPrevious(list, 0, () => 'novo')).toBe(list)
  })
})

describe('ungroupAt', () => {
  it('tirar o do meio desfaz o bloco inteiro', () => {
    expect(shape(ungroupAt(items('a:g1 b:g1 c:g1'), 1))).toBe('a b c')
  })

  it('tirar da ponta deixa o resto agrupado quando ainda sobram dois', () => {
    expect(shape(ungroupAt(items('a:g1 b:g1 c:g1'), 2))).toBe('a:g1 b:g1 c')
  })

  it('tirar de um par dissolve os dois', () => {
    expect(shape(ungroupAt(items('a:g1 b:g1'), 0))).toBe('a b')
  })

  it('parte o bloco grande em dois em vez de perder o trabalho todo', () => {
    const out = ungroupAt(items('a:g1 b:g1 c:g1 d:g1 e:g1'), 2)
    const keys = out.map((i) => i.groupKey)
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).toBeNull()
    expect(keys[3]).toBe(keys[4])
    expect(keys[0]).not.toBe(keys[3])
  })
})

describe('setGroupKind', () => {
  it('troca o tipo de todo o bloco de uma vez', () => {
    const out = setGroupKind(items('a:g1 b:g1 c'), 'g1', 'circuit')
    expect(out.map((i) => i.groupKind)).toEqual(['circuit', 'circuit', null])
  })
})

describe('rótulos', () => {
  it('nomeia a super-série pelo tamanho do grupo', () => {
    expect(groupLabel('superset', 2)).toBe('Super-série')
    expect(groupLabel('superset', 3)).toBe('Tri-set')
    expect(groupLabel('superset', 5)).toBe('Série gigante')
    expect(groupLabel('circuit', 4)).toBe('Circuito')
  })

  it('ignora técnica desconhecida em vez de imprimir o valor cru', () => {
    expect(techniqueLabel('drop_set')).toBe('Drop-set')
    expect(techniqueLabel('trapaca')).toBeNull()
    expect(techniqueLabel(null)).toBeNull()
  })
})

describe('circuitSetsMismatch', () => {
  it('acusa voltas divergentes entre os membros do circuito', () => {
    expect(circuitSetsMismatch([{ sets: 3 }, { sets: 3 }])).toBe(false)
    expect(circuitSetsMismatch([{ sets: 3 }, { sets: 4 }])).toBe(true)
  })
})
