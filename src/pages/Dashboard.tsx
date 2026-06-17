import { Link } from 'react-router-dom'
import { Users, UserPlus, Settings, ShieldCheck, ArrowRight } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import { useSubjects } from '../features/subjects/hooks'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { subjectTermLabels } from '../lib/subjectTerm'

export default function Dashboard() {
  const { organization, role } = useOrganization()
  const labels = subjectTermLabels(organization?.subject_term)
  const { data: subjects, isPending } = useSubjects(organization?.id)

  const total = subjects?.length ?? 0
  const ativos = subjects?.filter((s) => s.is_active).length ?? 0
  const isEmpty = !isPending && total === 0

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">
          {organization?.name ?? 'Início'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visão geral da sua organização{role ? ` · ${role}` : ''}.
        </p>
      </section>

      {isEmpty ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Users className="size-6" />
            </span>
            <div>
              <p className="font-medium">Comece cadastrando seu primeiro {labels.singular}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Depois você registra o consentimento e já pode avaliar.
              </p>
            </div>
            <Button asChild>
              <Link to="/avaliados/novo">
                <UserPlus /> Cadastrar {labels.singular}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label={`${labels.pluralCap} cadastrados`} value={isPending ? '—' : total} />
          <StatCard label="Ativos" value={isPending ? '—' : ativos} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Atalhos</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ActionCard
            to="/avaliados"
            icon={Users}
            title={labels.pluralCap}
            desc="Cadastro, avaliações e fotos."
          />
          <ActionCard
            to="/avaliados/novo"
            icon={UserPlus}
            title={`Novo ${labels.singular}`}
            desc="Cadastrar uma nova pessoa."
          />
          <ActionCard
            to="/configuracoes"
            icon={Settings}
            title="Configurações"
            desc="Conta, 2FA e organização."
          />
        </div>
      </section>

      <Card className="bg-muted/30">
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Os dados dos {labels.plural} são sensíveis (LGPD). Ative a{' '}
            <Link to="/configuracoes" className="font-medium text-foreground hover:underline">
              verificação em dois fatores
            </Link>{' '}
            para reforçar a proteção da conta.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="py-1">
        <p className="text-3xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}

function ActionCard({
  to,
  icon: Icon,
  title,
  desc,
}: {
  to: string
  icon: typeof Users
  title: string
  desc: string
}) {
  return (
    <Link to={to} className="group block">
      <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent">
        <CardContent className="flex h-full items-start gap-3 py-1">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 font-medium">
              {title}
              <ArrowRight className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
