import { useEffect } from 'react'
import { Link } from 'react-router'
import { BrandLogo, BrandMark } from '../components/BrandLogo'
import { PROVIDER, TERMS_SECTIONS, TERMS_UPDATED_AT, TERMS_VERSION } from '../features/legal/terms'

// Página pública: abre logado ou não (App.tsx a deixa fora do RouteGuard).
export default function Termos() {
  useEffect(() => {
    document.title = 'Termos de Uso · Avalix'
  }, [])

  const identity = [PROVIDER.name, PROVIDER.document && `CPF/CNPJ ${PROVIDER.document}`, PROVIDER.address]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <main className="mx-auto max-w-2xl">
        <Link to="/" className="mb-10 flex items-center gap-3">
          <BrandMark size={32} />
          <BrandLogo height={15} className="text-foreground" />
        </Link>

        <h1 className="text-2xl font-semibold">Termos de Uso</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Versão {TERMS_VERSION}, atualizada em {TERMS_UPDATED_AT}.
        </p>

        <div className="mt-8 space-y-8">
          {TERMS_SECTIONS.map((section) => (
            <section key={section.title} className="space-y-3">
              <h2 className="text-base font-semibold">{section.title}</h2>
              {section.paragraphs.map((p) => (
                <p key={p.slice(0, 40)} className="text-sm leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
            </section>
          ))}

          <section className="space-y-3 border-t pt-8">
            <h2 className="text-base font-semibold">Quem oferece o serviço e contato</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {identity}. Dúvidas, pedidos de reembolso, de exclusão ou sobre dados pessoais:{' '}
              <a className="text-foreground underline underline-offset-2" href={`mailto:${PROVIDER.email}`}>
                {PROVIDER.email}
              </a>
              .
            </p>
          </section>
        </div>

        <Link to="/" className="mt-10 inline-block text-sm text-muted-foreground hover:text-foreground">
          ← Voltar ao Avalix
        </Link>
      </main>
    </div>
  )
}
