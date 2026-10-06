import { initials } from '../lib/initials'

// Iniciais do nome num círculo neutro, ao lado do nome por extenso (por isso
// fica fora da leitura de tela: o nome já é lido).
export function Initials({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-secondary font-medium text-secondary-foreground ${
        size === 'lg' ? 'size-11 text-sm' : 'size-9 text-xs'
      }`}
    >
      {initials(name)}
    </span>
  )
}
