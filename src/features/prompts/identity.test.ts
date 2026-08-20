import { describe, it, expect } from 'vitest'
import { abbreviateName, ageAt, localDate, sexLabel } from './identity'

describe('abbreviateName', () => {
  it('mantém o primeiro nome inteiro e abrevia o resto', () => {
    expect(abbreviateName('Luiz Felipe Brum Boy')).toBe('Luiz F. B. B.')
    expect(abbreviateName('Maria Souza')).toBe('Maria S.')
  })

  it('ignora partículas para não gerar "d."', () => {
    expect(abbreviateName('Ana da Silva')).toBe('Ana S.')
    expect(abbreviateName('Pedro dos Santos Lima')).toBe('Pedro S. L.')
  })

  it('lida com nome único, espaços extras e vazio', () => {
    expect(abbreviateName('Madonna')).toBe('Madonna')
    expect(abbreviateName('  João   Pedro  ')).toBe('João P.')
    expect(abbreviateName('   ')).toBe('Avaliado')
    expect(abbreviateName(null)).toBe('Avaliado')
  })

  it('maiúscula na inicial mesmo com o nome digitado em caixa baixa', () => {
    expect(abbreviateName('joão pedro almeida')).toBe('joão P. A.')
  })
})

describe('localDate', () => {
  it('não desloca o dia por fuso', () => {
    const d = localDate('2026-08-20')
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(7)
    expect(d?.getDate()).toBe(20)
  })

  it('rejeita data inválida', () => {
    expect(localDate('2026-02-30')).toBeNull()
    expect(localDate('')).toBeNull()
  })
})

describe('ageAt', () => {
  it('usa a data de referência, não hoje', () => {
    expect(ageAt('1990-05-10', '2020-05-10')).toBe(30)
    expect(ageAt('1990-05-10', '2020-05-09')).toBe(29)
  })

  it('sem data de nascimento devolve null', () => {
    expect(ageAt(null, '2026-01-01')).toBeNull()
  })
})

describe('sexLabel', () => {
  it('traduz e não inventa', () => {
    expect(sexLabel('M')).toBe('masculino')
    expect(sexLabel('F')).toBe('feminino')
    expect(sexLabel(null)).toBe('não informado')
  })
})
