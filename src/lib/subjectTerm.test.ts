import { describe, it, expect } from 'vitest'
import { subjectTermLabels } from './subjectTerm'

describe('subjectTermLabels', () => {
  it('gera singular/plural e capitalizados pra cada termo conhecido', () => {
    expect(subjectTermLabels('aluno')).toEqual({
      singular: 'aluno',
      plural: 'alunos',
      singularCap: 'Aluno',
      pluralCap: 'Alunos',
    })
    expect(subjectTermLabels('paciente').plural).toBe('pacientes')
    expect(subjectTermLabels('atleta').pluralCap).toBe('Atletas')
  })

  it('degrada valor desconhecido pra avaliado', () => {
    expect(subjectTermLabels('xyz').singular).toBe('avaliado')
    expect(subjectTermLabels('xyz').pluralCap).toBe('Avaliados')
  })

  it('trata null/undefined como avaliado', () => {
    expect(subjectTermLabels(null).singular).toBe('avaliado')
    expect(subjectTermLabels(undefined).plural).toBe('avaliados')
  })
})
