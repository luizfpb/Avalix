import { useMemo, useState } from 'react'
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
  type LucideIcon,
} from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import { useSubjects } from '../features/subjects/hooks'
import { usePendingIntakes } from '../features/anamnesis/intakeHooks'
import { useUpcomingAppointments } from '../features/appointments/hooks'
import { useLastAssessmentBySubject } from '../features/assessment/hooks'
import { useOrgActivePlans, useOrgWorkoutLogSummary } from '../features/workout/hooks'
import {
  buildCarteira,
  LOW_ADHERENCE_RATIO,
  QUIET_DAYS,
} from '../features/workout/carteira'
import { relativeDayLabel } from '../lib/reminders'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { subjectTermLabels } from '../lib/subjectTerm'
import { QueryError } from '../components/QueryError'

export default function Dashboard() {
  const { organization } = useOrganization()
  const orgId = organization?.id
  const labels = subjectTermLabels(organization?.subject_term)
  const subjectsQ = useSubjects(orgId)
  const { data: subjects, isPending } = subjectsQ

  const total = subjects?.length ?? 0
  const ativos = subjects?.filter((s) => s.is_active).length ?? 0
  const isEmpty = !isPending && total === 0

  const intakesQ = usePendingIntakes(orgId)
  const pendingIntakes = intakesQ.data ?? []
  const now = useMemo(() => new Date(), [])
  const appointmentWindow = useMemo(() => {
    const startsAt = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const endsAt = new Date(now.getTime() + 7 * 86400000).toISOString()
    return { startsAt, endsAt }
  }, [now])
  const apptsQ = useUpcomingAppointments(
    orgId,
    appointmentWindow.startsAt,
    appointmentWindow.endsAt
  )
  const lastAssessQ = useLastAssessmentBySubject(orgId)
  const plansQ = useOrgActivePlans(orgId)
  const logsQ = useOrgWorkoutLogSummary(orgId)
  const upcoming = apptsQ.data ?? []
  const rows = useMemo(
    () =>
      buildCarteira({
        subjects: subjects ?? [],
        lastAssessment: lastAssessQ.data ?? {},
        activePlans: plansQ.data ?? [],
        logSummary: logsQ.data ?? {},
        now,
      }),
    [subjects, lastAssessQ.data, plansQ.data, logsQ.data, now]
  )
  const attentionRows = rows.filter((row) => row.attention > 0)
  // O painel mostra os primeiros e dizia quantos faltavam, sem caminho nenhum
  // para eles: quem precisava agir tinha de voltar à lista geral e procurar de
  // novo quem já estava sinalizado aqui. A lista já está toda em memória.
  const [verTodasPendencias, setVerTodasPendencias] = useState(false)
  const reassessCount = rows.filter((row) => row.reassessDue).length
  const quietCount = rows.filter((row) => row.quiet).length
  const attentionPending =
    subjectsQ.isPending || lastAssessQ.isPending || plansQ.isPending || logsQ.isPending
  const todayLabel = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(now)
  const hasLoadError =
    subjectsQ.isError ||
    intakesQ.isError ||
    lastAssessQ.isError ||
    plansQ.isError ||
    logsQ.isError

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
            O que merece sua atenção agora.
          </p>
        </div>
        <Button asChild size="lg" className="self-start sm:self-auto">
          <Link to="/avaliados/novo">
            <UserPlus /> Cadastrar {labels.singular}
          </Link>
        </Button>
      </header>

      {hasLoadError ? (
        <QueryError
          message="Não foi possível carregar o resumo. Os números abaixo foram ocultados para não mostrar dados incompletos."
          onRetry={() => {
            void Promise.all([
              subjectsQ.refetch(),
              intakesQ.refetch(),
              lastAssessQ.refetch(),
              plansQ.refetch(),
              logsQ.refetch(),
            ])
          }}
        />
      ) : isEmpty ? (
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
      ) : hasLoadError ? null : (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo da operação">
          <StatCard
            label={`${labels.pluralCap} cadastrados`}
            value={isPending ? '—' : total}
            hint="base completa"
          />
          <StatCard label="Ativos" value={isPending ? '—' : ativos} hint="em acompanhamento" tone="success" />
          <StatCard
            label="Para reavaliar"
            value={attentionPending ? '—' : reassessCount}
            hint="acompanhamento vencido"
            tone="warning"
          />
          <StatCard
            label="Sem treino recente"
            value={attentionPending ? '—' : quietCount}
            hint={`há ${QUIET_DAYS}+ dias`}
            tone="warning"
          />
        </section>
      )}

      {!hasLoadError && pendingIntakes.length > 0 ? (
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

      {!hasLoadError ? (
        <section className={`grid gap-4 ${upcoming.length > 0 ? 'lg:grid-cols-5' : ''}`}>
          <Card className={upcoming.length > 0 ? 'lg:col-span-3' : ''}>
            <CardContent className="py-1">
              <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    Acompanhamento
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">Precisam de atenção</h2>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/avaliados">
                    Ver {labels.plural} <ArrowRight />
                  </Link>
                </Button>
              </div>

              {attentionPending ? (
                <p role="status" className="py-6 text-sm text-muted-foreground">
                  Carregando acompanhamentos...
                </p>
              ) : attentionRows.length === 0 ? (
                <EmptyLine
                  icon={CheckCircle2}
                  title="Acompanhamentos em dia"
                  text="Nenhuma reavaliação, ausência recente ou baixa adesão exige ação agora."
                  success
                />
              ) : (
                <ul className="divide-y divide-border/60">
                  {(verTodasPendencias ? attentionRows : attentionRows.slice(0, 5)).map((row) => {
                    const lowAdherence =
                      row.adherencePct != null && row.adherencePct < LOW_ADHERENCE_RATIO
                    return (
                      <li key={row.subjectId} className="py-3.5">
                        <div className="flex items-start gap-3">
                          <Link
                            to={`/avaliados/${row.subjectId}`}
                            className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                          >
                            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning">
                              <Bell className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{row.name}</span>
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                {row.planName ? `Plano ativo · ${row.planName}` : 'Sem plano ativo'}
                              </span>
                            </span>
                            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-12">
                          {row.reassessDue ? <Badge variant="warn">Reavaliar</Badge> : null}
                          {row.quiet ? <Badge variant="warn">Sem treino recente</Badge> : null}
                          {lowAdherence ? (
                            <Badge variant="warn">
                              {Math.round((row.adherencePct ?? 0) * 100)}% de adesão
                            </Badge>
                          ) : null}
                          {row.planId ? (
                            <Button asChild variant="ghost" size="sm" className="ml-auto h-7 px-2.5">
                              <Link to={`/avaliados/${row.subjectId}/treinos/${row.planId}/execucao`}>
                                Execução <ArrowRight />
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              {!attentionPending && attentionRows.length > 5 ? (
                <div className="border-t border-border/60 pt-3">
                  <button
                    type="button"
                    onClick={() => setVerTodasPendencias((v) => !v)}
                    aria-expanded={verTodasPendencias}
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {verTodasPendencias
                      ? 'Mostrar só os primeiros'
                      : `Ver os ${attentionRows.length} acompanhamentos que precisam de atenção`}
                  </button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {upcoming.length > 0 ? (
            <Card className="lg:col-span-2">
              <CardContent className="py-1">
                <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      Próximos 7 dias
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">Compromissos</h2>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/agenda" aria-label="Abrir agenda completa">
                      Agenda <ArrowRight />
                    </Link>
                  </Button>
                </div>

                <ul className="divide-y divide-border/60">
                  {upcoming.slice(0, 3).map((appointment) => (
                    <li key={appointment.id}>
                      <Link
                        to={`/avaliados/${appointment.subject_id}`}
                        className="group flex items-center gap-3 py-3.5 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                          <CalendarDays className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {appointment.subjectName}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {appointment.title}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-[11px] font-semibold text-muted-foreground">
                          <span className="block">{relativeDayLabel(appointment.starts_at, now)}</span>
                          <span className="mt-0.5 block tabular-nums">
                            {appointmentTimeLabel(appointment.starts_at)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {upcoming.length > 3 ? (
                  <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    +{upcoming.length - 3} na agenda.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </section>
      ) : null}

      {!hasLoadError && apptsQ.isError ? (
        <QueryError
          message="Não foi possível verificar os próximos compromissos."
          onRetry={() => void apptsQ.refetch()}
        />
      ) : null}

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
            title="Ajustes"
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
  icon: LucideIcon
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
  icon: LucideIcon
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

function appointmentTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}
