import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useOrganization } from '../features/organization/context'
import { useSubject } from '../features/subjects/hooks'
import { useActiveConsent } from '../features/consent/hooks'
import { useAnamnese, useCreateAnamnese, useUpdateAnamnese } from '../features/anamnesis/hooks'
import { computeGate } from '../features/anamnesis/gate'
import { AnamneseCamadaA, AnamneseCamadaB, GateBox } from '../features/anamnesis/AnamneseForm'
import { parseAnswers } from '../features/anamnesis/parse'
import { emptyAnamnesis, type AnamnesisAnswers } from '../features/anamnesis/spec'
import type { AnamneseRow } from '../features/anamnesis/api'
import type { SubjectRow } from '../features/subjects/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { normalizeDbError } from '../lib/errors'
import { clearDraft, useFormDraft } from '../lib/draft'

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AnamneseNova() {
  const { id, anamneseId } = useParams()
  const isEdit = !!anamneseId
  const subjectQuery = useSubject(id)
  const consentQuery = useActiveConsent(id)
  const anamneseQuery = useAnamnese(anamneseId)

  if (subjectQuery.isPending || consentQuery.isPending || (isEdit && anamneseQuery.isPending)) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }
  if (subjectQuery.isError || !subjectQuery.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Não foi possível carregar o avaliado.</p>
        <Button asChild variant="outline">
          <Link to="/avaliados">Voltar</Link>
        </Button>
      </div>
    )
  }
  if (!consentQuery.data) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-xl font-semibold">
          {isEdit ? 'Editar anamnese e triagem' : 'Nova anamnese'}
        </h1>
        <p className="text-sm text-muted-foreground">
          É preciso ter consentimento vigente do avaliado para registrar ou editar dados de saúde.
        </p>
        <Button asChild variant="outline">
          <Link to={`/avaliados/${subjectQuery.data.id}`}>Ir para o cadastro e registrar</Link>
        </Button>
      </div>
    )
  }
  // subject_id conferido de propósito: a URL traz avaliado e anamnese soltos e,
  // dentro da mesma organizacao, a RLS deixaria editar a anamnese de outro
  // aluno por link montado errado.
  if (isEdit && (!anamneseQuery.data || anamneseQuery.data.subject_id !== subjectQuery.data.id)) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Não foi possível carregar a anamnese.</p>
        <Button asChild variant="outline">
          <Link to={`/avaliados/${subjectQuery.data.id}`}>Voltar</Link>
        </Button>
      </div>
    )
  }

  // key força remontar o formulário ao trocar de anamnese/rota (o estado
  // inicial vem de useState e não acompanharia a mudança de props)
  return (
    <Form
      key={anamneseQuery.data?.id ?? 'nova'}
      subject={subjectQuery.data}
      existing={isEdit ? (anamneseQuery.data ?? undefined) : undefined}
    />
  )
}

function Form({ subject, existing }: { subject: SubjectRow; existing?: AnamneseRow }) {
  const { organization } = useOrganization()
  const navigate = useNavigate()
  const isEdit = !!existing
  const createMut = useCreateAnamnese(subject.id)
  const updateMut = useUpdateAnamnese(subject.id, existing?.id)
  const mut = isEdit ? updateMut : createMut
  const isFemale = subject.sex === 'F'

  const [assessedAt, setAssessedAt] = useState(() => existing?.assessed_at ?? todayLocal())
  // payload pode ser de spec anterior: parseAnswers completa/converte campos
  const [a, setA] = useState<AnamnesisAnswers>(() =>
    existing ? parseAnswers(existing.payload) : emptyAnamnesis()
  )
  const [submitError, setSubmitError] = useState<string | null>(null)

  // rascunho local (P4): anamnese é formulário longo; refresh não pode perder.
  // Só no modo criar — editando, o servidor é a fonte de verdade.
  const draftKey = isEdit ? null : `anamnese:${subject.id}`
  const draft = useFormDraft<{ assessedAt: string; a: AnamnesisAnswers }>(
    draftKey,
    { assessedAt, a },
    (d) => {
      setAssessedAt(d.assessedAt)
      setA({ ...emptyAnamnesis(), ...d.a })
    }
  )

  function set(patch: Partial<AnamnesisAnswers>) {
    setA((prev) => ({ ...prev, ...patch }))
  }

  const gate = computeGate(a)
  const gateComplete = gate.status !== 'incompleto'
  const canSave = gateComplete && a.declaracao_veracidade && a.consentimento_lgpd && !!organization

  async function handleSave() {
    setSubmitError(null)
    if (!organization) return
    if (!gateComplete) {
      return setSubmitError('Responda todos os itens da triagem, incluindo as confirmações da seção A2.')
    }
    if (!a.declaracao_veracidade || !a.consentimento_lgpd) {
      return setSubmitError('Confirme a declaração de veracidade e o consentimento.')
    }
    try {
      const row = existing
        ? await updateMut.mutateAsync({ assessedAt, answers: a })
        : await createMut.mutateAsync({
            orgId: organization.id,
            subjectId: subject.id,
            assessedAt,
            answers: a,
          })
      if (draftKey) clearDraft(draftKey)
      navigate(`/avaliados/${subject.id}/anamnese/${row.id}`)
    } catch (e) {
      setSubmitError(normalizeDbError(e))
    }
  }

  const backTo = existing
    ? `/avaliados/${subject.id}/anamnese/${existing.id}`
    : `/avaliados/${subject.id}`

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link to={backTo} className="text-sm text-muted-foreground hover:text-foreground">
          ← {isEdit ? 'Voltar' : subject.full_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {isEdit ? 'Editar anamnese e triagem' : 'Anamnese e triagem'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Triagem de prontidão baseada no PAR-Q+ e nas diretrizes de pré-participação do ACSM
          (redação própria). É triagem de segurança — não substitui avaliação médica.
        </p>
        {isEdit ? (
          <p className="mt-2 text-sm text-muted-foreground">
            As alterações corrigem esta anamnese e recalculam a triagem. Para registrar uma
            reavaliação sem apagar o histórico, use “Nova anamnese” no perfil do avaliado.
          </p>
        ) : null}
      </div>

      {draft.restored ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <span>Rascunho não salvo recuperado — continue de onde parou.</span>
          <button
            type="button"
            onClick={draft.dismiss}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fechar aviso de rascunho"
          >
            ✕
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="anamnesis-date">Data da anamnese</Label>
          <Input id="anamnesis-date" type="date" value={assessedAt} onChange={(e) => setAssessedAt(e.target.value)} />
        </div>
      </div>

      <AnamneseCamadaA a={a} set={set} />
      <GateBox gate={gate} />
      <AnamneseCamadaB a={a} set={set} isFemale={isFemale} />

      <div className="space-y-2 rounded-md border p-4">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={a.declaracao_veracidade} onChange={(e) => set({ declaracao_veracidade: e.target.checked })} />
          Declaro que as informações fornecidas são verdadeiras.
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={a.consentimento_lgpd} onChange={(e) => set({ consentimento_lgpd: e.target.checked })} />
          Confirmo o consentimento para o tratamento dos dados de saúde (LGPD).
        </label>
      </div>

      {submitError ? <p role="alert" className="text-sm text-destructive">{submitError}</p> : null}

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={!canSave || mut.isPending}>
          {mut.isPending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Salvar anamnese'}
        </Button>
        <Button variant="outline" asChild>
          <Link to={backTo}>Cancelar</Link>
        </Button>
      </div>
    </div>
  )
}
