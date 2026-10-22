import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useReadOnly } from '../features/billing/api'
import { ReadOnlyContext, useReadOnlyState } from '../features/billing/readOnlyContext'
import { isReadOnlyRoute } from '../lib/readOnlyRoutes'

export function ReadOnlyGate({ children }: { children: ReactNode }) {
  const state = useReadOnly()
  const { readOnly, canManage } = state
  const location = useLocation()
  if (!readOnly || !isReadOnlyRoute(location.pathname)) {
    return <ReadOnlyContext.Provider value={state}>{children}</ReadOnlyContext.Provider>
  }

  return (
    <div className="max-w-xl space-y-3">
      <h1 className="text-xl font-semibold">Conta em modo só leitura</h1>
      <p className="text-sm text-muted-foreground">
        A assinatura não está ativa, então não dá para criar nem editar por aqui. Seus dados continuam
        disponíveis para consulta e exportação.
      </p>
      {canManage ? (
        <Link
          to="/configuracoes/plano"
          className="inline-flex rounded-md bg-primary-solid px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-solid/90"
        >
          Ver plano e cobrança
        </Link>
      ) : (
        <p className="text-sm">Avise o dono da organização.</p>
      )}
    </div>
  )
}

// Aviso dentro de telas que misturam consulta e registro (Execução, foto
// postural): a tela abre, mas quem for registrar já sabe que não vai gravar.
export function ReadOnlyNotice({ children }: { children: ReactNode }) {
  const { readOnly } = useReadOnlyState()
  if (!readOnly) return null
  return (
    <p role="status" className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm">
      Conta em modo só leitura. {children}
    </p>
  )
}
