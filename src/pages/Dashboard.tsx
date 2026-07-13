import { Link } from 'react-router'
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react'
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
  const { organization } = useOrganization()
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
  const todayLabel = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(now)

  return (
    <div className="space-y-8">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
            Visão de hoje · {todayLabel}
          </p>
          <h1 className="mt-2 max-w-2xl text-4xl font-medium leading-tight tracking-[-0.03em] sm:text-[2.75rem]">
            {organization?.name ?? 'Seu espaço profissional'}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            O que merece sua atenção agora, sem ruído.
          </p>
        </div>
        <Button asChild size="lg" className="self-start sm:self-auto">
          <Link to="/avaliados/novo">
            <UserPlus /> Cadastrar {labels.singular}
          </Link>
        </Button>
      </header>

      {isEmpty ? (
        <Card className="overflow-hidden border-dashed border-primary/30 bg-primary/[0.035]">
          <CardContent className="relative flex flex-col items-start gap-5 py-4 sm:flex-row sm:items-center">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/15">
              <Users className="size-6" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold">Comece pelo primeiro {labels.singular}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Cadastre os dados básicos; depois o Avalix orienta consentimento, anamnese e avaliação.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/avaliados/novo">
                Começar agora <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo da operação">
          <StatCard
            label={`${labels.pluralCap} cadastrados`}
            value={isPending ? '—' : total}
            hint="base completa"
          />
          <StatCard label="Ativos" value={isPending ? '—' : ativos} hint="em acompanhamento" tone="success" />
          <StatCard label="Próximos 7 dias" value={upcoming.length} hint="sessões agendadas" />
          <StatCard label="Para reavaliar" value={dueList.length} hint={`há ${REASSESS_DAYS}+ dias`} tone="warning" />
        </section>
      )}

      {pendingIntakes.length > 0 ? (
        <Card className="overflow-hidden border-warning/25 bg-warning/[0.055]">
          <CardContent className="flex flex-col gap-4 py-1 sm:flex-row sm:items-center">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-warning/12 text-warning">
              <ClipboardCheck className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{pendingIntakes.length} {pendingIntakes.length === 1 ? 'anamnese aguarda' : 'anamneses aguardam'} sua revisão</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                As respostas já chegaram. Revise antes de seguir com o atendimento.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {pendingIntakes.slice(0, 3).map((p) => (
                <Button key={p.id} asChild variant="outline" size="sm">
                  <Link
                    to={
                      p.subject_id
                        ? `/avaliados/${p.subject_id}/anamnese/intake/${p.id}`
                        : `/avaliados/intake/${p.id}`
                    }
                  >
                    {p.subject_name ?? 'Abrir resposta'}
                  </Link>
                </Button>
              ))}
              {pendingIntakes.length > 3 ? (
                <span className="self-center text-xs font-semibold text-warning">
                  +{pendingIntakes.length - 3}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="py-1">
            <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Agenda
                </p>
                <h2 className="mt-1 text-xl font-semibold">Próximas sessões</h2>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to="/agenda">
                  Ver agenda <ArrowRight />
                </Link>
              </Button>
            </div>

            {upcoming.length === 0 ? (
              <EmptyLine
                icon={CalendarDays}
                title="Agenda tranquila nos próximos 7 dias"
                text="Novas sessões aparecerão aqui."
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {upcoming.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-3.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <CalendarDays className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{a.subjectName}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{a.title}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                      {relativeDayLabel(a.starts_at, now)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="py-1">
            <div className="border-b border-border/70 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Acompanhamento
              </p>
              <h2 className="mt-1 text-xl font-semibold">Para reavaliar</h2>
            </div>

            {dueList.length === 0 ? (
              <EmptyLine
                icon={CheckCircle2}
                title="Acompanhamentos em dia"
                text="Ninguém ultrapassou o intervalo de reavaliação."
                success
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {dueList.slice(0, 5).map((subject) => (
                  <li key={subject.id}>
                    <Link
                      to={`/avaliados/${subject.id}`}
                      className="group flex items-center gap-3 py-3.5 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning">
                        <Bell className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {subject.full_name}
                      </span>
                      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Acesso rápido
            </p>
            <h2 className="mt-1 text-xl font-semibold">Continue seu trabalho</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ActionCard
            to="/avaliados"
            icon={Users}
            title={labels.pluralCap}
            desc="Cadastros, avaliações e fotos."
          />
          <ActionCard
            to="/avaliados/novo"
            icon={UserPlus}
            title={`Novo ${labels.singular}`}
            desc="Inicie um novo acompanhamento."
          />
          <ActionCard
            to="/configuracoes"
            icon={Settings}
            title="Configurações"
            desc="Conta, segurança e organização."
          />
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-success/15 bg-success/[0.045] px-4 py-3.5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Dados de saúde pedem cuidado extra. A{' '}
          <Link to="/configuracoes" className="font-semibold text-foreground hover:underline">
            verificação em dois fatores
          </Link>{' '}
          reforça a proteção da sua conta e dos seus {labels.plural}.
        </p>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  tone = 'primary',
}: {
  label: string
  value: string | number
  hint: string
  tone?: 'primary' | 'success' | 'warning'
}) {
  const toneClass = {
    primary: 'bg-primary',
    success: 'bg-success',
    warning: 'bg-warning',
  }[tone]
  return (
    <Card className="relative overflow-hidden">
      <span className={`absolute inset-y-0 left-0 w-1 ${toneClass}`} />
      <CardContent className="py-0">
        <p className="text-3xl font-semibold tracking-[-0.04em] tabular-nums sm:text-4xl">{value}</p>
        <p className="mt-2 text-xs font-semibold text-foreground/85">{label}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

function EmptyLine({
  icon: Icon,
  title,
  text,
  success = false,
}: {
  icon: typeof CalendarDays
  title: string
  text: string
  success?: boolean
}) {
  return (
    <div className="flex items-start gap-3 py-6">
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl ${
          success ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
        }`}
      >
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
      </div>
    </div>
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
    <Link to={to} className="group block rounded-2xl focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none">
      <Card className="h-full transition-[border-color,background-color,transform,box-shadow] group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:bg-accent/35 group-hover:shadow-lg">
        <CardContent className="flex h-full items-start gap-3 py-0">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
            <Icon className="size-[1.1rem]" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              {title}
              <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
