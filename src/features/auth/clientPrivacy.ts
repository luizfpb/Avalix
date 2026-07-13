import type { QueryClient } from '@tanstack/react-query'
import { clearAllIntakeLinksLocal, setIntakeLinkScope } from '../anamnesis/linkStore'
import { clearAllPrivateDrafts, setPrivateDraftScope } from '../../lib/draft'
import { setErrlogOrg } from '../../lib/errlog'

export type ClearableQueryClient = Pick<QueryClient, 'clear'>

export function identityChanged(
  previousUserId: string | null | undefined,
  nextUserId: string | null
): boolean {
  // No bootstrap autenticado, preserva o rascunho do mesmo usuario. Bootstrap
  // sem sessao equivale a logout/expiracao e deve limpar qualquer dado privado.
  if (previousUserId === undefined) return nextUserId === null
  return previousUserId !== nextUserId
}

export function clearPrivateClientState(queryClient: ClearableQueryClient): void {
  queryClient.clear()
  clearAllPrivateDrafts()
  clearAllIntakeLinksLocal()
  setErrlogOrg(null)
}

export function setPrivateClientScope(
  userId: string | null,
  orgId: string | null
): void {
  setPrivateDraftScope(userId, orgId)
  setIntakeLinkScope(userId, orgId)
  if (!userId || !orgId) setErrlogOrg(null)
}
