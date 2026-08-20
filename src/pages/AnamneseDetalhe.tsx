import { Link, useParams } from 'react-router'
import { Pencil } from 'lucide-react'
import { useAnamnese } from '../features/anamnesis/hooks'
import { AnamneseResumo } from '../features/anamnesis/AnamneseResumo'
import { parseAnswers } from '../features/anamnesis/parse'
import { useSubject } from '../features/subjects/hooks'
import { useOrganization } from '../features/organization/context'
import { CopyPromptButton } from '../features/prompts/CopyPromptButton'
import { buildAnamnesePrompt } from '../features/prompts'
import { logExport } from '../features/reports/audit'
import { Button } from '@/components/ui/button'

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR')
}

export default function AnamneseDetalhe() {
  const { id, anamneseId } = useParams()
  const query = useAnamnese(anamneseId)
  // o prompt precisa de idade e sexo; o nome entra abreviado
  const subjectQuery = useSubject(id)
  const { organization } = useOrganization()

  if (query.isPending) return <p className="text-sm text-muted-foreground">Carregando...</p>
  if (query.isError || !query.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Não foi possível carregar a anamnese.</p>
        <Button asChild variant="outline">
          <Link to={`/avaliados/${id}`}>Voltar</Link>
        </Button>
      </div>
    )
  }

  const row = query.data
  const a = parseAnswers(row.payload)
  const subject = subjectQuery.data
  // marca de correção: em dado de saúde importa saber que o registro mudou
  // depois de criado (a trilha completa fica em audit_logs)
  const edited = new Date(row.updated_at).getTime() - new Date(row.created_at).getTime() > 60_000

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to={`/avaliados/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← Voltar
          </Link>
          <h1 className="mt-2 text-xl font-semibold">Anamnese de {formatDate(row.assessed_at)}</h1>
          {edited ? (
            <p className="text-sm text-muted-foreground">
              Editada em {formatDateTime(row.updated_at)}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/avaliados/${id}/anamnese/${row.id}/editar`}>
              <Pencil /> Editar
            </Link>
          </Button>
        </div>
      </div>

      {/* O prompt só aparece com o cadastro carregado: sem idade e sexo o
          material sairia incompleto e a análise, enviesada. */}
      {subject ? (
        <CopyPromptButton
          label="Copiar prompt de parecer"
          build={() =>
            buildAnamnesePrompt({
              subject: {
                fullName: subject.full_name,
                birthDate: subject.birth_date,
                sex: subject.sex,
              },
              assessedAt: row.assessed_at,
              answers: a,
            })
          }
          onCopied={() => {
            if (!organization) return
            void logExport({
              orgId: organization.id,
              action: 'AI_SUMMARY',
              tableName: 'anamneses',
              rowId: row.id,
              subjectId: row.subject_id,
            })
          }}
        />
      ) : null}

      <AnamneseResumo answers={a} />
    </div>
  )
}
