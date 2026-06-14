import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'

export default function Configuracoes() {
  const { user } = useAuth()
  const { organization, role } = useOrganization()
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Configurações</h1>

      <section className="space-y-1">
        <h2 className="text-sm font-medium">Conta</h2>
        <p className="text-sm text-muted-foreground">E-mail: {user?.email}</p>
        <p className="text-sm text-muted-foreground">
          Autenticação em dois fatores (MFA): será adicionada na próxima etapa.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="text-sm font-medium">Organização</h2>
        <p className="text-sm text-muted-foreground">Nome: {organization?.name ?? '-'}</p>
        <p className="text-sm text-muted-foreground">Seu papel: {role ?? '-'}</p>
      </section>
    </div>
  )
}
