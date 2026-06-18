import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useOrganization } from '../features/organization/context'
import { useSubject } from '../features/subjects/hooks'
import { useActiveConsent } from '../features/consent/hooks'
import { useCreateAnamnese } from '../features/anamnesis/hooks'
import { computeGate, NIVEL_LABEL } from '../features/anamnesis/gate'
import {
  emptyAnamnesis,
  PARQ_ITEMS,
  DOENCA_CMR,
  SINAIS_SINTOMAS,
  INTENSIDADE,
  OBJETIVOS,
  EXPERIENCIA,
  DOENCAS_CRONICAS,
  REGIAO_DOR,
  TEMPO_EVOLUCAO,
  RED_FLAGS,
  TABAGISMO,
  ALCOOL,
  SONO_QUALIDADE,
  ESTRESSE,
  LADO_DOMINANTE,
  ALTERACAO_POSTURAL,
  type AnamnesisAnswers,
  type Option,
} from '../features/anamnesis/spec'
import type { SubjectRow } from '../features/subjects/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

const controlClass =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

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

// ---- componentes de campo ---------------------------------------------
function Section({
  title,
  desc,
  children,
}: {
  title: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {desc ? <CardDescription>{desc}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

function YesNo({
  value,
  onChange,
}: {
  value: boolean | null
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex shrink-0 gap-1">
      {([['Sim', true], ['Não', false]] as const).map(([t, v]) => (
        <button
          type="button"
          key={t}
          onClick={() => onChange(v)}
          className={[
            'rounded-md border px-3 py-1 text-sm transition-colors',
            value === v
              ? 'border-primary bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent',
          ].join(' ')}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  )
}

function MultiCheck({
  options,
  value,
  onChange,
}: {
  options: Option[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  )
}

function Select({
  value,
  onChange,
  options,
  placeholder = 'Selecione',
}: {
  value: string
  onChange: (v: string) => void
  options: Option[]
  placeholder?: string
}) {
  return (
    <select className={controlClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Anamnese e triagem</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Triagem de prontidão baseada no PAR-Q+ e nas diretrizes de pré-participação do ACSM
          (redação própria). É triagem de segurança — não substitui avaliação médica.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Data da anamnese">
          <Input type="date" value={assessedAt} onChange={(e) => setAssessedAt(e.target.value)} />
        </Field>
      </div>

      {/* ===== CAMADA A ===== */}
      <Section
        title="A1. Triagem de prontidão (PAR-Q+)"
        desc="Obrigatória. Qualquer 'Sim' retira a liberação automática."
      >
        <div className="space-y-3">
          {PARQ_ITEMS.map((item) => (
            <div key={item.key} className="space-y-2 border-b pb-3 last:border-0 last:pb-0">
              <Row label={item.label}>
                <YesNo
                  value={a.parq[item.key]}
                  onChange={(v) => set({ parq: { ...a.parq, [item.key]: v } })}
                />
              </Row>
              {item.key === 'condicao_cronica' && a.parq.condicao_cronica ? (
                <Input
                  placeholder="Qual condição?"
                  value={a.parq_condicao_cronica_qual}
                  onChange={(e) => set({ parq_condicao_cronica_qual: e.target.value })}
                />
              ) : null}
              {item.key === 'medicacao_cronica' && a.parq.medicacao_cronica ? (
                <Input
                  placeholder="Qual medicação?"
                  value={a.parq_medicacao_cronica_qual}
                  onChange={(e) => set({ parq_medicacao_cronica_qual: e.target.value })}
                />
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section title="A2. Refinamento (ACSM)" desc="Define o nível de encaminhamento.">
        <Row label="Pratica exercício estruturado regular há ≥3 meses (≥30 min, ≥3x/sem, ao menos moderado)?">
          <YesNo value={a.ativo_regular} onChange={(v) => set({ ativo_regular: v })} />
        </Row>
        <Field label="Doença diagnosticada">
          <MultiCheck options={DOENCA_CMR} value={a.doenca_cmr} onChange={(v) => set({ doenca_cmr: v })} />
        </Field>
        <Field label="Sinais/sintomas atuais">
          <MultiCheck
            options={SINAIS_SINTOMAS}
            value={a.sinais_sintomas}
            onChange={(v) => set({ sinais_sintomas: v })}
          />
        </Field>
      </Section>

      {/* ===== RESULTADO DO GATE (ao vivo) ===== */}
      <GateBox gate={gate} />

      {/* ===== CAMADA B ===== */}
      <Section title="B1. Objetivo e contexto">
        <Field label="Objetivo principal">
          <MultiCheck
            options={OBJETIVOS}
            value={a.objetivo_principal}
            onChange={(v) => set({ objetivo_principal: v })}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Esporte/modalidade (opcional)">
            <Input value={a.esporte_modalidade} onChange={(e) => set({ esporte_modalidade: e.target.value })} />
          </Field>
          <Field label="Experiência de treino">
            <Select value={a.experiencia_treino} onChange={(v) => set({ experiencia_treino: v })} options={EXPERIENCIA} />
          </Field>
          <Field label="Intensidade desejada">
            <Select value={a.intensidade_desejada} onChange={(v) => set({ intensidade_desejada: v })} options={INTENSIDADE} />
          </Field>
        </div>
      </Section>

      <Section title="B2. História clínica">
        <Field label="Doenças crônicas">
          <MultiCheck options={DOENCAS_CRONICAS} value={a.doencas_cronicas} onChange={(v) => set({ doencas_cronicas: v })} />
        </Field>

        <RepeatList
          label="Cirurgias (priorize ortopédicas)"
          items={a.cirurgias}
          onAdd={() => set({ cirurgias: [...a.cirurgias, { descricao: '', ano: '', regiao: '' }] })}
          onRemove={(i) => set({ cirurgias: a.cirurgias.filter((_, idx) => idx !== i) })}
          render={(c, i) => (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_5rem]">
              <Input placeholder="Descrição" value={c.descricao} onChange={(e) => updateItem('cirurgias', i, { descricao: e.target.value }, a, set)} />
              <Input placeholder="Ano" inputMode="numeric" value={c.ano} onChange={(e) => updateItem('cirurgias', i, { ano: e.target.value }, a, set)} />
            </div>
          )}
        />

        <RepeatList
          label="Medicamentos em uso"
          items={a.medicamentos}
          onAdd={() => set({ medicamentos: [...a.medicamentos, { nome: '', dose: '' }] })}
          onRemove={(i) => set({ medicamentos: a.medicamentos.filter((_, idx) => idx !== i) })}
          render={(m, i) => (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input placeholder="Nome" value={m.nome} onChange={(e) => updateItem('medicamentos', i, { nome: e.target.value }, a, set)} />
              <Input placeholder="Dose" value={m.dose} onChange={(e) => updateItem('medicamentos', i, { dose: e.target.value }, a, set)} />
            </div>
          )}
        />

        <Row label="Morte por doença cardíaca/súbita em familiar de 1º grau (homem <55a, mulher <65a)?">
          <YesNo value={a.historia_familiar_dcv} onChange={(v) => set({ historia_familiar_dcv: v })} />
        </Row>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tabagismo">
            <Select value={a.tabagismo} onChange={(v) => set({ tabagismo: v })} options={TABAGISMO} />
          </Field>
          {a.tabagismo === 'atual' || a.tabagismo === 'ex' ? (
            <Field label="Maços-ano (estimado)">
              <Input inputMode="numeric" value={a.tabagismo_macos_ano} onChange={(e) => set({ tabagismo_macos_ano: e.target.value })} />
            </Field>
          ) : null}
          <Field label="Álcool">
            <Select value={a.alcool} onChange={(v) => set({ alcool: v })} options={ALCOOL} />
          </Field>
        </div>
      </Section>

      <Section
        title="B3. Dor e sistema musculoesquelético"
        desc="Crítico para o módulo postural. Adicione uma queixa por região."
      >
        <RepeatList
          label="Queixas de dor"
          items={a.dor_queixas}
          onAdd={() =>
            set({
              dor_queixas: [
                ...a.dor_queixas,
                { regiao: '', intensidade: 0, tempo_evolucao: '', fatores_piora: '', fatores_melhora: '', lesao_previa_regiao: false },
              ],
            })
          }
          onRemove={(i) => set({ dor_queixas: a.dor_queixas.filter((_, idx) => idx !== i) })}
          render={(q, i) => (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select value={q.regiao} onChange={(v) => updateItem('dor_queixas', i, { regiao: v }, a, set)} options={REGIAO_DOR} placeholder="Região" />
                <Select value={q.tempo_evolucao} onChange={(v) => updateItem('dor_queixas', i, { tempo_evolucao: v }, a, set)} options={TEMPO_EVOLUCAO} placeholder="Tempo de evolução" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Intensidade</span>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={q.intensidade}
                  onChange={(e) => updateItem('dor_queixas', i, { intensidade: Number(e.target.value) }, a, set)}
                  className="flex-1"
                />
                <span className="w-6 text-right text-sm tabular-nums">{q.intensidade}</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input placeholder="Piora com..." value={q.fatores_piora} onChange={(e) => updateItem('dor_queixas', i, { fatores_piora: e.target.value }, a, set)} />
                <Input placeholder="Melhora com..." value={q.fatores_melhora} onChange={(e) => updateItem('dor_queixas', i, { fatores_melhora: e.target.value }, a, set)} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={q.lesao_previa_regiao} onChange={(e) => updateItem('dor_queixas', i, { lesao_previa_regiao: e.target.checked }, a, set)} />
                Lesão prévia nesta região
              </label>
            </div>
          )}
        />
        <Field label="Sinais de alerta (red flags) — indicam avaliação médica, não treino">
          <MultiCheck options={RED_FLAGS} value={a.red_flags} onChange={(v) => set({ red_flags: v })} />
        </Field>
      </Section>

      <Section title="B4. Hábitos de vida">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ocupação">
            <Input value={a.ocupacao} onChange={(e) => set({ ocupacao: e.target.value })} />
          </Field>
          <Field label="Horas sentado por dia">
            <Input inputMode="numeric" value={a.horas_sentado_dia} onChange={(e) => set({ horas_sentado_dia: e.target.value })} />
          </Field>
          <Field label="Sono (horas/noite)">
            <Input inputMode="numeric" value={a.sono_horas} onChange={(e) => set({ sono_horas: e.target.value })} />
          </Field>
          <Field label="Qualidade do sono">
            <Select value={a.sono_qualidade} onChange={(v) => set({ sono_qualidade: v })} options={SONO_QUALIDADE} />
          </Field>
          <Field label="Estresse percebido">
            <Select value={a.estresse_percebido} onChange={(v) => set({ estresse_percebido: v })} options={ESTRESSE} />
          </Field>
        </div>
        <Row label="Esforço repetitivo ou carga no trabalho?">
          <YesNo value={a.esforco_repetitivo_carga} onChange={(v) => set({ esforco_repetitivo_carga: v })} />
        </Row>
        {a.esforco_repetitivo_carga ? (
          <Input placeholder="Descreva" value={a.esforco_repetitivo_desc} onChange={(e) => set({ esforco_repetitivo_desc: e.target.value })} />
        ) : null}
        <Row label="Faz acompanhamento nutricional?">
          <YesNo value={a.acompanhamento_nutricional} onChange={(v) => set({ acompanhamento_nutricional: v })} />
        </Row>
      </Section>

      <Section title="B5. Postural / ocupacional">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Lado dominante">
            <Select value={a.lado_dominante} onChange={(v) => set({ lado_dominante: v })} options={LADO_DOMINANTE} />
          </Field>
        </div>
        <Row label="Atividade assimétrica (tênis, arremesso, instrumento)?">
          <YesNo value={a.atividade_assimetrica} onChange={(v) => set({ atividade_assimetrica: v })} />
        </Row>
        {a.atividade_assimetrica ? (
          <Input placeholder="Qual?" value={a.atividade_assimetrica_desc} onChange={(e) => set({ atividade_assimetrica_desc: e.target.value })} />
        ) : null}
        <Row label="Usa palmilha ou órtese?">
          <YesNo value={a.uso_palmilha_ortese} onChange={(v) => set({ uso_palmilha_ortese: v })} />
        </Row>
        {a.uso_palmilha_ortese ? (
          <Input placeholder="Qual?" value={a.uso_palmilha_desc} onChange={(e) => set({ uso_palmilha_desc: e.target.value })} />
        ) : null}
        <Field label="Alteração postural diagnosticada">
          <MultiCheck options={ALTERACAO_POSTURAL} value={a.alteracao_postural_diagnosticada} onChange={(v) => set({ alteracao_postural_diagnosticada: v })} />
        </Field>
        <Field label="Queixa postural principal (opcional)">
          <Input value={a.queixa_postural_principal} onChange={(e) => set({ queixa_postural_principal: e.target.value })} />
        </Field>
      </Section>

      {isFemale ? (
        <Section title="B6. Saúde da mulher">
          <Row label="Gestante?">
            <YesNo value={a.gestante} onChange={(v) => set({ gestante: v })} />
          </Row>
          {a.gestante ? (
            <Field label="Semanas de gestação">
              <Input inputMode="numeric" value={a.gestante_semanas} onChange={(e) => set({ gestante_semanas: e.target.value })} />
            </Field>
          ) : null}
          <Row label="Pós-parto recente?">
            <YesNo value={a.pos_parto_recente} onChange={(v) => set({ pos_parto_recente: v })} />
          </Row>
          {a.pos_parto_recente ? (
            <Field label="Meses desde o parto">
              <Input inputMode="numeric" value={a.pos_parto_meses} onChange={(e) => set({ pos_parto_meses: e.target.value })} />
            </Field>
          ) : null}
        </Section>
      ) : null}

      <Section title="Observações e confirmação">
        <Field label="Observações (opcional)">
          <textarea rows={3} className={controlClass} value={a.observacoes} onChange={(e) => set({ observacoes: e.target.value })} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={a.declaracao_veracidade} onChange={(e) => set({ declaracao_veracidade: e.target.checked })} />
          Declaro que as informações fornecidas são verdadeiras.
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={a.consentimento_lgpd} onChange={(e) => set({ consentimento_lgpd: e.target.checked })} />
          Confirmo o consentimento para o tratamento dos dados de saúde (LGPD).
        </label>
      </Section>

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

function GateBox({ gate }: { gate: ReturnType<typeof computeGate> }) {
  const ok = gate.liberado && !gate.flagEncaminhamento
  return (
    <div
      className={[
        'rounded-md border p-4',
        ok ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        {ok ? (
          <ShieldCheck className="size-5 text-success" />
        ) : (
          <AlertTriangle className="size-5 text-warning" />
        )}
        <span className="font-medium">
          {ok ? 'Liberado para avaliação' : 'Atenção: encaminhamento recomendado'}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Nível ACSM: <span className="font-medium text-foreground">{NIVEL_LABEL[gate.nivelEncaminhamento]}</span>
      </p>
      {gate.motivos.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {gate.motivos.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function RepeatList<T>({
  label,
  items,
  onAdd,
  onRemove,
  render,
}: {
  label: string
  items: T[]
  onAdd: () => void
  onRemove: (i: number) => void
  render: (item: T, i: number) => React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button type="button" size="xs" variant="outline" onClick={onAdd}>
          <Plus /> Adicionar
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum item.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md border p-2">
              <div className="flex-1">{render(item, i)}</div>
              <button type="button" onClick={() => onRemove(i)} className="text-destructive" title="Remover">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// atualiza um campo de um item de lista repetível, com tipagem leve
function updateItem<K extends 'cirurgias' | 'medicamentos' | 'dor_queixas'>(
  key: K,
  i: number,
  patch: Partial<AnamnesisAnswers[K][number]>,
  a: AnamnesisAnswers,
  set: (p: Partial<AnamnesisAnswers>) => void
) {
  const list = a[key] as AnamnesisAnswers[K]
  const next = list.map((item, idx) => (idx === i ? { ...item, ...patch } : item))
  set({ [key]: next } as unknown as Partial<AnamnesisAnswers>)
}
