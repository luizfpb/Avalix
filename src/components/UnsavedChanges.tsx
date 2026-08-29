import { CircleDot } from 'lucide-react'
import { ConfirmDialog } from './ConfirmDialog'
import type { UnsavedChangesGuard } from '../lib/unsavedChanges'

// Aviso e pergunta de saída dos formulários longos, num lugar só: o texto tem
// de ser o mesmo no treino, na avaliação e na anamnese, porque a promessa que
// ele faz (o rascunho fica no aparelho, não no servidor) é a mesma nas três e
// precisa ser exata. Copiada por tela, uma delas divergiria e viraria promessa
// falsa sobre onde o trabalho do profissional está guardado.

export function UnsavedBadge() {
  return (
    <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
      <CircleDot className="size-3.5 shrink-0" aria-hidden />
      Alterações não salvas — guardadas neste aparelho
    </span>
  )
}

export function UnsavedChangesPrompt({
  guard,
  what,
}: {
  guard: UnsavedChangesGuard
  // o que está sendo editado, para o aviso dizer o que se perde: "neste plano
  // de treino", "nesta avaliação", "nesta anamnese"
  what: string
}) {
  return (
    <ConfirmDialog
      open={guard.blocked}
      title="Sair sem salvar?"
      description={
        <>
          Suas alterações {what} ainda não foram enviadas. Elas ficam guardadas neste aparelho por
          24 horas e voltam quando você abrir esta tela de novo — mas não estão no servidor e
          ninguém mais as vê.
        </>
      }
      confirmLabel="Sair sem salvar"
      cancelLabel="Continuar editando"
      onConfirm={guard.leave}
      onCancel={guard.stay}
    />
  )
}
