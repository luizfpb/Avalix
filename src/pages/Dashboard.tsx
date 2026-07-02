import { Link } from 'react-router'
import { Users, UserPlus, Settings, ShieldCheck, ArrowRight, CalendarDays, Bell, ClipboardCheck } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import { useSubjects } from '../features/subjects/hooks'
import { usePendingIntakes } from '../features/anamnesis/intakeHooks'
import { useAppointments } from '../features/appointments/hooks'
import { useLastAssessmentBySubject } from '../features/assessment/hooks'
import { relativeDayLabel, dueForReassessment, REASSESS_DAYS } from '../lib/reminders'
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

  const pendingIntakes = usePendingIntakes(organization?.id).data ?? []
  const apptsQ = useAppointments(organization?.id)
  const lastAssessQ = useLastAssessmentBySubject(organization?.id)
  const now = new Date()
  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const upcoming = (apptsQ.data ?? [])
    .filter((a) => {
      const t = new Date(a.starts_at).getTime()
      return t >= sod && t <= now.getTime() + 7 * 86400000
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const lastMap = lastAssessQ.data ?? {}
  const dueList = (subjects ?? []).filter(
    (s) => s.is_active && dueForReassessment(lastMap[s.id] ?? null, now)
  )
  const hasReminders = upcoming.length > 0 || dueList.length > 0

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

      {pendingIntakes.length > 0 ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ClipboardCheck className="size-4 text-destructive" /> Anamneses aguardando revisão
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {pendingIntakes.length}{' '}
              {pendingIntakes.length === 1 ? 'aluno respondeu e está' : 'alunos responderam e estão'}{' '}
              esperando você revisar e aceitar.
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {pendingIntakes.slice(0, 5).map((p) => (
                <li key={p.id}>
                  {p.subject_id && p.id ? (
                    <Link
                      to={`/avaliados/${p.subject_id}/anamnese/intake/${p.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {p.subject_name ?? 'Aluno'}
                    </Link>
                  ) : (
                    <span>{p.subject_name ?? 'Aluno'}</span>
                  )}
                </li>
              ))}
              {pendingIntakes.length > 5 ? (
                <li className="text-xs text-muted-foreground">+{pendingIntakes.length - 5} mais</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {hasReminders ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Lembretes</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card>
              <CardContent className="py-1">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <CalendarDays className="size-4 text-primary" /> Próximas sessões
                  </p>
                  <Link to="/agenda" className="text-xs text-primary hover:underline">
                    Agenda
                  </Link>
                </div>
                {upcoming.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">Nada nos próximos 7 dias.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {upcoming.slice(0, 3).map((a) => (
                      <li key={a.id} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {a.subjectName} <span className="text-muted-foreground">· {a.title}</span>
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {relativeDayLabel(a.starts_at, now)}
                        </span>
                      </li>
                    ))}
                    {upcoming.length > 3 ? (
                      <li className="text-xs text-muted-foreground">+{upcoming.length - 3} mais</li>
                    ) : null}
                  </ul>
                )}
              </CardContent>
            </Card>

            {dueList.length > 0 ? (
              <Card>
                <CardContent className="py-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Bell className="size-4 text-amber-500" /> Para reavaliar
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sem avaliação há {REASSESS_DAYS}+ dias (ou nunca).
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {dueList.slice(0, 4).map((s) => (
                      <li key={s.id}>
                        <Link to={`/avaliados/${s.id}`} className="hover:underline">
                          {s.full_name}
                        </Link>
                      </li>
                    ))}
                    {dueList.length > 4 ? (
                      <li className="text-xs text-muted-foreground">+{dueList.length - 4} mais</li>
                    ) : null}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </section>
      ) : null}

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
