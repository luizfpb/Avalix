import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportClientError } from '../lib/errlog'

type Props = { children: ReactNode }
type State = { error: Error | null; recovering: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, recovering: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary capturou um erro:', error, info.componentStack)
    reportClientError(error.message, error.stack ?? info.componentStack)
  }

  recoverApp = async () => {
    this.setState({ recovering: true })
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((registration) => registration.unregister()))
      }
      if ('caches' in window) {
        const keys = await window.caches.keys()
        await Promise.all(keys.map((key) => window.caches.delete(key)))
      }
    } finally {
      // A sessão do Supabase fica no localStorage e não é apagada. O parâmetro
      // só força uma navegação de rede depois de remover o shell inconsistente.
      const url = new URL(window.location.href)
      url.searchParams.set('app-recovery', String(Date.now()))
      window.location.replace(url.toString())
    }
  }

  render() {
    const { error, recovering } = this.state
    if (error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-md space-y-4 text-center">
            <div>
              <h1 className="text-2xl font-semibold">Algo deu errado</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                A atualização pode ter deixado arquivos de versões diferentes no aparelho. O
                reparo limpa apenas os arquivos temporários do app e preserva sua conta e seus
                dados.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-2 sm:flex-row">
              <button
                type="button"
                onClick={this.recoverApp}
                disabled={recovering}
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {recovering ? 'Reparando…' : 'Reparar atualização'}
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-10 items-center justify-center rounded-md border bg-card px-4 text-sm font-medium hover:bg-accent"
              >
                Tentar recarregar
              </button>
            </div>
            <details className="rounded-lg border border-border/70 bg-card/60 p-3 text-left text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">Detalhes técnicos</summary>
              <p className="mt-2 break-words font-mono">{error.message || 'Erro sem mensagem'}</p>
            </details>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
