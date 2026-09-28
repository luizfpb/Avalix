import { Search, Youtube } from 'lucide-react'
import type { ExerciseVideo } from './demo'

// Link de demonstração reutilizável (biblioteca, picker, detalhe do plano,
// página do aluno). Abre em nova aba o vídeo do exercício ou, sem vídeo
// escolhido nem curado, a busca pelo nome — e o rótulo diz qual dos dois, para
// ninguém esperar um vídeo e cair numa lista de resultados. stopPropagation
// pra não disparar cliques de linhas/cards que o envolvem.
export function ExerciseDemoLink({
  name,
  video,
  label,
  className = 'inline-flex items-center gap-1 text-muted-foreground hover:text-foreground',
}: {
  name: string
  video: ExerciseVideo
  // sem rótulo: só o ícone (o título e o aria-label continuam descritivos)
  label?: string
  className?: string
}) {
  const busca = video.kind === 'search'
  const texto = label ?? (busca ? 'Buscar vídeo' : 'Ver vídeo')
  const titulo = busca ? `Buscar vídeo de "${name}" no YouTube` : `Ver vídeo de "${name}"`
  const Icon = busca ? Search : Youtube
  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      title={titulo}
      aria-label={texto ? undefined : titulo}
      onClick={(e) => e.stopPropagation()}
      className={className}
    >
      <Icon className="size-3.5" /> {texto}
    </a>
  )
}
