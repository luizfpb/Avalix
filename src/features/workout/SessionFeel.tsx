import { feelOption } from './feel'

// Marca discreta de leitura, para a linha de uma sessão já registrada. Sessão
// sem resposta (a do profissional, ou a de quem não quis responder) não mostra
// nada: inventar "normal" seria transformar silêncio em dado.
export function SessionFeel({ feel }: { feel?: number | null }) {
  const opcao = feelOption(feel)
  if (!opcao) return null
  const Icone = opcao.icon
  return (
    <span
      className="inline-flex items-center gap-1 align-middle text-muted-foreground"
      title={`O aluno marcou: ${opcao.label.toLowerCase()}`}
    >
      <Icone className="size-3.5" aria-hidden="true" />
      <span className="sr-only">Sensação do aluno: </span>
      {opcao.label.toLowerCase()}
    </span>
  )
}
