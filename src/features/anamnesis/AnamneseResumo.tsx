import { type ReactNode } from 'react'
import {
  PARQ_ITEMS,
  DOENCA_CMR,
  SINAIS_SINTOMAS,
  OBJETIVOS,
  EXPERIENCIA,
  INTENSIDADE,
  DOENCAS_CRONICAS,
  REGIAO_DOR,
  TEMPO_EVOLUCAO,
  RED_FLAGS,
  TABAGISMO,
  ALCOOL,
  ALTERACAO_POSTURAL,
  LADO_DOMINANTE,
  type AnamnesisAnswers,
  type Option,
} from './spec'
import { computeGate } from './gate'
import { GateBox } from './AnamneseForm'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

// Resumo read-only das respostas + resultado da triagem. Usado na tela de
// detalhe de uma anamnese salva e na revisao de uma resposta pendente.

const labelOf = (opts: Option[], v: string) => opts.find((o) => o.value === v)?.label ?? v
const labelsOf = (opts: Option[], vs: string[]) => vs.map((v) => labelOf(opts, v)).join(', ')
const fmtBool = (v: boolean | null | undefined) => (v === true ? 'Sim' : v === false ? 'Não' : '')

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">{children}</CardContent>
    </Card>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

export function AnamneseResumo({ answers: a }: { answers: AnamnesisAnswers }) {
  const gate = computeGate(a)
  const parqYes = PARQ_ITEMS.filter((i) => a.parq?.[i.key] === true)

  return (
    <div className="space-y-5">
      <GateBox gate={gate} />

      <Block title="Triagem (PAR-Q+)">
        {parqYes.length === 0 ? (
          <Item label="Respostas" value="Todas 'Não'" />
        ) : (
          parqYes.map((i) => <Item key={i.key} label="Sim" value={i.label} />)
        )}
      </Block>

      <Block title="Refinamento (ACSM)">
        <Item label="Ativo regular" value={fmtBool(a.ativo_regular)} />
        <Item label="Doença diagnosticada" value={labelsOf(DOENCA_CMR, a.doenca_cmr ?? [])} />
        <Item label="Sinais/sintomas" value={labelsOf(SINAIS_SINTOMAS, a.sinais_sintomas ?? [])} />
      </Block>

      <Block title="Objetivo">
        <Item label="Objetivo" value={labelsOf(OBJETIVOS, a.objetivo_principal ?? [])} />
        <Item label="Esporte/modalidade" value={a.esporte_modalidade} />
        <Item label="Experiência" value={a.experiencia_treino ? labelOf(EXPERIENCIA, a.experiencia_treino) : ''} />
        <Item label="Intensidade desejada" value={a.intensidade_desejada ? labelOf(INTENSIDADE, a.intensidade_desejada) : ''} />
      </Block>

      <Block title="História clínica">
        <Item label="Doenças crônicas" value={labelsOf(DOENCAS_CRONICAS, a.doencas_cronicas ?? [])} />
        {(a.cirurgias ?? []).map((c, i) => (
          <Item key={`c${i}`} label="Cirurgia" value={[c.descricao, c.ano].filter(Boolean).join(' · ')} />
        ))}
        {(a.medicamentos ?? []).map((m, i) => (
          <Item key={`m${i}`} label="Medicamento" value={[m.nome, m.dose].filter(Boolean).join(' · ')} />
        ))}
        <Item label="História familiar DCV" value={fmtBool(a.historia_familiar_dcv)} />
        <Item label="Tabagismo" value={a.tabagismo ? labelOf(TABAGISMO, a.tabagismo) : ''} />
        <Item label="Álcool" value={a.alcool ? labelOf(ALCOOL, a.alcool) : ''} />
      </Block>

      <Block title="Dor e musculoesquelético">
        {(a.dor_queixas ?? []).map((q, i) => (
          <Item
            key={`q${i}`}
            label={labelOf(REGIAO_DOR, q.regiao)}
            value={`${q.intensidade}/10 · ${q.tempo_evolucao ? labelOf(TEMPO_EVOLUCAO, q.tempo_evolucao) : ''}${
              q.lesao_previa_regiao ? ' · lesão prévia' : ''
            }`}
          />
        ))}
        <Item label="Red flags" value={labelsOf(RED_FLAGS, a.red_flags ?? [])} />
      </Block>

      <Block title="Hábitos e postural">
        <Item label="Ocupação" value={a.ocupacao} />
        <Item label="Horas sentado/dia" value={a.horas_sentado_dia} />
        <Item label="Sono (h)" value={a.sono_horas} />
        <Item label="Lado dominante" value={a.lado_dominante ? labelOf(LADO_DOMINANTE, a.lado_dominante) : ''} />
        <Item label="Alteração postural" value={labelsOf(ALTERACAO_POSTURAL, a.alteracao_postural_diagnosticada ?? [])} />
        <Item label="Queixa postural" value={a.queixa_postural_principal} />
      </Block>

      {a.gestante === true || a.pos_parto_recente === true ? (
        <Block title="Saúde da mulher">
          <Item label="Gestante" value={a.gestante ? `Sim${a.gestante_semanas ? ` · ${a.gestante_semanas} sem` : ''}` : ''} />
          <Item label="Pós-parto recente" value={a.pos_parto_recente ? `Sim${a.pos_parto_meses ? ` · ${a.pos_parto_meses} meses` : ''}` : ''} />
        </Block>
      ) : null}

      {a.observacoes ? (
        <div className="text-sm">
          <span className="block text-xs text-muted-foreground">Observações</span>
          <p className="whitespace-pre-wrap">{a.observacoes}</p>
        </div>
      ) : null}
    </div>
  )
}
