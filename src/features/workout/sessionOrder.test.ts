import { describe, expect, it } from 'vitest'
import { moveRow, orderSessionRows } from './sessionOrder'

const linhas = ['we-1', 'we-2', 'we-3', 'extra:a'].map((rowId) => ({ rowId }))
const ids = (rows: { rowId: string }[]) => rows.map((r) => r.rowId)

describe('orderSessionRows', () => {
  it('sem ordem escolhida, segue a do plano com os avulsos no fim', () => {
    expect(ids(orderSessionRows(linhas, []))).toEqual(['we-1', 'we-2', 'we-3', 'extra:a'])
  })

  it('aplica a ordem escolhida e manda para o fim o que entrou depois dela', () => {
    const comNovo = [...linhas, { rowId: 'extra:b' }]
    expect(ids(orderSessionRows(comNovo, ['extra:a', 'we-3', 'we-1', 'we-2'])))
      .toEqual(['extra:a', 'we-3', 'we-1', 'we-2', 'extra:b'])
  })

  it('tira os exercícios removidos da sessão e ignora ids que não existem mais', () => {
    expect(ids(orderSessionRows(linhas, ['sumiu', 'we-2', 'we-1'], ['we-1'])))
      .toEqual(['we-2', 'we-3', 'extra:a'])
  })
})

describe('moveRow', () => {
  it('leva o item para a posição pedida, empurrando os do meio', () => {
    expect(moveRow(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
    expect(moveRow(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('posição fora da lista não muda nada', () => {
    expect(moveRow(['a', 'b'], 0, 2)).toEqual(['a', 'b'])
    expect(moveRow(['a', 'b'], -1, 0)).toEqual(['a', 'b'])
  })
})
