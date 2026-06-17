import type { ReactNode } from 'react'
import { BrandLogo } from './BrandLogo'

// Campo da marca: fundo roxo profundo (#2A0E52) com o logo claro, e o conteúdo
// num card. Vale para login, cadastro, recuperação e desafio de 2FA.
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10" style={{ backgroundColor: '#2A0E52' }}>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo height={28} className="mb-4 text-[#ECE3FA]" />
          <h1 className="text-xl font-semibold tracking-tight text-[#ECE3FA]">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-[#ECE3FA]/70">{subtitle}</p> : null}
        </div>
        <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-xl">{children}</div>
      </div>
    </div>
  )
}
