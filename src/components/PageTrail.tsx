import { Link } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TrailStep = { label: string; to: string }

// Navegação de volta das telas internas. No celular mostra só o nível de cima
// ("‹ Maria Silva"); a partir de lg vira a trilha inteira, com a página atual
// no fim ("Alunos › Maria Silva › Avaliação de 12/10"). Antes cada tela tinha
// um "← Voltar" escrito à mão: a seta era um caractere da fonte, menor e de
// traço diferente dos ícones, e "Voltar" não dizia para onde ia.
//
// Cada link existe uma vez só no DOM; o CSS esconde os níveis de cima no
// celular. O rótulo é sempre o destino, nunca "Voltar".
export function PageTrail({
  steps,
  current,
  className,
}: {
  // do nível mais alto até o pai; o último é o destino do "voltar"
  steps: TrailStep[]
  // título da página atual, só na trilha do computador
  current?: string
  className?: string
}) {
  const last = steps.length - 1
  return (
    <nav aria-label="Navegação" className={className}>
      <ol className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground lg:gap-1">
        {steps.map((step, i) => (
          <li
            key={step.to}
            className={cn('min-w-0 items-center gap-1.5 lg:gap-1', i === last ? 'flex' : 'hidden lg:flex')}
          >
            <Link
              to={step.to}
              // -my-3/py-3: alvo de toque de 44 px no celular sem empurrar o título
              className="-my-3 -ml-1 inline-flex min-w-0 items-center gap-1 rounded-md py-3 pl-1 pr-1.5 transition-colors lg:pr-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35 lg:-my-1 lg:py-1"
            >
              {i === last ? <ChevronLeft aria-hidden className="size-4 shrink-0 lg:hidden" /> : null}
              <span className="truncate">{step.label}</span>
            </Link>
            {i < last || current ? (
              <ChevronRight aria-hidden className="hidden size-3.5 shrink-0 opacity-60 lg:block" />
            ) : null}
          </li>
        ))}
        {current ? (
          <li aria-current="page" className="hidden min-w-0 truncate text-foreground lg:block">
            {current}
          </li>
        ) : null}
      </ol>
    </nav>
  )
}
