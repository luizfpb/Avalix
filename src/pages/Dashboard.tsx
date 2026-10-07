import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { UserPlus } from 'lucide-react'
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
  type CarteiraRow,
} from '../features/workout/carteira'
import { relativeDayLabel } from '../lib/reminders'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Initials } from '../components/Initials'
import { subjectTermLabels } from '../lib/subjectTerm'
import { QueryError } from '../components/QueryError'
import { useClock } from '../lib/useClock'

type Filtro = 'todos' | 'reavaliar' | 'sem-treino' | 'adesao'

// A lista mostra só quem precisa de ação; sem a contagem, quem tem 3 alunos e
// vê 1 nome na lista acha que os outros 2 sumiram.
function ativosLabel(n: number, labels: { singular: string; plural: string }): string {
  return n === 1 ? `1 ${labels.singular} ativo` : `${n} ${labels.plural} ativos`
}

function lowAdherence(row: CarteiraRow): boolean {
  return row.adherencePct != null && row.adherencePct < LOW_ADHERENCE_RATIO
}

// Os números que ficavam no topo viraram filtros da própria lista: contar
// quem precisa de reavaliação sem levar a essas pessoas não ajudava a agir.
const FILTROS: {
  id: Filtro
  label: string
  title?: string
  match: (row: CarteiraRow) => boolean
}[] = [
  { id: 'todos', label: 'Todos', match: () => true },
  { id: 'reavaliar', label: 'Reavaliar', match: (row) => row.reassessDue },
  {
    id: 'sem-treino',
    label: 'Sem treino recente',
    title: `Plano ativo sem treino registrado há ${QUIET_DAYS} dias ou mais`,
    match: (row) => row.quiet,
  },
  { id: 'adesao', label: 'Baixa adesão', match: lowAdherence },
]

export default function Dashboard() {
  const { organization } = useOrganization()
  const orgId = organization?.id
  const labels = subjectTermLabels(organization?.subject_term)
  const subjectsQ = useSubjects(orgId)
  const { data: subjects, isPending } = subjectsQ
  const isEmpty = !isPending && (subjects?.length ?? 0) === 0

  const intakesQ = usePendingIntakes(orgId)
  const pendingIntakes = intakesQ.data ?? []
  const now = useClock()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const appointmentWindow = useMemo(() => {
    const end = new Date(todayStart)
    end.setDate(end.getDate() + 7)
    return { startsAt: new Date(todayStart).toISOString(), endsAt: end.toISOString() }
  }, [todayStart])
  const apptsQ = useUpcomingAppointments(
    orgId,
    appointmentWindow.startsAt,
    appointmentWindow.endsAt
  )
  const lastAssessQ = useLastAssessmentBySubject(orgId)
  const plansQ = useOrgActivePlans(orgId)
  const logsQ = useOrgWorkoutLogSummary(orgId)
  const upcoming = (apptsQ.data ?? []).filter(appointment => new Date(appointment.starts_at).getTime() >= now.getTime())
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
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const contagem = (f: (typeof FILTROS)[number]) => attentionRows.filter(f.match).length
  const filtrosComItens = FILTROS.filter((f) => f.id !== 'todos' && contagem(f) > 0)
  const escolhido = FILTROS.find((f) => f.id === filtro)
  // O filtro escolhido pode esvaziar quando os dados mudam; aí volta a "Todos".
  const filtroAtivo = escolhido && contagem(escolhido) > 0 ? escolhido : FILTROS[0]
  const visiveis = attentionRows.filter(filtroAtivo.match)
  const emDia = rows.length - attentionRows.length
  const attentionPending =
    subjectsQ.isPending || lastAssessQ.isPending || plansQ.isPending || logsQ.isPending
  const todayLabel = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
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
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Início</h1>
          <p className="mt-1 text-sm text-muted-foreground first-letter:uppercase">
            {todayLabel}
            {!attentionPending && !hasLoadError && !isEmpty ? ` · ${ativosLabel(rows.length, labels)}` : ''}
          </p>
        </div>
        <Button asChild className="self-start sm:self-auto">
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
        <Card>
          <CardContent>
            <h2 className="text-base font-semibold">Comece pelo primeiro {labels.singular}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Cadastre os dados básicos; depois o Avalix orienta consentimento, anamnese e avaliação.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!hasLoadError && pendingIntakes.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/[0.06] px-4 py-3.5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {pendingIntakes.length}{' '}
              {pendingIntakes.length === 1 ? 'anamnese aguarda' : 'anamneses aguardam'} sua revisão
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
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
              <span className="self-center text-sm font-medium text-warning">
                +{pendingIntakes.length - 3}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {!hasLoadError ? (
        <div className={`grid grid-cols-1 items-start gap-4 ${upcoming.length > 0 ? 'lg:grid-cols-5' : ''}`}>
          <Card className={upcoming.length > 0 ? 'lg:col-span-3' : ''}>
            <CardContent>
              <section aria-labelledby="atencao-titulo">
                <div className="flex items-center justify-between gap-4">
                  <h2 id="atencao-titulo" className="text-lg font-semibold">
                    Precisam de atenção
                  </h2>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/avaliados">Ver {labels.plural}</Link>
                  </Button>
                </div>

                {!attentionPending && filtrosComItens.length > 1 ? (
                  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar a lista">
                    {FILTROS.filter((f) => f.id === 'todos' || contagem(f) > 0).map((f) => {
                      const ativo = f.id === filtroAtivo.id
                      return (
                        <button
                          key={f.id}
                          type="button"
                          title={f.title}
                          aria-pressed={ativo}
                          onClick={() => {
                            setFiltro(f.id)
                            setVerTodasPendencias(false)
                          }}
                          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none ${
                            ativo
                              ? 'border-foreground bg-foreground text-background'
                              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                          }`}
                        >
                          {f.label}
                          <span className={`tabular-nums ${ativo ? 'opacity-70' : ''}`}>{contagem(f)}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}

                {attentionPending ? (
                  <p role="status" className="py-6 text-sm text-muted-foreground">
                    Carregando acompanhamentos...
                  </p>
                ) : attentionRows.length === 0 ? (
                  <div className="py-6">
                    <p className="text-sm font-medium">Acompanhamentos em dia</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {rows.length === 1 ? `O ${labels.singular} ativo está em dia. ` : ''}
                      {rows.length > 1 ? `Os ${rows.length} ${labels.plural} ativos estão em dia. ` : ''}
                      Nenhuma reavaliação, ausência recente ou baixa adesão exige ação agora.
                    </p>
                  </div>
                ) : (
                  <ul className="mt-2 divide-y" aria-label={`${labels.pluralCap} que precisam de atenção`}>
                    {(verTodasPendencias ? visiveis : visiveis.slice(0, 5)).map((row) => (
                      <li key={row.subjectId} className="flex items-start gap-3 py-3">
                        <Link
                          to={`/avaliados/${row.subjectId}`}
                          className="group flex min-w-0 flex-1 items-start gap-3 rounded-md focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                        >
                          <Initials name={row.name} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium group-hover:underline">
                              {row.name}
                            </span>
                            <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                              {row.planName ? `Plano ativo · ${row.planName}` : 'Sem plano ativo'}
                            </span>
                            <span className="mt-2 flex flex-wrap gap-1.5">
                              {row.reassessDue ? <Badge variant="warn">Reavaliar</Badge> : null}
                              {row.quiet ? <Badge variant="warn">Sem treino recente</Badge> : null}
                              {lowAdherence(row) ? (
                                <Badge variant="warn">
                                  {Math.round((row.adherencePct ?? 0) * 100)}% de adesão
                                </Badge>
                              ) : null}
                            </span>
                          </span>
                        </Link>
                        {row.planId ? (
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/avaliados/${row.subjectId}/treinos/${row.planId}/execucao`}>
                              Execução
                            </Link>
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {!attentionPending && visiveis.length > 5 ? (
                  <div className="border-t pt-3">
                    <button
                      type="button"
                      onClick={() => setVerTodasPendencias((v) => !v)}
                      aria-expanded={verTodasPendencias}
                      className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {verTodasPendencias ? 'Mostrar só os primeiros' : `Ver todos os ${visiveis.length}`}
                    </button>
                  </div>
                ) : null}
                {!attentionPending && attentionRows.length > 0 && emDia > 0 ? (
                  <p className="border-t pt-3 text-sm text-muted-foreground">
                    {emDia === 1
                      ? `O outro ${labels.singular} ativo está em dia.`
                      : `Os outros ${emDia} ${labels.plural} ativos estão em dia.`}
                  </p>
                ) : null}
              </section>
            </CardContent>
          </Card>

          {upcoming.length > 0 ? (
            <Card className="lg:col-span-2">
              <CardContent>
                <section aria-labelledby="compromissos-titulo">
                  <div className="flex items-center justify-between gap-4">
                    <h2 id="compromissos-titulo" className="text-lg font-semibold">
                      Próximos compromissos
                    </h2>
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/agenda" aria-label="Abrir agenda completa">
                        Agenda
                      </Link>
                    </Button>
                  </div>

                  <ul className="mt-2 divide-y">
                    {upcoming.slice(0, 3).map((appointment) => (
                      <li key={appointment.id}>
                        <Link
                          to={`/avaliados/${appointment.subject_id}`}
                          className="group flex items-center gap-3 py-3 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                        >
                          <DateTile iso={appointment.starts_at} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium group-hover:underline">
                              {appointment.subjectName}
                            </span>
                            <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                              {appointment.title}
                            </span>
                          </span>
                          <span className="shrink-0 text-right text-sm text-muted-foreground">
                            <span className="block">{relativeDayLabel(appointment.starts_at, now)}</span>
                            <span className="block tabular-nums">
                              {appointmentTimeLabel(appointment.starts_at)}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {upcoming.length > 3 ? (
                    <p className="border-t pt-3 text-sm text-muted-foreground">
                      +{upcoming.length - 3} na agenda.
                    </p>
                  ) : null}
                </section>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {!hasLoadError && apptsQ.isError ? (
        <QueryError
          message="Não foi possível verificar os próximos compromissos."
          onRetry={() => void apptsQ.refetch()}
        />
      ) : null}
    </div>
  )
}

// Data do compromisso em bloco (dia e mês): é a informação que o ícone de
// calendário repetido em toda linha só sugeria.
function DateTile({ iso }: { iso: string }) {
  const date = new Date(iso)
  const mes = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '')
  return (
    <span className="flex w-11 shrink-0 flex-col items-center rounded-md border py-1">
      <span className="text-base leading-tight font-semibold tabular-nums">{date.getDate()}</span>
      <span className="text-xs leading-tight text-muted-foreground">{mes}</span>
    </span>
  )
}

function appointmentTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}
