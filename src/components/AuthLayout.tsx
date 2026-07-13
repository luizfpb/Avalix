import type { ReactNode } from 'react'
import { ChartNoAxesCombined, FileCheck2, ShieldCheck } from 'lucide-react'
import { BrandLogo, BrandMark } from './BrandLogo'

const assurances = [
  { icon: ChartNoAxesCombined, text: 'Evolução clara, sem perder o contexto clínico' },
  { icon: FileCheck2, text: 'Relatórios profissionais prontos para entregar' },
  { icon: ShieldCheck, text: 'Privacidade e rastreabilidade em cada registro' },
]

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
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)]">
      <section className="measurement-field relative hidden min-h-screen overflow-hidden bg-[#24143c] px-12 py-10 text-[#f4effc] lg:flex lg:flex-col xl:px-16">
        <div className="absolute -right-28 top-[12%] size-[30rem] rounded-full border border-white/8" />
        <div className="absolute -right-12 top-[23%] size-80 rounded-full border border-white/6" />
        <div className="relative z-10 flex items-center gap-3">
          <BrandMark size={42} className="ring-1 ring-white/15" />
          <BrandLogo height={19} className="text-[#f3ebff]" />
        </div>

        <div className="relative z-10 my-auto max-w-xl py-16">
          <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#beaee0]">
            Precisão que acolhe
          </p>
          <h2 className="max-w-lg text-[clamp(2.75rem,4.6vw,4.5rem)] font-medium leading-[0.96] tracking-[-0.035em] text-white">
            Cuidado que se percebe nos detalhes.
          </h2>
          <p className="mt-7 max-w-lg text-base leading-relaxed text-[#d7cde8]">
            Avaliações, evolução e prescrição reunidas em um fluxo seguro — para você trabalhar com
            clareza e entregar confiança.
          </p>

          <div className="mt-10 space-y-4 border-l border-[#8f78ba]/45 pl-5">
            {assurances.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-[#eee7f8]">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/7 text-[#cbb9eb] ring-1 ring-white/10">
                  <Icon className="size-4" strokeWidth={1.7} />
                </span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-[11px] text-[#aa9bbb]">
          Avalix · Tecnologia para uma prática mais humana
        </p>
      </section>

      <main className="measurement-field relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="mb-8 flex items-center gap-3">
              <BrandMark size={40} className="shadow-lg shadow-brand/20" />
              <BrandLogo height={18} className="text-foreground" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Área segura</p>
          </div>

          <div className="mb-7">
            <p className="hidden text-xs font-bold uppercase tracking-[0.18em] text-primary lg:block">
              Área segura
            </p>
            <h1 className="mt-2 text-4xl font-medium tracking-[-0.025em] text-foreground">{title}</h1>
            {subtitle ? (
              <p className="mt-2.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
            ) : (
              <p className="mt-2.5 text-sm text-muted-foreground">
                Use suas credenciais para acessar o espaço profissional.
              </p>
            )}
          </div>

          <div className="surface-lift rounded-2xl border border-border/80 bg-card/95 p-6 sm:p-7">
            {children}
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-success" />
            <span>Conexão segura e dados protegidos</span>
          </div>
        </div>
      </main>
    </div>
  )
}
