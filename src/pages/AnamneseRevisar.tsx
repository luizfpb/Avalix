import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useIntake, useAcceptIntake, useRejectIntake } from '../features/anamnesis/intakeHooks'
import { AnamneseResumo } from '../features/anamnesis/AnamneseResumo'
import { parseAnswers } from '../features/anamnesis/spec'
import { subjectFormSchema, formToInsert, type SubjectFormValues } from '../features/subjects/schema'
import { useSubjects } from '../features/subjects/hooks'
import { useOrganization } from '../features/organization/context'
import { ageFromBirthDate } from '../lib/age'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { normalizeDbError } from '../lib/errors'

function formatDateTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR')
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY' sem passar por Date (evita fuso deslocar o dia)
function formatBirthDate(s: string | undefined): string {
  const [y, m, d] = (s ?? '').split('-')
  return y && m && d ? `${d}/${m}/${y}` : '-'
}

export default function AnamneseRevisar() {
  const { id, intakeId } = useParams()
  const navigate = useNavigate()
  const { organization } = useOrganization()
  const query = useIntake(intakeId)
  const subjectsQuery = useSubjects(organization?.id)
  const accept = useAcceptIntake(id)
  const reject = useRejectIntake(id)
  const [confirmReject, setConfirmReject] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const backTo = id ? `/avaliados/${id}` : '/dashboard'

  if (query.isPending) return <p className="text-sm text-muted-foreground">Carregando...</p>
  if (query.isError || !query.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Não foi possível carregar a resposta.</p>
        <Button asChild variant="outline">
          <Link to={backTo}>Voltar</Link>
        </Button>
      </div>
    )
  }

  const intake = query.data
  const isCadastro = intake.kind === 'cadastro_anamnese'
  // payload pode ser de spec anterior: parseAnswers completa/converte campos
  const answers = intake.payload != null ? parseAnswers(intake.payload) : null
  const registration = intake.registration as unknown as SubjectFormValues | null

  // aviso barato de duplicata: link de cadastro reenviado ou aluno ja existente
  const duplicateName =
    isCadastro && registration?.full_name
      ? (subjectsQuery.data ?? []).find(
          (s) => s.full_name.trim().toLowerCase() === registration.full_name.trim().toLowerCase()
        )
      : undefined

  if (intake.status !== 'submitted' || !answers) {
    const subjectForLink = intake.subject_id ?? intake.resulting_subject_id
    return (
      <div className="max-w-2xl space-y-3">
        <Link to={backTo} className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar
        </Link>
        <p className="text-sm text-muted-foreground">
          {intake.status === 'accepted'
            ? 'Esta resposta já foi aceita.'
            : intake.status === 'rejected'
              ? 'Esta resposta foi recusada.'
              : 'Esta resposta não está mais aguardando revisão.'}
        </p>
        {intake.resulting_anamnese_id && subjectForLink ? (
          <Button asChild variant="outline" size="sm">
            <Link to={`/avaliados/${subjectForLink}/anamnese/${intake.resulting_anamnese_id}`}>
              Ver anamnese
            </Link>
          </Button>
        ) : null}
      </div>
    )
  }

  async function handleAccept() {
    setError(null)
    try {
      let subject
      if (isCadastro) {
        // o cadastro veio do aluno: revalida com o MESMO zod do cadastro manual
        // antes de criar o avaliado (a RPC e as constraints são a rede final)
        const parsed = subjectFormSchema.safeParse(registration ?? {})
        if (!parsed.success) {
          setError(
            'O cadastro enviado está incompleto ou inválido. Recuse esta resposta e gere um novo link.'
          )
          return
        }
        if (!organization) return
        subject = formToInsert(parsed.data, organization.id)
      }
      const res = await accept.mutateAsync({ intakeId: intake.id, answers: answers!, subject })
      navigate(`/avaliados/${res.subjectId}/anamnese/${res.anamneseId}`)
    } catch (e) {
      setError(normalizeDbError(e))
    }
  }

  async function handleReject() {
    setError(null)
    try {
      await reject.mutateAsync(intake.id)
      navigate(backTo)
    } catch (e) {
      setError(normalizeDbError(e))
    }
  }

  const busy = accept.isPending || reject.isPending

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link to={backTo} className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar
        </Link>
        <h1 className="mt-2 text-xl font-semibold">
          {isCadastro ? 'Revisar cadastro e anamnese' : 'Revisar resposta do aluno'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enviada em {formatDateTime(intake.submitted_at)}.{' '}
          {isCadastro
            ? 'Ao aceitar, o aluno é cadastrado, o consentimento é registrado e a anamnese passa a valer oficialmente.'
            : 'Ao aceitar, o consentimento é registrado e a anamnese passa a valer oficialmente.'}
        </p>
      </div>

      {isCadastro && registration ? (
        <Card>
          <CardContent className="space-y-2 py-4 text-sm">
            <h2 className="text-base font-semibold">Cadastro preenchido pelo aluno</h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              <Item label="Nome" value={registration.full_name} />
              <Item
                label="Nascimento"
                value={`${formatBirthDate(registration.birth_date)}${(() => {
                  const age = ageFromBirthDate(registration.birth_date ?? '')
                  return age !== null ? ` (${age} anos)` : ''
                })()}`}
              />
              <Item label="Sexo" value={registration.sex === 'F' ? 'Feminino' : 'Masculino'} />
              <Item label="Altura" value={registration.height_cm ? `${registration.height_cm} cm` : '-'} />
              <Item label="Telefone" value={registration.phone || '-'} />
              <Item label="E-mail" value={registration.email || '-'} />
              {registration.guardian_name ? (
                <Item
                  label="Responsável legal"
                  value={`${registration.guardian_name}${registration.guardian_relationship ? ` (${registration.guardian_relationship})` : ''}`}
                />
              ) : null}
            </dl>
            <p className="text-xs text-muted-foreground">
              Depois de aceitar, você pode ajustar qualquer campo na edição do cadastro.
            </p>
            {duplicateName ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                Já existe um cadastro com este nome (
                <Link to={`/avaliados/${duplicateName.id}`} className="font-medium text-primary hover:underline">
                  ver cadastro
                </Link>
                ). Se for a mesma pessoa, recuse esta resposta e envie o link de anamnese pelo perfil
                existente.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

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
          {accept.isPending ? 'Aceitando...' : isCadastro ? 'Aceitar e cadastrar' : 'Aceitar e registrar'}
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

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 break-words font-medium">{value}</dd>
    </div>
  )
}
