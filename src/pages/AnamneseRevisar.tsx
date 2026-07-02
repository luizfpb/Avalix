import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useIntake, useAcceptIntake, useRejectIntake } from '../features/anamnesis/intakeHooks'
import { AnamneseResumo } from '../features/anamnesis/AnamneseResumo'
import type { AnamnesisAnswers } from '../features/anamnesis/spec'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { normalizeDbError } from '../lib/errors'

function formatDateTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR')
}

export default function AnamneseRevisar() {
  const { id, intakeId } = useParams()
  const navigate = useNavigate()
  const query = useIntake(intakeId)
  const accept = useAcceptIntake(id)
  const reject = useRejectIntake(id)
  const [confirmReject, setConfirmReject] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (query.isPending) return <p className="text-sm text-muted-foreground">Carregando...</p>
  if (query.isError || !query.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Não foi possível carregar a resposta.</p>
        <Button asChild variant="outline">
          <Link to={`/avaliados/${id}`}>Voltar</Link>
        </Button>
      </div>
    )
  }

  const intake = query.data
  const answers = intake.payload as unknown as AnamnesisAnswers | null

  if (intake.status !== 'submitted' || !answers) {
    return (
      <div className="max-w-2xl space-y-3">
        <Link to={`/avaliados/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar
        </Link>
        <p className="text-sm text-muted-foreground">
          {intake.status === 'accepted'
            ? 'Esta resposta já foi aceita.'
            : intake.status === 'rejected'
              ? 'Esta resposta foi recusada.'
              : 'Esta resposta não está mais aguardando revisão.'}
        </p>
        {intake.resulting_anamnese_id ? (
          <Button asChild variant="outline" size="sm">
            <Link to={`/avaliados/${id}/anamnese/${intake.resulting_anamnese_id}`}>Ver anamnese</Link>
          </Button>
        ) : null}
      </div>
    )
  }

  async function handleAccept() {
    setError(null)
    try {
      const anamneseId = await accept.mutateAsync({ intakeId: intake.id, answers: answers! })
      navigate(`/avaliados/${id}/anamnese/${anamneseId}`)
    } catch (e) {
      setError(normalizeDbError(e))
    }
  }

  async function handleReject() {
    setError(null)
    try {
      await reject.mutateAsync(intake.id)
      navigate(`/avaliados/${id}`)
    } catch (e) {
      setError(normalizeDbError(e))
    }
  }

  const busy = accept.isPending || reject.isPending

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link to={`/avaliados/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Revisar resposta do aluno</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enviada em {formatDateTime(intake.submitted_at)}. Ao aceitar, o consentimento é registrado
          e a anamnese passa a valer oficialmente.
        </p>
      </div>

      <Card>
        <CardContent className="py-4 text-sm">
          <p className="text-muted-foreground">
            Consentimento aceito por <span className="text-foreground">{intake.signer_name}</span> (
            {intake.signer_kind === 'responsavel' ? 'responsável legal' : 'o próprio titular'}) ·
            versão {intake.consent_version}
          </p>
        </CardContent>
      </Card>

      <AnamneseResumo answers={answers} />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleAccept} disabled={busy}>
          {accept.isPending ? 'Aceitando...' : 'Aceitar e registrar'}
        </Button>
        {confirmReject ? (
          <>
            <Button variant="destructive" onClick={handleReject} disabled={busy}>
              {reject.isPending ? 'Recusando...' : 'Confirmar recusa'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmReject(false)} disabled={busy}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => setConfirmReject(true)} disabled={busy}>
            Recusar
          </Button>
        )}
      </div>
    </div>
  )
}
