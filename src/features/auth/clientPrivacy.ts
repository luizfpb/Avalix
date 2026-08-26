import type { QueryClient } from '@tanstack/react-query'
import { clearAllIntakeLinksLocal, setIntakeLinkScope } from '../anamnesis/linkStore'
import { clearAllWorkoutLinksLocal, setWorkoutLinkScope } from '../workout/linkStore'
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

// O supabase-js reemite SIGNED_IN a cada transicao hidden -> visible (o
// visibilitychange chama _recoverAndRefresh, que notifica os assinantes) e a
// cada TOKEN_REFRESHED. Tratar esses eventos como se a identidade tivesse
// mudado tem dois efeitos destrutivos: regride o gate de MFA para 'unknown',
// e o RouteGuard troca a arvore de rotas por "Carregando...", desmontando o
// formulario aberto; e zera o escopo do rascunho, que nao volta sozinho porque
// o efeito de PrivateScope depende de (userId, orgId) e nenhum dos dois mudou.
// Resultado pratico: abrir o WhatsApp e voltar apagava a avaliacao digitada e
// desligava o autosave ate o proximo reload. Distinguir a revalidacao da troca
// real de identidade e o que evita isso.
export type SessionTransition = 'signedOut' | 'newIdentity' | 'revalidated'

export function classifySessionTransition(
  previousUserId: string | null | undefined,
  nextUserId: string | null
): SessionTransition {
  if (nextUserId === null) return 'signedOut'
  // Bootstrap: o AAL ainda nao foi checado nesta montagem, entao o shell
  // precisa mesmo esperar a resposta antes de liberar dado sensivel.
  if (previousUserId === undefined) return 'newIdentity'
  if (previousUserId !== nextUserId) return 'newIdentity'
  return 'revalidated'
}

export function clearPrivateClientState(queryClient: ClearableQueryClient): void {
  queryClient.clear()
  clearAllPrivateDrafts()
  clearAllIntakeLinksLocal()
  clearAllWorkoutLinksLocal()
  setErrlogOrg(null)
}

export function setPrivateClientScope(
  userId: string | null,
  orgId: string | null
): void {
  setPrivateDraftScope(userId, orgId)
  setIntakeLinkScope(userId, orgId)
  setWorkoutLinkScope(userId, orgId)
  if (!userId || !orgId) setErrlogOrg(null)
}
