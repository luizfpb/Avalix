import type { ReactNode } from 'react'
import { BrandLogo, BrandMark } from './BrandLogo'

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <main className="w-full max-w-sm">
        <div className="mb-10 flex items-center gap-3">
          <BrandMark size={36} />
          <BrandLogo height={16} className="text-foreground" />
        </div>

        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
        ) : null}

        <div className="mt-6 rounded-lg border bg-card p-6">{children}</div>
      </main>
    </div>
  )
}
