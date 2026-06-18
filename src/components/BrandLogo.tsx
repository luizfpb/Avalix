import { BRAND_LOGO, BRAND_MARK } from '../brand/paths'

function ratio(viewBox: string): number {
  const [, , w, h] = viewBox.split(' ').map(Number)
  return w / h
}

// Wordmark AVALIX inline (fill=currentColor): legível em qualquer fundo —
// no campo da marca fica #ECE3FA (text-[#ECE3FA]); no header, a cor do texto.
export function BrandLogo({ height = 20, className = '' }: { height?: number; className?: string }) {
  return (
    <svg
      viewBox={BRAND_LOGO.viewBox}
      height={height}
      width={height * ratio(BRAND_LOGO.viewBox)}
      fill="currentColor"
      role="img"
      aria-label="AVALIX"
      className={className}
    >
      <path d={BRAND_LOGO.d} />
    </svg>
  )
}

// Reduzido: a letra B clara dentro do campo da marca (quadrado roxo). Autônomo,
// igual no claro e no escuro.
export function BrandMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-lg ${className}`}
      style={{ width: size, height: size, backgroundColor: '#2A0E52' }}
    >
      <svg
        viewBox={BRAND_MARK.viewBox}
        width={size * 0.6}
        height={size * 0.6}
        fill="#ECE3FA"
        aria-hidden
      >
        <path d={BRAND_MARK.d} />
      </svg>
    </span>
  )
}
