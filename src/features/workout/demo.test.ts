import { describe, it, expect } from 'vitest'
import { exerciseDemoQuery, exerciseDemoUrl } from './demo'

describe('demonstração de exercício', () => {
  it('monta a busca em pt-BR focada em execução', () => {
    expect(exerciseDemoQuery('Agachamento livre')).toBe('Agachamento livre execução do exercício')
  })

  it('apara espaços do nome', () => {
    expect(exerciseDemoQuery('  Supino reto  ')).toBe('Supino reto execução do exercício')
  })

  it('gera URL de busca do YouTube com a query codificada', () => {
    const url = exerciseDemoUrl('Agachamento sumô')
    expect(url.startsWith('https://www.youtube.com/results?search_query=')).toBe(true)
    // acentos e espaços codificados
    expect(url).toContain(encodeURIComponent('Agachamento sumô execução do exercício'))
    expect(url).not.toContain(' ')
  })
})
