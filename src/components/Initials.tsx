import { initials } from '../lib/initials'

const SIZES = {
  md: 'size-9 text-xs',
  lg: 'size-11 text-sm',
  // cabeçalho da ficha: cresce só no computador
  xl: 'size-11 text-sm lg:size-14 lg:text-base',
}

// Iniciais do nome num círculo neutro, ao lado do nome por extenso (por isso
// fica fora da leitura de tela: o nome já é lido).
export function Initials({ name, size = 'md' }: { name: string; size?: keyof typeof SIZES }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-secondary font-medium text-secondary-foreground ${SIZES[size]}`}
    >
      {initials(name)}
    </span>
  )
}
