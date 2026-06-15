import { describe, it, expect } from 'vitest'
import { subjectFormSchema, emptySubjectForm } from './schema'

// datas relativas ao "agora" pra o teste não envelhecer
const now = new Date()
const minorBirth = `${now.getFullYear() - 10}-01-01`
const adultBirth = `${now.getFullYear() - 30}-01-01`

function form(over: Partial<ReturnType<typeof emptySubjectForm>>) {
  return { ...emptySubjectForm(), full_name: 'Fulano', sex: 'M', ...over }
}

describe('subjectFormSchema', () => {
  it('exige sexo válido', () => {
    expect(subjectFormSchema.safeParse(form({ birth_date: adultBirth, sex: '' })).success).toBe(
      false
    )
  })

  it('menor de 18 sem responsável é inválido', () => {
    const r = subjectFormSchema.safeParse(form({ birth_date: minorBirth }))
    expect(r.success).toBe(false)
  })

  it('menor de 18 com responsável é válido', () => {
    const r = subjectFormSchema.safeParse(
      form({ birth_date: minorBirth, guardian_name: 'Mãe', guardian_relationship: 'mãe' })
    )
    expect(r.success).toBe(true)
  })

  it('adulto sem responsável é válido', () => {
    const r = subjectFormSchema.safeParse(form({ birth_date: adultBirth }))
    expect(r.success).toBe(true)
  })

  it('rejeita altura fora da faixa e e-mail inválido', () => {
    expect(subjectFormSchema.safeParse(form({ birth_date: adultBirth, height_cm: '300' })).success).toBe(
      false
    )
    expect(subjectFormSchema.safeParse(form({ birth_date: adultBirth, email: 'xyz' })).success).toBe(
      false
    )
  })
})
