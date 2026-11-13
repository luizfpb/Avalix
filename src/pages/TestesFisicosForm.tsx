import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { PageTrail } from '../components/PageTrail'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { QueryError } from '../components/QueryError'
import { RecordMismatch } from '../components/RecordMismatch'
import { DecimalInput } from '../components/DecimalInput'
import { useSubjectTrail } from '../lib/subjectTrail'
import { useUnsavedChanges } from '../lib/unsavedChanges'
import { normalizeDbError } from '../lib/errors'
import { ageOnDate } from '../lib/age'
import { controlClass } from '@/lib/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useOrganization } from '../features/organization/context'
import { useSubject } from '../features/subjects/hooks'
import { useActiveConsent } from '../features/consent/hooks'
import { useAssessments } from '../features/assessment/hooks'
import type { Sex } from '../features/assessment/protocols'
import { useCreateFitnessTest, useFitnessTest, useUpdateFitnessTest } from '../features/fitness/hooks'
import type { FitnessTestRow } from '../features/fitness/api'
import { buildMeasures, emptyFields, fieldsFromMeasures, type FitnessFields } from '../features/fitness/form'
import { parseMeasures, TEST_LABELS, type FitnessTestKey } from '../features/fitness/measures'
import { computeFitness, formatResultValue } from '../features/fitness/engine'

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TestesFisicosForm() {
  const { id, testId } = useParams()
  const subjectQuery = useSubject(id)
  const consentQuery = useActiveConsent(id)
  const assessmentsQuery = useAssessments(id)
  const testQuery = useFitnessTest(testId)
  const editing = !!testId

  if (
    subjectQuery.isPending ||
    consentQuery.isPending ||
    (editing && testQuery.isPending) ||
    (!editing && assessmentsQuery.isPending)
  ) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }
  if (subjectQuery.isError || consentQuery.isError || testQuery.isError || !subjectQuery.data) {
    return (
      <QueryError
        message="Não foi possível carregar o aluno ou os testes."
        onRetry={() => void Promise.all([subjectQuery.refetch(), consentQuery.refetch(), testQuery.refetch()])}
      />
    )
  }
  const subject = subjectQuery.data
  if (editing) {
    if (!testQuery.data) {
      return <p className="text-sm text-muted-foreground">Estes testes não existem mais.</p>
    }
    if (testQuery.data.subject_id !== subject.id) {
      return <RecordMismatch what="Este registro de testes" backTo={`/avaliados/${subject.id}`} />
    }
  } else if (!consentQuery.data) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-xl font-semibold">Testes físicos</h1>
        <p className="text-sm text-muted-foreground">É preciso registrar o consentimento antes de registrar testes.</p>
        <Button asChild variant="outline">
          <Link to={`/avaliados/${subject.id}`}>Ir para o cadastro e registrar</Link>
        </Button>
      </div>
    )
  }

  const lastWeight = assessmentsQuery.data?.[0]?.weight_kg ?? null
  return (
    <FitnessForm
      key={testQuery.data?.updated_at ?? 'novo'}
      subjectId={subject.id}
      sex={subject.sex === 'F' ? 'F' : 'M'}
      birthDate={subject.birth_date}
      lastWeight={lastWeight}
      existing={testQuery.data ?? null}
    />
  )
}

function FitnessForm({
  subjectId,
  sex,
  birthDate,
  lastWeight,
  existing,
}: {
  subjectId: string
  sex: Sex
  birthDate: string
  lastWeight: number | null
  existing: FitnessTestRow | null
}) {
  const navigate = useNavigate()
  const trail = useSubjectTrail(subjectId)
  const { organization } = useOrganization()
  const createMut = useCreateFitnessTest(subjectId)
  const updateMut = useUpdateFitnessTest(subjectId, existing?.id)
  const [newId] = useState(() => crypto.randomUUID())

  const initial = useMemo(
    () =>
      existing
        ? { testedAt: existing.tested_at, notes: existing.notes ?? '', fields: fieldsFromMeasures(parseMeasures(existing.measures), sex, null) }
        : { testedAt: todayLocal(), notes: '', fields: emptyFields(sex, lastWeight) },
    [existing, sex, lastWeight]
  )
  const [testedAt, setTestedAt] = useState(initial.testedAt)
  const [notes, setNotes] = useState(initial.notes)
  const [fields, setFields] = useState<FitnessFields>(initial.fields)
  const [showErrors, setShowErrors] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const dirty =
    testedAt !== initial.testedAt || notes !== initial.notes || JSON.stringify(fields) !== JSON.stringify(initial.fields)
  const guard = useUnsavedChanges(dirty)

  const { measures, errors } = buildMeasures(fields)
  const age = ageOnDate(birthDate, testedAt)
  const results = age != null ? computeFitness(measures, sex, age) : []
  const resultOf = (k: FitnessTestKey) => results.find((r) => r.key === k)
  const nothing = Object.keys(measures).length === 0 && Object.keys(errors).length === 0
  const pending = createMut.isPending || updateMut.isPending

  const set = <K extends keyof FitnessFields>(key: K) => (value: FitnessFields[K]) =>
    setFields((f) => ({ ...f, [key]: value }))

  async function handleSave() {
    setSubmitError(null)
    if (Object.keys(errors).length > 0 || nothing) {
      setShowErrors(true)
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(testedAt)) {
      setSubmitError('Informe a data dos testes.')
      return
    }
    try {
      const payload = { testedAt, measures, notes: notes.trim() || null }
      const row = existing
        ? await updateMut.mutateAsync({ input: payload, expectedUpdatedAt: existing.updated_at })
        : await createMut.mutateAsync({ ...payload, orgId: organization?.id ?? '', subjectId, id: newId })
      guard.allowNext()
      navigate(`/avaliados/${subjectId}/testes/${row.id}`)
    } catch (e) {
      setSubmitError(normalizeDbError(e))
    }
  }

  const title = existing ? 'Editar testes físicos' : 'Novos testes físicos'
  const err = (k: FitnessTestKey) => (showErrors || touchedAny(fields, k) ? errors[k] : undefined)

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <PageTrail steps={trail} current={title} />
        <h1 className="mt-2 text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Preencha só os testes que aplicou. O resultado e a classificação aparecem ao lado de cada um.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="testes-data">Data</Label>
          <Input id="testes-data" type="date" value={testedAt} onChange={(e) => setTestedAt(e.target.value)} />
        </div>
        <p className="self-end text-sm text-muted-foreground sm:pb-2">
          {age != null ? `${age} anos na data dos testes · ${sex === 'F' ? 'feminino' : 'masculino'}` : null}
        </p>
      </div>

      <section className="space-y-3" aria-labelledby="grupo-cardio">
        <h2 id="grupo-cardio" className="text-base font-semibold">Cardiorrespiratórios</h2>
        <TestBlock
          k="cooper"
          hint="A maior distância possível em 12 minutos, correndo ou caminhando."
          error={err('cooper')}
          result={resultOf('cooper')}
        >
          <Field id="cooper-distancia" label="Distância (m)">
            <DecimalInput id="cooper-distancia" value={fields.cooperDistance} onValueChange={set('cooperDistance')} />
          </Field>
        </TestBlock>

        <TestBlock
          k="rockport"
          hint="Caminhar 1 milha (1.609 m) o mais rápido possível. Anote o tempo e a frequência cardíaca ao cruzar a chegada."
          error={err('rockport')}
          result={resultOf('rockport')}
        >
          <Field id="rockport-min" label="Minutos">
            <DecimalInput id="rockport-min" value={fields.rockportMin} onValueChange={set('rockportMin')} />
          </Field>
          <Field id="rockport-seg" label="Segundos">
            <DecimalInput id="rockport-seg" value={fields.rockportSec} onValueChange={set('rockportSec')} />
          </Field>
          <Field id="rockport-fc" label="FC final (bpm)">
            <DecimalInput id="rockport-fc" value={fields.rockportHr} onValueChange={set('rockportHr')} />
          </Field>
          <Field id="rockport-peso" label="Peso (kg)">
            <DecimalInput id="rockport-peso" value={fields.rockportWeight} onValueChange={set('rockportWeight')} />
          </Field>
        </TestBlock>

        <TestBlock
          k="queens"
          hint="Subir e descer um banco de 41,3 cm por 3 minutos (24 passos por minuto nos homens, 22 nas mulheres). Conte o pulso de 5 a 20 segundos depois de parar e multiplique por 4."
          error={err('queens')}
          result={resultOf('queens')}
        >
          <Field id="queens-fc" label="FC de recuperação (bpm)">
            <DecimalInput id="queens-fc" value={fields.queensHr} onValueChange={set('queensHr')} />
          </Field>
        </TestBlock>
      </section>

      <section className="space-y-3" aria-labelledby="grupo-neuro">
        <h2 id="grupo-neuro" className="text-base font-semibold">Neuromotores</h2>
        <TestBlock
          k="push_ups"
          hint="Máximo de repetições seguidas, sem pausa. A tabela usa a posição completa para homens e os joelhos apoiados para mulheres."
          error={err('push_ups')}
          result={resultOf('push_ups')}
        >
          <Field id="flexao-reps" label="Repetições">
            <DecimalInput id="flexao-reps" value={fields.pushUpsReps} onValueChange={set('pushUpsReps')} />
          </Field>
          <Field id="flexao-posicao" label="Posição">
            <select
              id="flexao-posicao"
              className={controlClass}
              value={fields.pushUpsKnees ? 'joelhos' : 'completa'}
              onChange={(e) => set('pushUpsKnees')(e.target.value === 'joelhos')}
            >
              <option value="completa">Completa</option>
              <option value="joelhos">Joelhos</option>
            </select>
          </Field>
        </TestBlock>

        <TestBlock k="sit_ups" hint="Repetições completas em 1 minuto." error={err('sit_ups')} result={resultOf('sit_ups')}>
          <Field id="abdominal-reps" label="Repetições">
            <DecimalInput id="abdominal-reps" value={fields.sitUpsReps} onValueChange={set('sitUpsReps')} />
          </Field>
        </TestBlock>

        <TestBlock
          k="sit_and_reach"
          hint="Melhor de duas tentativas, lida na régua do banco. Informe em que marca da régua ficam os pés: a tabela é de banco com os pés no 26."
          error={err('sit_and_reach')}
          result={resultOf('sit_and_reach')}
        >
          <Field id="wells-alcance" label="Melhor alcance (cm)">
            <DecimalInput id="wells-alcance" value={fields.reachBest} onValueChange={set('reachBest')} />
          </Field>
          <Field id="wells-pes" label="Pés na marca de">
            <select
              id="wells-pes"
              className={controlClass}
              value={fields.reachFeet}
              onChange={(e) => set('reachFeet')(e.target.value === '23' ? 23 : 26)}
            >
              <option value={26}>26 cm</option>
              <option value={23}>23 cm</option>
            </select>
          </Field>
        </TestBlock>

        <TestBlock
          k="grip"
          hint="Melhor medida de cada mão no dinamômetro. Uma mão só também vale."
          error={err('grip')}
          result={resultOf('grip')}
        >
          <Field id="preensao-direita" label="Mão direita (kg)">
            <DecimalInput id="preensao-direita" value={fields.gripRight} onValueChange={set('gripRight')} />
          </Field>
          <Field id="preensao-esquerda" label="Mão esquerda (kg)">
            <DecimalInput id="preensao-esquerda" value={fields.gripLeft} onValueChange={set('gripLeft')} />
          </Field>
        </TestBlock>
      </section>

      <div className="space-y-1.5">
        <Label htmlFor="testes-obs">Observações (opcional)</Label>
        <textarea
          id="testes-obs"
          rows={3}
          maxLength={2000}
          className={controlClass}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {showErrors && nothing ? (
        <p role="alert" className="text-sm text-destructive">Preencha ao menos um teste.</p>
      ) : null}
      {showErrors && Object.keys(errors).length > 0 ? (
        <p role="alert" className="text-sm text-destructive">Corrija os testes marcados antes de salvar.</p>
      ) : null}
      {submitError ? <p role="alert" className="text-sm text-destructive">{submitError}</p> : null}

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={pending}>
          {pending ? 'Salvando...' : 'Salvar testes'}
        </Button>
        <Button variant="outline" asChild>
          <Link to={existing ? `/avaliados/${subjectId}/testes/${existing.id}` : `/avaliados/${subjectId}`}>Cancelar</Link>
        </Button>
      </div>

      <ConfirmDialog
        open={guard.blocked}
        title="Sair sem salvar?"
        description="As medidas digitadas nesta tela ainda não foram enviadas e serão perdidas."
        confirmLabel="Sair sem salvar"
        cancelLabel="Continuar editando"
        onConfirm={guard.leave}
        onCancel={guard.stay}
      />
    </div>
  )
}

// O erro de um teste aparece assim que ele tem algo digitado; os testes em
// branco só mostram erro depois de tentar salvar.
function touchedAny(f: FitnessFields, k: FitnessTestKey): boolean {
  const filled = (...v: string[]) => v.some((s) => s.trim() !== '')
  switch (k) {
    case 'cooper':
      return filled(f.cooperDistance)
    case 'rockport':
      return filled(f.rockportMin, f.rockportSec, f.rockportHr)
    case 'queens':
      return filled(f.queensHr)
    case 'push_ups':
      return filled(f.pushUpsReps)
    case 'sit_ups':
      return filled(f.sitUpsReps)
    case 'sit_and_reach':
      return filled(f.reachBest)
    case 'grip':
      return filled(f.gripRight, f.gripLeft)
  }
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

function TestBlock({
  k,
  hint,
  error,
  result,
  children,
}: {
  k: FitnessTestKey
  hint: string
  error: string | undefined
  result: ReturnType<typeof computeFitness>[number] | undefined
  children: ReactNode
}) {
  const errorId = `${k}-erro`
  return (
    <fieldset className="rounded-lg border bg-card p-4 lg:p-5" aria-describedby={error ? errorId : undefined}>
      <legend className="sr-only">{TEST_LABELS[k]}</legend>
      <p className="text-sm font-medium" aria-hidden>
        {TEST_LABELS[k]}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : result ? (
        <p className="mt-2 text-sm" aria-live="polite">
          <span className="text-muted-foreground">{result.valueLabel}: </span>
          <span className="font-medium tabular-nums">{formatResultValue(result)}</span>
          {result.rating ? <span className="text-muted-foreground"> · {result.rating.label}</span> : null}
        </p>
      ) : null}
    </fieldset>
  )
}
