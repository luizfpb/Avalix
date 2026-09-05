import { AlertTriangle } from 'lucide-react'

// Aviso de "alterado em outro dispositivo", nas três telas de edição longa.
//
// O guard de concorrência da 0023 já recusa a gravação defasada — o problema é
// que ele só se manifestava no clique em Salvar, depois de o profissional ter
// digitado tudo. Este banner traz a notícia no momento em que ela chega, com a
// única orientação honesta possível: o que está na tela continua aqui, salvar
// por cima será recusado, e recarregar mostra a versão nova. Nada é descartado
// automaticamente.

export function VersionConflictBanner({ what }: { what: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">Alterado em outro dispositivo</p>
        <p>
          {what} foi salvo em outro lugar depois que esta tela abriu. O que você digitou continua
          aqui, mas salvar por cima vai ser recusado para não apagar o trabalho feito lá. Anote o
          que precisa e recarregue a página para partir da versão atual.
        </p>
      </div>
    </div>
  )
}
