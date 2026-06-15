// O termo escolhido pela organização (organizations.subject_term) define como
// "avaliado" aparece na UI. O plural pt-BR de todos os termos do CHECK é só +s.
//
// subject_term vem tipado como string no database.types (o CHECK do banco não
// vira enum), então valor desconhecido degrada pra 'avaliado' em vez de quebrar
// a tela. Mantemos a lista alinhada com o CHECK da migration 0001.

export const SUBJECT_TERMS = ['aluno', 'cliente', 'paciente', 'atleta', 'avaliado'] as const
export type SubjectTerm = (typeof SUBJECT_TERMS)[number]

export type SubjectTermLabels = {
  singular: string // aluno
  plural: string // alunos
  singularCap: string // Aluno
  pluralCap: string // Alunos
}

function isSubjectTerm(value: string): value is SubjectTerm {
  return (SUBJECT_TERMS as readonly string[]).includes(value)
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1)
}

export function subjectTermLabels(term: string | null | undefined): SubjectTermLabels {
  const t: SubjectTerm = term && isSubjectTerm(term) ? term : 'avaliado'
  const plural = `${t}s`
  return {
    singular: t,
    plural,
    singularCap: capitalize(t),
    pluralCap: capitalize(plural),
  }
}
