import { describe, it, expect } from 'vitest'
import { foldText, matchesSearch, searchTerms } from './search'

describe('busca sem acento', () => {
  it('ignora acento e caixa', () => {
    expect(foldText('Elevação Pélvica')).toBe('elevacao pelvica')
    expect(matchesSearch('Elevação pélvica', searchTerms('elevacao'))).toBe(true)
    expect(matchesSearch('Tríceps testa', searchTerms('TRICEPS'))).toBe(true)
  })

  it('também acha quando quem digita põe acento e o nome não tem', () => {
    expect(matchesSearch('Abdominal maquina', searchTerms('máquina'))).toBe(true)
  })

  it('exige todas as palavras, em qualquer ordem', () => {
    expect(matchesSearch('Supino reto com halteres', searchTerms('halter supino'))).toBe(true)
    expect(matchesSearch('Supino reto com halteres', searchTerms('supino barra'))).toBe(false)
  })

  it('busca vazia aceita tudo', () => {
    expect(searchTerms('   ')).toEqual([])
    expect(matchesSearch('Remada curvada', searchTerms(''))).toBe(true)
  })
})
