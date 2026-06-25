import { Youtube } from 'lucide-react'
import { exerciseDemoUrl } from './demo'

// Link "Demonstração" reutilizável (biblioteca, picker, detalhe do plano).
// Abre em nova aba a busca de vídeo do exercício. stopPropagation pra não
// disparar cliques de linhas/cards que o envolvem.
export function ExerciseDemoLink({
  name,
  label = 'Demonstração',
  className = 'inline-flex items-center gap-1 text-muted-foreground hover:text-foreground',
}: {
  name: string
  label?: string
  className?: string
}) {
  return (
    <a
      href={exerciseDemoUrl(name)}
      target="_blank"
      rel="noopener noreferrer"
      title={`Buscar vídeo de demonstração de "${name}"`}
      onClick={(e) => e.stopPropagation()}
      className={className}
    >
      <Youtube className="size-3.5" /> {label}
    </a>
  )
}
