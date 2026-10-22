import { matchPath } from 'react-router'

// Telas que só servem para criar ou editar o que a assinatura vencida trava
// (0049/0052). Com a conta em só leitura, abrem um aviso no lugar do
// formulário: antes o profissional preenchia tudo e só via a recusa ao salvar.
// Corrigir o cadastro do aluno (/avaliados/:id/editar) continua liberado.
export const READ_ONLY_ROUTES = [
  '/avaliados/novo',
  '/avaliados/intake/:intakeId',
  '/avaliados/:id/anamnese/nova',
  '/avaliados/:id/anamnese/intake/:intakeId',
  '/avaliados/:id/anamnese/:anamneseId/editar',
  '/avaliados/:id/avaliacoes/nova',
  '/avaliados/:id/avaliacoes/:assessmentId/editar',
  '/avaliados/:id/treinos/nova',
  '/avaliados/:id/treinos/:planId/editar',
  '/avaliados/:id/postural/nova',
] as const

export function isReadOnlyRoute(pathname: string): boolean {
  return READ_ONLY_ROUTES.some((pattern) => matchPath(pattern, pathname))
}
