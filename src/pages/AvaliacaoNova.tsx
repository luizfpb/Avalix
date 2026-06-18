import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Pill, Plus, Trash2 } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import { useSubject } from '../features/subjects/hooks'
import { useActiveConsent } from '../features/consent/hooks'
import { useCreateAssessment } from '../features/assessment/hooks'
import type { SubjectRow } from '../features/subjects/api'
import {
  listProtocols,
  type CircumferenceSite,
  type ProtocolInput,
  type Sex,
  type SkinfoldSite,
} from '../features/assessment/protocols'
import {
  SKINFOLD_LABELS,
  CIRCUMFERENCE_CATALOG,
  circumferenceLabel,
  meanReading,
} from '../features/assessment/sites'
import { buildAssessmentResult, type AssessmentResultSnapshot } from '../features/assessment/result'
import type {
  NewCircumferenceReading,
  NewSkinfoldReading,
} from '../features/assessment/api'
import { ageFromBirthDate } from '../lib/age'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'

const controlClass =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function asSex(s: string): Sex {
  return s === 'F' ? 'F' : 'M'
}

export default function AvaliacaoNova() {
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
        <h1 className="text-xl font-semibold">Nova avaliação</h1>
        <p className="text-sm text-muted-foreground">
          É preciso registrar o consentimento do avaliado antes de criar avaliações.
        </p>
        <Button asChild variant="outline">
          <Link to={`/avaliados/${subjectQuery.data.id}`}>Ir para o cadastro e registrar</Link>
        </Button>
      </div>
    )
  }

  return <Form subject={subjectQuery.data} />
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="block text-base font-semibold">{value}</span>
    </div>
  )
}

type CustomCirc = { site: string; value: string }

function CircumferencesCard({
  values,
  onChange,
  neededCircs,
  custom,
  setCustom,
}: {
  values: Record<string, string>
  onChange: (key: string, v: string) => void
  neededCircs: CircumferenceSite[]
  custom: CustomCirc[]
  setCustom: (updater: (prev: CustomCirc[]) => CustomCirc[]) => void
}) {
  const needed = new Set<string>(neededCircs)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Circunferências (cm)</CardTitle>
        <CardDescription>
          Opcionais — registre quantas quiser para acompanhar a evolução.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {CIRCUMFERENCE_CATALOG.map((group) => (
          <div key={group.group} className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{group.group}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {group.items.map((item) => (
                <Field key={item.key} label={needed.has(item.key) ? `${item.label} *` : item.label}>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={values[item.key] ?? ''}
                    onChange={(e) => onChange(item.key, e.target.value)}
                  />
                </Field>
              ))}
            </div>
          </div>
        ))}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Outras (personalizadas)</p>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => setCustom((p) => [...p, { site: '', value: '' }])}
            >
              <Plus /> Adicionar
            </Button>
          </div>
          {custom.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="Nome (ex.: Tornozelo D)"
                value={c.site}
                onChange={(e) =>
                  setCustom((p) => p.map((x, idx) => (idx === i ? { ...x, site: e.target.value } : x)))
                }
              />
              <Input
                className="w-24"
                type="number"
                inputMode="decimal"
                placeholder="cm"
                value={c.value}
                onChange={(e) =>
                  setCustom((p) => p.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)))
                }
              />
              <button
                type="button"
                onClick={() => setCustom((p) => p.filter((_, idx) => idx !== i))}
                className="text-destructive"
                title="Remover"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>

        {neededCircs.length > 0 ? (
          <p className="text-xs text-muted-foreground">* necessário para o protocolo selecionado.</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Form({ subject }: { subject: SubjectRow }) {
  const { organization } = useOrganization()
  const navigate = useNavigate()
  const createMut = useCreateAssessment(subject.id)
  const sex = asSex(subject.sex)
  const protocols = listProtocols(sex)

  const [assessedAt, setAssessedAt] = useState(todayLocal)
  const [protocolId, setProtocolId] = useState(() => protocols[0]?.id ?? '')
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState(() =>
    subject.height_cm != null ? String(subject.height_cm) : ''
  )
  const [medications, setMedications] = useState('')
  const [notes, setNotes] = useState('')
  const [skinfolds, setSkinfolds] = useState<Record<string, [string, string, string]>>({})
  const [circumferences, setCircumferences] = useState<Record<string, string>>({})
  const [customCircs, setCustomCircs] = useState<{ site: string; value: string }[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)

  const protocol = protocols.find((p) => p.id === protocolId) ?? protocols[0]
  const neededCircs: CircumferenceSite[] = (protocol?.circumferenceSites ?? []).filter(
    (c) => c !== 'hip' || sex === 'F'
  )

  const weightKg = Number(weight)
  const heightCm = Number(height)
  const ageYears = ageFromBirthDate(subject.birth_date, new Date(`${assessedAt}T00:00:00`))

  function trioOf(site: string): [string, string, string] {
    return skinfolds[site] ?? ['', '', '']
  }
  function setSkinfold(site: string, idx: number, value: string) {
    setSkinfolds((prev) => {
      const trio = [...trioOf(site)] as [string, string, string]
      trio[idx] = value
      return { ...prev, [site]: trio }
    })
  }

  function currentInput(): ProtocolInput {
    const skinfoldsMm: Partial<Record<SkinfoldSite, number>> = {}
    for (const site of protocol?.skinfoldSites ?? []) {
      const m = meanReading(trioOf(site).map(Number))
      if (m != null) skinfoldsMm[site] = m
    }
    const circumferencesCm: Partial<Record<CircumferenceSite, number>> = {}
    for (const site of neededCircs) {
      const v = Number(circumferences[site])
      if (v > 0) circumferencesCm[site] = v
    }
    return { sex, ageYears: ageYears ?? 0, heightCm, skinfoldsMm, circumferencesCm }
  }

  function currentResult(): AssessmentResultSnapshot | null {
    if (!protocol || ageYears == null || !(weightKg > 0) || !(heightCm > 0)) return null
    try {
      return buildAssessmentResult(protocol.id, currentInput(), weightKg)
    } catch {
      return null
    }
  }
  const result = currentResult()

  async function handleSave() {
    setSubmitError(null)
    if (!organization || !protocol) return
    if (ageYears == null) return setSubmitError('Data de avaliação inválida.')
    if (!(weightKg >= 20 && weightKg <= 400)) return setSubmitError('Peso deve estar entre 20 e 400 kg.')
    if (!(heightCm >= 50 && heightCm <= 250)) return setSubmitError('Altura deve estar entre 50 e 250 cm.')

    const skinfoldRows: NewSkinfoldReading[] = []
    for (const site of protocol.skinfoldSites) {
      const nums = trioOf(site).map(Number).filter((n) => n > 0)
      if (nums.length === 0) continue
      if (nums.some((n) => n < 1 || n > 99)) {
        return setSubmitError(`Dobra ${SKINFOLD_LABELS[site as SkinfoldSite]} deve estar entre 1 e 99 mm.`)
      }
      skinfoldRows.push({
        site,
        reading_1: nums[0],
        reading_2: nums[1] ?? null,
        reading_3: nums[2] ?? null,
      })
    }

    const circRows: NewCircumferenceReading[] = []
    // todas as circunferências do catálogo que foram preenchidas (não só as do
    // protocolo) — pra acompanhar a evolução
    for (const [site, raw] of Object.entries(circumferences)) {
      const v = Number(raw)
      if (!(v > 0)) continue
      if (v < 10 || v > 250) {
        return setSubmitError(`Circunferência ${circumferenceLabel(site)} deve estar entre 10 e 250 cm.`)
      }
      circRows.push({ site, value_cm: v })
    }
    // customizadas (texto livre)
    const seen = new Set(circRows.map((c) => c.site))
    for (const c of customCircs) {
      const name = c.site.trim()
      const v = Number(c.value)
      if (!name || !(v > 0)) continue
      if (seen.has(name)) return setSubmitError(`Circunferência "${name}" está duplicada.`)
      if (v < 10 || v > 250) {
        return setSubmitError(`Circunferência "${name}" deve estar entre 10 e 250 cm.`)
      }
      seen.add(name)
      circRows.push({ site: name, value_cm: v, is_custom: true })
    }

    const snapshot = currentResult()
    if (!snapshot) return setSubmitError('Preencha as medidas necessárias para o protocolo escolhido.')

    try {
      const assessment = await createMut.mutateAsync({
        orgId: organization.id,
        subjectId: subject.id,
        assessedAt,
        protocolId: protocol.id,
        weightKg,
        heightCm,
        medications: medications.trim() || null,
        notes: notes.trim() || null,
        result: snapshot,
        skinfolds: skinfoldRows,
        circumferences: circRows,
      })
      navigate(`/avaliados/${subject.id}/avaliacoes/${assessment.id}`)
    } catch (e) {
      setSubmitError((e as Error).message)
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
        <h1 className="mt-2 text-xl font-semibold">Nova avaliação</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Data">
          <Input type="date" value={assessedAt} onChange={(e) => setAssessedAt(e.target.value)} />
        </Field>
        <Field label="Protocolo">
          <select
            className={controlClass}
            value={protocolId}
            onChange={(e) => setProtocolId(e.target.value)}
          >
            {protocols.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Peso (kg)">
          <Input
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </Field>
        <Field label="Altura (cm)">
          <Input
            type="number"
            inputMode="decimal"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </Field>
      </div>

      {protocol?.kind === 'skinfold' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dobras cutâneas (mm)</CardTitle>
            <CardDescription>Até 3 aferições por ponto; usamos a média.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {protocol.skinfoldSites.map((site) => {
              const trio = trioOf(site)
              const mean = meanReading(trio.map(Number))
              return (
                <div
                  key={site}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <Label className="w-28 text-sm">{SKINFOLD_LABELS[site]}</Label>
                  <div className="flex items-center gap-2">
                    {[0, 1, 2].map((i) => (
                      <Input
                        key={i}
                        type="number"
                        inputMode="decimal"
                        className="w-16"
                        value={trio[i]}
                        onChange={(e) => setSkinfold(site, i, e.target.value)}
                      />
                    ))}
                    <span className="w-16 text-right text-xs text-muted-foreground">
                      {mean != null ? `méd ${mean.toFixed(1)}` : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ) : null}

      <CircumferencesCard
        values={circumferences}
        onChange={(key, v) => setCircumferences((prev) => ({ ...prev, [key]: v }))}
        neededCircs={neededCircs}
        custom={customCircs}
        setCustom={setCustomCircs}
      />

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultado</CardTitle>
            <CardDescription>
              {protocol?.label} · motor {result.engineVersion}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="% Gordura" value={`${result.bodyFatPct.toFixed(1)}%`} />
            {result.bodyDensity != null ? (
              <Stat label="Densidade" value={result.bodyDensity.toFixed(4)} />
            ) : null}
            <Stat label="Massa gorda" value={`${result.fatMassKg.toFixed(1)} kg`} />
            <Stat label="Massa magra" value={`${result.leanMassKg.toFixed(1)} kg`} />
            {result.conversions ? (
              <p className="col-span-2 text-xs text-muted-foreground sm:col-span-4">
                Siri {result.conversions.siri.toFixed(1)}% · Brozek{' '}
                {result.conversions.brozek.toFixed(1)}% (principal: Siri)
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Preencha peso, altura e as medidas do protocolo para ver o resultado.
        </p>
      )}

      <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-400/30 dark:bg-amber-400/10">
        <Label className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
          <Pill className="size-4" /> Medicamentos em uso
        </Label>
        <textarea
          rows={2}
          className={controlClass}
          value={medications}
          onChange={(e) => setMedications(e.target.value)}
          placeholder="Liste os medicamentos que o avaliado usa atualmente. Deixe em branco se não usa."
        />
        <p className="text-xs text-amber-700/80 dark:text-amber-300/70">
          Importante para interpretar os resultados (ex.: medicação que afeta peso ou retenção).
        </p>
      </div>

      <Field label="Observações (opcional)">
        <textarea
          rows={3}
          className={controlClass}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={createMut.isPending || !result}>
          {createMut.isPending ? 'Salvando...' : 'Salvar avaliação'}
        </Button>
        <Button variant="outline" asChild>
          <Link to={`/avaliados/${subject.id}`}>Cancelar</Link>
        </Button>
      </div>
    </div>
  )
}
