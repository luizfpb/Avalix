import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useOrganization } from '../features/organization/context'
import { useSubject } from '../features/subjects/hooks'
import { useActiveConsent } from '../features/consent/hooks'
import { useCreateAnamnese } from '../features/anamnesis/hooks'
import { computeGate } from '../features/anamnesis/gate'
import { AnamneseCamadaA, AnamneseCamadaB, GateBox } from '../features/anamnesis/AnamneseForm'
import { emptyAnamnesis, PARQ_ITEMS, type AnamnesisAnswers } from '../features/anamnesis/spec'
import type { SubjectRow } from '../features/subjects/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { normalizeDbError } from '../lib/errors'

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AnamneseNova() {
  const { id } = useParams()
  const subjectQuery = useSubject(id)
  const consentQuery = useActiveConsent(id)

  if (subjectQuery.isPending || consentQuery.isPending) {
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
        <h1 className="text-xl font-semibold">Nova anamnese</h1>
        <p className="text-sm text-muted-foreground">
          É preciso registrar o consentimento do avaliado antes de coletar dados de saúde.
        </p>
        <Button asChild variant="outline">
          <Link to={`/avaliados/${subjectQuery.data.id}`}>Ir para o cadastro e registrar</Link>
        </Button>
      </div>
    )
  }

  return <Form subject={subjectQuery.data} />
}

function Form({ subject }: { subject: SubjectRow }) {
  const { organization } = useOrganization()
  const navigate = useNavigate()
  const createMut = useCreateAnamnese(subject.id)
  const isFemale = subject.sex === 'F'

  const [assessedAt, setAssessedAt] = useState(todayLocal)
  const [a, setA] = useState<AnamnesisAnswers>(emptyAnamnesis)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function set(patch: Partial<AnamnesisAnswers>) {
    setA((prev) => ({ ...prev, ...patch }))
  }

  const gate = computeGate(a)
  const parqComplete = PARQ_ITEMS.every((i) => a.parq[i.key] !== null)
  const canSave = parqComplete && a.declaracao_veracidade && a.consentimento_lgpd && !!organization

  async function handleSave() {
    setSubmitError(null)
    if (!organization) return
    if (!parqComplete) return setSubmitError('Responda todos os itens da triagem (Camada A).')
    if (!a.declaracao_veracidade || !a.consentimento_lgpd) {
      return setSubmitError('Confirme a declaração de veracidade e o consentimento.')
    }
    try {
      const row = await createMut.mutateAsync({
        orgId: organization.id,
        subjectId: subject.id,
        assessedAt,
        answers: a,
      })
      navigate(`/avaliados/${subject.id}/anamnese/${row.id}`)
    } catch (e) {
      setSubmitError(normalizeDbError(e))
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          to={`/avaliados/${subject.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {subject.full_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Anamnese e triagem</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Triagem de prontidão baseada no PAR-Q+ e nas diretrizes de pré-participação do ACSM
          (redação própria). É triagem de segurança — não substitui avaliação médica.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Data da anamnese</Label>
          <Input type="date" value={assessedAt} onChange={(e) => setAssessedAt(e.target.value)} />
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

      {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={!canSave || createMut.isPending}>
          {createMut.isPending ? 'Salvando...' : 'Salvar anamnese'}
        </Button>
        <Button variant="outline" asChild>
          <Link to={`/avaliados/${subject.id}`}>Cancelar</Link>
        </Button>
      </div>
    </div>
  )
}
