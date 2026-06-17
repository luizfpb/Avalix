import { describe, it, expect } from 'vitest'
import { initials } from './initials'

describe('initials', () => {
  it('usa primeiro e último nome', () => {
    expect(initials('Maria Souza')).toBe('MS')
    expect(initials('joão pedro almeida')).toBe('JA')
  })

  it('ignora partículas', () => {
    expect(initials('Ana da Silva')).toBe('AS')
    expect(initials('Pedro dos Santos')).toBe('PS')
  })

  it('lida com nome único e vazio', () => {
    expect(initials('Madonna')).toBe('M')
    expect(initials('   ')).toBe('?')
  })
})
