import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import { useOrganization } from '../features/organization/context'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'

const cards = [
  { title: 'Avaliados', desc: 'Cadastro e histórico de quem você avalia.', to: '/avaliados', ready: true },
  { title: 'Nova avaliação', desc: 'Dobras, circunferências e composição.', to: null, ready: false },
  { title: 'Postural', desc: 'Captura e comparação de fotos posturais.', to: null, ready: false },
  { title: 'Relatórios', desc: 'PDF e exportações.', to: null, ready: false },
  { title: 'Configurações', desc: 'Conta, organização e preferências.', to: '/configuracoes', ready: true },
]

export default function Dashboard() {
  const { user } = useAuth()
  const { organization, role } = useOrganization()

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {organization?.name ?? 'Organização'} {' · '} {user?.email}
          {role ? ' · ' + role : ''}
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const inner = (
            <Card
              className={c.ready ? 'h-full transition-colors hover:bg-accent' : 'h-full opacity-60'}
            >
              <CardHeader>
                <CardTitle className="text-base">{c.title}</CardTitle>
                <CardDescription>{c.desc}</CardDescription>
              </CardHeader>
              {!c.ready ? (
                <CardContent className="text-xs text-muted-foreground">Em breve</CardContent>
              ) : null}
            </Card>
          )
          return c.to ? (
            <Link key={c.title} to={c.to} className="block">
              {inner}
            </Link>
          ) : (
            <div key={c.title}>{inner}</div>
          )
        })}
      </section>
    </div>
  )
}
