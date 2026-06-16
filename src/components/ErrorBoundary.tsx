import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

// Limite de erro global: sem ele, qualquer exceção de render deixa a tela em
// branco. Aqui mostramos uma mensagem amigável e a opção de recarregar.
// Sem telemetria externa por ora — só console pra depurar em runtime.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary capturou um erro:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-md space-y-3 text-center">
            <h1 className="text-lg font-semibold">Algo deu errado</h1>
            <p className="text-sm text-muted-foreground">
              A tela encontrou um erro inesperado. Tente recarregar. Se persistir, anote o que
              estava fazendo e reporte.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Recarregar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
