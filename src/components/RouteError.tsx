import { useEffect, useState } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { reportClientError } from '../lib/errlog'

function normalizeRouteError(value: unknown): Error {
  if (value instanceof Error) return value
  if (isRouteErrorResponse(value)) {
    return new Error(`Rota ${value.status}: ${value.statusText || 'falha inesperada'}`)
  }
  return new Error('Falha inesperada ao abrir a rota.')
}

export function RouteError() {
  const routeError = useRouteError()
  const error = normalizeRouteError(routeError)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    reportClientError(error.message, error.stack)
  }, [error.message, error.stack])

  async function recoverApp() {
    setRecovering(true)
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
      const url = new URL(window.location.href)
      url.searchParams.set('app-recovery', String(Date.now()))
      window.location.replace(url.toString())
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Algo deu errado</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Não foi possível abrir esta tela. Recarregue o app; se o problema persistir, o erro
            já foi registrado para diagnóstico.
          </p>
        </div>
        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void recoverApp()}
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
          <p className="mt-2 break-words font-mono">{error.message}</p>
        </details>
      </div>
    </div>
  )
}
