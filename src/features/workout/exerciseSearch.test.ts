import { describe, it, expect } from 'vitest'
import { searchExercises } from './exerciseSearch'

const catalogo = [
  { name: 'Puxada frontal pronada', aliases: ['pulley', 'puxada alta'] },
  { name: 'Tríceps na polia (barra reta)', aliases: ['tríceps pulley'] },
  { name: 'Tríceps na polia (corda)', aliases: ['tríceps corda'] },
  { name: 'Rosca martelo na polia (corda)', aliases: [] },
  { name: 'Voador (peck deck)', aliases: ['Crucifixo na máquina (peck deck)'] },
  { name: 'Supino reto com barra' },
]

const nomes = (q: string) => searchExercises(catalogo, q).map((h) => h.exercise.name)

describe('busca no catálogo de exercícios', () => {
  it('busca vazia devolve tudo, na ordem original e sem apelido', () => {
    const hits = searchExercises(catalogo, '  ')
    expect(hits.map((h) => h.exercise.name)).toEqual(catalogo.map((e) => e.name))
    expect(hits.every((h) => h.alias === null)).toBe(true)
  })

  it('acha pelo nome sem acento e em qualquer ordem', () => {
    expect(nomes('triceps corda')).toEqual(['Tríceps na polia (corda)'])
  })

  it('nome que começa pelo termo vem antes de nome que só o contém', () => {
    expect(nomes('corda')).toEqual(['Tríceps na polia (corda)', 'Rosca martelo na polia (corda)'])
    expect(nomes('polia')[0]).toBe('Tríceps na polia (barra reta)')
    expect(nomes('rosca')).toEqual(['Rosca martelo na polia (corda)'])
  })

  it('acha pelo apelido e diz qual apelido bateu', () => {
    expect(searchExercises(catalogo, 'pulley').map((h) => [h.exercise.name, h.alias])).toEqual([
      ['Puxada frontal pronada', 'pulley'],
      ['Tríceps na polia (barra reta)', 'tríceps pulley'],
    ])
  })

  it('nome antigo continua achando o exercício renomeado', () => {
    expect(nomes('crucifixo maquina')).toEqual(['Voador (peck deck)'])
  })

  it('palavras divididas entre nome e apelido também acham', () => {
    const [hit] = searchExercises(catalogo, 'voador maquina')
    expect(hit.exercise.name).toBe('Voador (peck deck)')
    expect(hit.alias).toBe('Crucifixo na máquina (peck deck)')
  })

  it('apelido nunca vem antes de quem bate pelo nome', () => {
    expect(nomes('triceps')).toEqual(['Tríceps na polia (barra reta)', 'Tríceps na polia (corda)'])
  })
})
