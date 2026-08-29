import type { ReactNode } from 'react'
import { Layers, Repeat } from 'lucide-react'
import { groupHint, groupLabel, type GroupKind } from './groups'

// Moldura de um bloco de exercícios (super-série/circuito) nas telas que só
// EXIBEM o plano: detalhe do plano, execução e app do aluno. O builder tem a
// sua própria, porque lá o cabeçalho ainda troca o tipo e desagrupa.
//
// Vive num componente só para as três telas nunca discordarem sobre o que é um
// bi-set: o nome sai do tamanho do bloco, e junto dele vai sempre a instrução
// de execução — o aluno não deveria precisar saber o jargão para fazer certo.
export function GroupBlock({
  kind,
  size,
  children,
}: {
  kind: GroupKind
  size: number
  children: ReactNode
}) {
  return (
    <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-2">
      <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-primary">
        {kind === 'circuit' ? (
          <Repeat className="size-3.5 shrink-0" />
        ) : (
          <Layers className="size-3.5 shrink-0" />
        )}
        {groupLabel(kind, size)}
        <span className="font-normal text-muted-foreground">{groupHint(kind, size)}</span>
      </p>
      {children}
    </div>
  )
}
