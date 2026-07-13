import { useId, type ReactNode } from 'react'
import { Plus, Trash2, ShieldCheck, AlertTriangle } from 'lucide-react'
import {
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
  TREINO_FREQ,
  TEMPO_SESSAO,
  LOCAL_TREINO,
  LOCAL_SEM_ESTRUTURA,
  PERFIL_SESSAO,
  LESOES,
  HISTORIA_FAMILIAR,
  type AnamnesisAnswers,
  type Option,
} from './spec'
import { NIVEL_LABEL, type computeGate } from './gate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { controlClass } from '@/lib/ui'

// Formulario da anamnese, compartilhado entre a tela do personal (AnamneseNova)
// e a pagina publica que o aluno responde (AnamnesePublica). As primitivas de
// campo ficam aqui; cada tela compoe cabecalho, gate ao vivo e confirmacao.

export type SetAnswers = (patch: Partial<AnamnesisAnswers>) => void

// ---- primitivas de campo (internas) -----------------------------------
function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
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

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="flex shrink-0 gap-1" role="group" aria-label="Resposta">
      {([['Sim', true], ['Não', false]] as const).map(([t, v]) => (
        <button
          type="button"
          key={t}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={[
            'min-h-10 rounded-md border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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

// como o YesNo, mas com valores string (ex.: Sim / Não / Não sei)
function Choice({
  options,
  value,
  onChange,
}: {
  options: Option[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex shrink-0 flex-wrap gap-1" role="group" aria-label="Resposta">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={[
            'min-h-10 rounded-md border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === o.value
              ? 'border-primary bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  const labelId = useId()
  return (
    <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="text-sm">{label}</span>
      <div>{children}</div>
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  const labelId = useId()
  return (
    <div className="space-y-1.5" role="group" aria-labelledby={labelId}>
      <Label id={labelId}>{label}</Label>
      {children}
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
  render: (item: T, i: number) => ReactNode
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
              <button type="button" onClick={() => onRemove(i)} className="grid size-10 shrink-0 place-items-center rounded-md text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Remover item ${i + 1}`}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// atualiza um campo de um item de lista repetivel, com tipagem leve
function updateItem<K extends 'cirurgias' | 'medicamentos' | 'dor_queixas'>(
  key: K,
  i: number,
  patch: Partial<AnamnesisAnswers[K][number]>,
  a: AnamnesisAnswers,
  set: SetAnswers
) {
  const list = a[key] as AnamnesisAnswers[K]
  const next = list.map((item, idx) => (idx === i ? { ...item, ...patch } : item))
  set({ [key]: next } as unknown as Partial<AnamnesisAnswers>)
}

// ---- Camada A (triagem PAR-Q+ / ACSM) ---------------------------------
// isAluno: na pagina publica os titulos/descricoes escondem a logica do gate
// (PAR-Q+, "qualquer Sim retira a liberacao") pra nao induzir resposta falsa;
// o resultado da triagem so aparece pro personal na revisao.
export function AnamneseCamadaA({
  a,
  set,
  isAluno = false,
}: {
  a: AnamnesisAnswers
  set: SetAnswers
  isAluno?: boolean
}) {
  return (
    <>
      <Section
        title={isAluno ? 'Sobre sua saúde' : 'A1. Triagem de prontidão (PAR-Q+)'}
        desc={
          isAluno
            ? 'Responda todos os itens com sinceridade — não há resposta certa ou errada.'
            : "Obrigatória. Qualquer 'Sim' retira a liberação automática."
        }
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

      <Section
        title={isAluno ? 'Atividade física e sintomas' : 'A2. Refinamento (ACSM)'}
        desc={isAluno ? 'Considere como você está hoje.' : 'Define o nível de encaminhamento.'}
      >
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
    </>
  )
}

// ---- Camada B (contexto de avaliacao) ---------------------------------
export function AnamneseCamadaB({
  a,
  set,
  isFemale,
  isAluno = false,
}: {
  a: AnamnesisAnswers
  set: SetAnswers
  isFemale: boolean
  isAluno?: boolean
}) {
  return (
    <>
      <Section title={isAluno ? 'Seu objetivo' : 'B1. Objetivo e contexto'}>
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
        <Field label="Por que esse objetivo é importante pra você hoje? (opcional)">
          <textarea rows={2} className={controlClass} value={a.objetivo_motivo} onChange={(e) => set({ objetivo_motivo: e.target.value })} />
        </Field>
        <Field label="Onde você gostaria de estar daqui a 6 meses? (opcional)">
          <textarea rows={2} className={controlClass} value={a.objetivo_6meses} onChange={(e) => set({ objetivo_6meses: e.target.value })} />
        </Field>
      </Section>

      <Section
        title={isAluno ? 'Seu treino' : 'B1b. Logística e preferências de treino'}
        desc={
          isAluno
            ? 'Como o treino cabe na sua rotina — e do que você gosta.'
            : 'Disponibilidade, local, equipamentos e preferências: alimenta a montagem do treino.'
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Quantas vezes por semana pretende treinar?">
            <Select value={a.treino_freq_semana} onChange={(v) => set({ treino_freq_semana: v })} options={TREINO_FREQ} />
          </Field>
          <Field label="Tempo disponível por sessão">
            <Select value={a.treino_tempo_sessao} onChange={(v) => set({ treino_tempo_sessao: v })} options={TEMPO_SESSAO} />
          </Field>
        </div>
        <Field label="Onde vai treinar na maior parte do tempo?">
          <Select value={a.treino_local} onChange={(v) => set({ treino_local: v })} options={LOCAL_TREINO} />
        </Field>
        {LOCAL_SEM_ESTRUTURA.includes(a.treino_local) ? (
          <Field label="Quais equipamentos você tem à disposição?">
            <textarea
              rows={2}
              className={controlClass}
              placeholder="halteres (quais pesos), elásticos, barra fixa, banco..."
              value={a.treino_equipamentos}
              onChange={(e) => set({ treino_equipamentos: e.target.value })}
            />
          </Field>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Exercícios ou treinos que você mais gosta (opcional)">
            <Input value={a.pref_gosta} onChange={(e) => set({ pref_gosta: e.target.value })} />
          </Field>
          <Field label="E que menos gosta (opcional)">
            <Input value={a.pref_nao_gosta} onChange={(e) => set({ pref_nao_gosta: e.target.value })} />
          </Field>
        </div>
        <Field label="Algum exercício que você não quer fazer de jeito nenhum? (opcional)">
          <Input value={a.pref_veto} onChange={(e) => set({ pref_veto: e.target.value })} />
        </Field>
        <Field label="Que estilo de sessão combina mais com você?">
          <Select value={a.perfil_sessao} onChange={(v) => set({ perfil_sessao: v })} options={PERFIL_SESSAO} />
        </Field>
      </Section>

      <Section title={isAluno ? 'Histórico de saúde' : 'B2. História clínica'}>
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
          <Choice
            options={HISTORIA_FAMILIAR}
            value={a.historia_familiar_dcv}
            onChange={(v) => set({ historia_familiar_dcv: v })}
          />
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
        title={isAluno ? 'Dores e desconfortos' : 'B3. Dor e sistema musculoesquelético'}
        desc="Adicione uma queixa por região."
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
        <Field
          label={
            isAluno
              ? 'Você tem ou já teve diagnóstico médico de alguma destas lesões?'
              : 'Lesões com diagnóstico médico/cirúrgico'
          }
        >
          <MultiCheck
            options={LESOES}
            value={a.lesoes_diagnosticadas}
            onChange={(v) => set({ lesoes_diagnosticadas: v })}
          />
        </Field>
        {a.lesoes_diagnosticadas.length > 0 ? (
          <Field label="Como está hoje? (operado, liberado pelo médico, sente instabilidade...)">
            <textarea
              rows={2}
              className={controlClass}
              value={a.lesoes_estado_atual}
              onChange={(e) => set({ lesoes_estado_atual: e.target.value })}
            />
          </Field>
        ) : null}
        <Field
          label={
            isAluno
              ? 'Você percebe algum destes sinais atualmente?'
              : 'Sinais de alerta (red flags) — indicam avaliação médica, não treino'
          }
        >
          <MultiCheck options={RED_FLAGS} value={a.red_flags} onChange={(v) => set({ red_flags: v })} />
        </Field>
      </Section>

      <Section title={isAluno ? 'Hábitos de vida' : 'B4. Hábitos de vida'}>
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

      <Section title={isAluno ? 'Postura e dia a dia' : 'B5. Postural / ocupacional'}>
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
        <Section title={isAluno ? 'Saúde da mulher' : 'B6. Saúde da mulher'}>
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

      <Section title="Observações">
        <Field label="Algo mais que queira registrar (opcional)">
          <textarea rows={3} className={controlClass} value={a.observacoes} onChange={(e) => set({ observacoes: e.target.value })} />
        </Field>
      </Section>
    </>
  )
}

// ---- caixa do gate (resultado da triagem) -----------------------------
export function GateBox({ gate }: { gate: ReturnType<typeof computeGate> }) {
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
      <p className="mt-2 text-xs text-muted-foreground">
        Triagem baseada no PAR-Q+ e nas diretrizes de pré-participação do ACSM (redação própria). Não
        substitui avaliação médica.
      </p>
    </div>
  )
}
