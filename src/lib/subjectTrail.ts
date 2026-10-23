import { useOrganization } from '../features/organization/context'
import { useSubject } from '../features/subjects/hooks'
import { subjectTermLabels } from './subjectTerm'
import type { TrailStep } from '../components/PageTrail'

// Os dois primeiros níveis de toda tela dentro da ficha: a lista e a ficha do
// aluno. O nome sai da mesma consulta da ficha (já em cache quando se chega
// por ela); enquanto carrega, vale o termo da organização ("Aluno").
export function useSubjectTrail(subjectId: string | undefined): TrailStep[] {
  const { organization } = useOrganization()
  const labels = subjectTermLabels(organization?.subject_term)
  const subject = useSubject(subjectId)
  const list = { label: labels.pluralCap, to: '/avaliados' }
  if (!subjectId) return [list]
  return [list, { label: subject.data?.full_name ?? labels.singularCap, to: `/avaliados/${subjectId}` }]
}
