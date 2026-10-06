import { describe, expect, it } from 'vitest'
import { roleLabel } from './roles'

describe('roleLabel', () => {
  it('traduz os papéis do banco', () => {
    expect(roleLabel('owner')).toBe('Proprietário')
    expect(roleLabel('admin')).toBe('Administrador')
    expect(roleLabel('evaluator')).toBe('Profissional')
  })

  it('papel ausente ou desconhecido não aparece em inglês', () => {
    expect(roleLabel(null)).toBe('Profissional')
    expect(roleLabel('superuser')).toBe('Profissional')
  })
})
