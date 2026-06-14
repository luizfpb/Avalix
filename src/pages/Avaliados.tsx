import { useOrganization } from '../features/organization/context'

export default function Avaliados() {
  const { organization } = useOrganization()
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Avaliados</h1>
      <p className="text-sm text-muted-foreground">
        Aqui vai ficar a lista de avaliados de {organization?.name ?? 'sua organização'}. O
        cadastro real entra numa próxima etapa.
      </p>
    </div>
  )
}
