import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ScrollText, Bug, ChevronLeft, ChevronRight } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import {
  AUDIT_PAGE_SIZE,
  clearClientErrors,
  listAuditLogs,
  listClientErrors,
  listProfileNames,
} from '../features/reports/audit'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { normalizeDbError } from '../lib/errors'

// Visualizador da trilha de auditoria + erros de runtime (P5 da auditoria
// v2.0). A trilha sempre existiu (audit_logs, imutável), mas só era legível
// via SQL — auditoria que ninguém lê não demonstra nada. RLS: owner/admin.

const ACTION_LABELS: Record<string, string> = {
  INSERT: 'criou',
  UPDATE: 'alterou',
  DELETE: 'excluiu',
  EXPORT_CSV: 'exportou CSV',
  EXPORT_JSON: 'exportou JSON',
  PDF_REPORT: 'gerou PDF',
  AI_SUMMARY: 'gerou resumo IA',
  SHARE_GOOGLE_CALENDAR: 'abriu no Google Agenda',
  SHARE_ICS: 'exportou calendário',
  SHARE_WHATSAPP: 'compartilhou pelo WhatsApp',
  SUBJECT_EXPORT: 'exportou todos os dados do avaliado',
}

const TABLE_LABELS: Record<string, string> = {
  subjects: 'avaliado',
  assessments: 'avaliação',
  posture_sessions: 'sessão postural',
  posture_photos: 'foto postural',
  consent_records: 'consentimento',
  anamneses: 'anamnese',
  anamnese_intakes: 'link de anamnese',
  workout_plans: 'plano de treino',
  workout_logs: 'treino registrado',
  appointments: 'agendamento',
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR')
}

export default function Auditoria() {
  const { organization, role } = useOrganization()
  const canView = role === 'owner' || role === 'admin'

  if (!canView) {
    return (
      <div className="space-y-3">
        <Link to="/configuracoes" className="text-sm text-muted-foreground hover:text-foreground">
          ← Configurações
        </Link>
        <h1 className="text-xl font-semibold">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          A trilha de auditoria é visível apenas para donos e administradores da organização.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link to="/configuracoes" className="text-sm text-muted-foreground hover:text-foreground">
          ← Configurações
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Auditoria</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quem fez o quê e quando. A trilha é imutável — nem administradores conseguem editar ou
          apagar eventos.
        </p>
      </div>

      {organization ? <AuditTrail orgId={organization.id} /> : null}
      {organization ? <ErrorsCard orgId={organization.id} /> : null}
    </div>
  )
}

function AuditTrail({ orgId }: { orgId: string }) {
  const [page, setPage] = useState(0)
  const query = useQuery({
    queryKey: ['audit-logs', orgId, page],
    queryFn: () => listAuditLogs(orgId, page),
  })

  const rows = useMemo(() => query.data?.rows ?? [], [query.data])
  const total = query.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE))

  const userIds = useMemo(
    () => [...new Set(rows.map((r) => r.user_id).filter((u): u is string => !!u))],
    [rows]
  )
  const namesQuery = useQuery({
    queryKey: ['audit-profiles', userIds.sort().join('|')],
    queryFn: () => listProfileNames(userIds),
    enabled: userIds.length > 0,
  })
  const names = namesQuery.data ?? {}

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="size-4 text-muted-foreground" /> Trilha de eventos
        </CardTitle>
        <CardDescription>
          {total} {total === 1 ? 'evento' : 'eventos'} registrados
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isPending ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : query.isError ? (
          <p className="text-sm text-destructive">{normalizeDbError(query.error)}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento ainda.</p>
        ) : (
          <ul className="divide-y rounded-md border bg-card text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2">
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatDateTime(r.at)}
                </span>
                <span className="font-medium">
                  {r.user_id ? (names[r.user_id] ?? 'membro') : 'aluno (via link)'}
                </span>
                <span>{ACTION_LABELS[r.action] ?? r.action.toLowerCase()}</span>
                <span className="text-muted-foreground">
                  {TABLE_LABELS[r.table_name] ?? r.table_name}
                </span>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 ? (
          <div className="flex items-center justify-between text-sm">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft /> Mais recentes
            </Button>
            <span className="text-xs text-muted-foreground">
              página {page + 1} de {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Mais antigos <ChevronRight />
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ErrorsCard({ orgId }: { orgId: string }) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['client-errors', orgId],
    queryFn: () => listClientErrors(orgId),
  })
  const clearMut = useMutation({
    mutationFn: () => clearClientErrors(orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-errors', orgId] }),
  })
  const [confirmClear, setConfirmClear] = useState(false)
  const rows = query.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bug className="size-4 text-muted-foreground" /> Erros do aplicativo
        </CardTitle>
        <CardDescription>
          Erros de runtime registrados pelos dispositivos dos membros — útil pra reportar problemas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isPending ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : query.isError ? (
          <p className="text-sm text-destructive">{normalizeDbError(query.error)}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum erro registrado. Bom sinal.</p>
        ) : (
          <>
            <ul className="divide-y rounded-md border bg-card text-sm">
              {rows.map((r) => (
                <li key={r.id} className="space-y-0.5 px-3 py-2">
                  <p className="break-words font-medium">{r.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(r.at)}
                    {r.url ? ` · ${r.url}` : ''}
                  </p>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmClear(true)}
              disabled={clearMut.isPending}
            >
              {clearMut.isPending ? 'Limpando...' : 'Limpar erros'}
            </Button>
            <ConfirmDialog
              open={confirmClear}
              title="Limpar os erros registrados?"
              description="A lista de erros do aplicativo será esvaziada. A trilha de auditoria não é afetada."
              confirmLabel="Limpar"
              onConfirm={() => {
                setConfirmClear(false)
                clearMut.mutate()
              }}
              onCancel={() => setConfirmClear(false)}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
