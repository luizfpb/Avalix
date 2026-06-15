import { z } from 'zod'
import { ageFromBirthDate } from '../../lib/age'
import type { SubjectInsert, SubjectRow, SubjectUpdate } from './api'

// Formulário trabalha com strings (inputs nativos); a conversão pra tipos do
// banco acontece em formToInsert/formToUpdate. sex fica como string com refine
// pra permitir um estado inicial vazio ("Selecione").
export const subjectFormSchema = z
  .object({
    full_name: z.string().trim().min(1, 'Informe o nome').max(160, 'Máximo de 160 caracteres'),
    birth_date: z.string().min(1, 'Informe a data de nascimento'),
    sex: z.string(),
    height_cm: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    notes: z.string().optional(),
    guardian_name: z.string().optional(),
    guardian_relationship: z.string().optional(),
    is_active: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    // validado aqui (e não com .refine no campo) pra o tipo de sex continuar
    // string: o TS infere type predicate de comparações com literais e
    // estreitaria sex pra 'M'|'F', brigando com o default vazio do formulário.
    if (v.sex !== 'M' && v.sex !== 'F') {
      ctx.addIssue({ code: 'custom', path: ['sex'], message: 'Selecione o sexo' })
    }
    const age = ageFromBirthDate(v.birth_date)
    if (v.birth_date && age === null) {
      ctx.addIssue({ code: 'custom', path: ['birth_date'], message: 'Data inválida' })
    }
    if (age !== null) {
      if (age < 0) ctx.addIssue({ code: 'custom', path: ['birth_date'], message: 'Data no futuro' })
      if (age > 120)
        ctx.addIssue({ code: 'custom', path: ['birth_date'], message: 'Data muito antiga' })
      // responsável legal obrigatório para menor de 18
      if (age < 18) {
        if (!v.guardian_name?.trim())
          ctx.addIssue({
            code: 'custom',
            path: ['guardian_name'],
            message: 'Obrigatório para menor de 18',
          })
        if (!v.guardian_relationship?.trim())
          ctx.addIssue({
            code: 'custom',
            path: ['guardian_relationship'],
            message: 'Obrigatório para menor de 18',
          })
      }
    }
    const email = v.email?.trim()
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'E-mail inválido' })
    }
    const height = v.height_cm?.trim()
    if (height) {
      const n = Number(height)
      if (Number.isNaN(n) || n < 50 || n > 250)
        ctx.addIssue({ code: 'custom', path: ['height_cm'], message: 'Altura entre 50 e 250 cm' })
    }
  })

export type SubjectFormValues = z.infer<typeof subjectFormSchema>

export function emptySubjectForm(): SubjectFormValues {
  return {
    full_name: '',
    birth_date: '',
    sex: '',
    height_cm: '',
    phone: '',
    email: '',
    notes: '',
    guardian_name: '',
    guardian_relationship: '',
    is_active: true,
  }
}

export function subjectToForm(s: SubjectRow): SubjectFormValues {
  return {
    full_name: s.full_name,
    birth_date: s.birth_date,
    sex: s.sex,
    height_cm: s.height_cm != null ? String(s.height_cm) : '',
    phone: s.phone ?? '',
    email: s.email ?? '',
    notes: s.notes ?? '',
    guardian_name: s.guardian_name ?? '',
    guardian_relationship: s.guardian_relationship ?? '',
    is_active: s.is_active,
  }
}

function emptyToNull(s: string | undefined): string | null {
  const t = s?.trim()
  return t ? t : null
}

function heightToNum(s: string | undefined): number | null {
  const t = s?.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isNaN(n) ? null : n
}

export function formToInsert(v: SubjectFormValues, orgId: string): SubjectInsert {
  return {
    org_id: orgId,
    full_name: v.full_name.trim(),
    birth_date: v.birth_date,
    sex: v.sex,
    height_cm: heightToNum(v.height_cm),
    phone: emptyToNull(v.phone),
    email: emptyToNull(v.email),
    notes: emptyToNull(v.notes),
    guardian_name: emptyToNull(v.guardian_name),
    guardian_relationship: emptyToNull(v.guardian_relationship),
  }
}

export function formToUpdate(v: SubjectFormValues): SubjectUpdate {
  return {
    full_name: v.full_name.trim(),
    birth_date: v.birth_date,
    sex: v.sex,
    height_cm: heightToNum(v.height_cm),
    phone: emptyToNull(v.phone),
    email: emptyToNull(v.email),
    notes: emptyToNull(v.notes),
    guardian_name: emptyToNull(v.guardian_name),
    guardian_relationship: emptyToNull(v.guardian_relationship),
    is_active: v.is_active ?? true,
  }
}
