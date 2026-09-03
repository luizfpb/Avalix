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
  TREINO_FREQ,
  TEMPO_SESSAO,
  LOCAL_TREINO,
  PERFIL_SESSAO,
  LESOES,
  HISTORIA_FAMILIAR,
  type AnamnesisAnswers,
  type Option,
} from './spec'
import { computeGate } from './gate'
import { GateBox } from './AnamneseForm'
import { declaracaoFromAnswers, formatDataBr, type Liberacao } from './clearance'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

// Resumo read-only das respostas + resultado da triagem. Usado na tela de
// detalhe de uma anamnese salva e na revisao de uma resposta pendente.

const labelOf = (opts: Option[], v: string) => opts.find((o) => o.value === v)?.label ?? v
const labelsOf = (opts: Option[], vs: string[]) => vs.map((v) => labelOf(opts, v)).join(', ')
const fmtBool = (v: boolean | null | undefined) => (v === true ? 'Sim' : v === false ? 'Não' : '')

function confirmedLabels(opts: Option[], values: string[], confirmed: boolean): string {
  if (!confirmed) return 'Não respondido'
  return values.length > 0 ? labelsOf(opts, values) : 'Nenhuma'
}

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

export function AnamneseResumo({
  answers: a,
  liberacao,
  assessedAt,
  updatedAt,
  afterGate,
}: {
  answers: AnamnesisAnswers
  // Só o detalhe de uma anamnese salva tem parecer médico; a revisão de um
  // intake pendente ainda não virou registro.
  liberacao?: Liberacao
  assessedAt?: string | null
  updatedAt?: string | null
  // slot logo abaixo do resultado da triagem, onde mora a ação que responde a
  // ele (registrar a liberação médica)
  afterGate?: ReactNode
}) {
  const gate = computeGate(a)
  const parqYes = PARQ_ITEMS.filter((i) => a.parq?.[i.key] === true)
  const parqMissing = PARQ_ITEMS.filter((i) => typeof a.parq?.[i.key] !== 'boolean')

  return (
    <div className="space-y-5">
      <GateBox
        gate={gate}
        liberacao={liberacao}
        declaracao={declaracaoFromAnswers(a)}
        assessedAt={assessedAt}
        updatedAt={updatedAt}
      />
      {afterGate}

      <Block title="Triagem (PAR-Q+)">
        {parqMissing.length > 0 ? (
          <Item
            label="Não respondidos"
            value={parqMissing.map((item) => item.label).join(' · ')}
          />
        ) : parqYes.length === 0 ? (
          <Item label="Respostas" value="Todas 'Não'" />
        ) : (
          parqYes.map((i) => <Item key={i.key} label="Sim" value={i.label} />)
        )}
      </Block>

      <Block title="Refinamento (ACSM)">
        <Item label="Ativo regular" value={fmtBool(a.ativo_regular) || 'Não respondido'} />
        <Item
          label="Doença diagnosticada"
          value={confirmedLabels(DOENCA_CMR, a.doenca_cmr ?? [], a.doenca_cmr_confirmada)}
        />
        <Item
          label="Sinais/sintomas"
          value={confirmedLabels(
            SINAIS_SINTOMAS,
            a.sinais_sintomas ?? [],
            a.sinais_sintomas_confirmados
          )}
        />
        <Item
          label="Declara liberação médica recente"
          value={
            a.liberacao_declarada === true
              ? `Sim${a.liberacao_declarada_em ? ` · ${formatDataBr(a.liberacao_declarada_em)}` : ''} (autorrelato)`
              : a.liberacao_declarada === false
                ? 'Não'
                : 'Não respondido'
          }
        />
      </Block>

      <Block title="Objetivo">
        <Item label="Objetivo" value={labelsOf(OBJETIVOS, a.objetivo_principal ?? [])} />
        <Item label="Por que importa hoje" value={a.objetivo_motivo} />
        <Item label="Em 6 meses" value={a.objetivo_6meses} />
        <Item label="Esporte/modalidade" value={a.esporte_modalidade} />
        <Item label="Experiência" value={a.experiencia_treino ? labelOf(EXPERIENCIA, a.experiencia_treino) : ''} />
        <Item label="Intensidade desejada" value={a.intensidade_desejada ? labelOf(INTENSIDADE, a.intensidade_desejada) : ''} />
      </Block>

      <Block title="Logística e preferências de treino">
        <Item label="Frequência pretendida" value={a.treino_freq_semana ? labelOf(TREINO_FREQ, a.treino_freq_semana) : ''} />
        <Item label="Tempo por sessão" value={a.treino_tempo_sessao ? labelOf(TEMPO_SESSAO, a.treino_tempo_sessao) : ''} />
        <Item label="Local" value={a.treino_local ? labelOf(LOCAL_TREINO, a.treino_local) : ''} />
        <Item label="Equipamentos" value={a.treino_equipamentos} />
        <Item label="Mais gosta" value={a.pref_gosta} />
        <Item label="Menos gosta" value={a.pref_nao_gosta} />
        <Item label="Não quer fazer" value={a.pref_veto} />
        <Item label="Estilo de sessão" value={a.perfil_sessao ? labelOf(PERFIL_SESSAO, a.perfil_sessao) : ''} />
      </Block>

      <Block title="História clínica">
        <Item label="Doenças crônicas" value={labelsOf(DOENCAS_CRONICAS, a.doencas_cronicas ?? [])} />
        {(a.cirurgias ?? []).map((c, i) => (
          <Item key={`c${i}`} label="Cirurgia" value={[c.descricao, c.ano].filter(Boolean).join(' · ')} />
        ))}
        {/* Pergunta obrigatória: lista vazia sem confirmação é "não respondido",
            e não "não usa nada" — anamnese gravada antes do campo existir cai
            neste caso. */}
        {(a.medicamentos ?? []).length > 0 ? (
          (a.medicamentos ?? []).map((m, i) => (
            <Item key={`m${i}`} label="Medicamento" value={[m.nome, m.dose].filter(Boolean).join(' · ')} />
          ))
        ) : (
          <Item
            label="Medicamentos em uso"
            value={a.medicamentos_confirmados ? 'Nenhum' : 'Não respondido'}
          />
        )}
        <Item label="História familiar DCV" value={a.historia_familiar_dcv ? labelOf(HISTORIA_FAMILIAR, a.historia_familiar_dcv) : ''} />
        <Item label="Tabagismo" value={a.tabagismo ? labelOf(TABAGISMO, a.tabagismo) : ''} />
        <Item label="Álcool" value={a.alcool ? labelOf(ALCOOL, a.alcool) : ''} />
      </Block>

      <Block title="Dor e musculoesquelético">
        {(a.dor_queixas ?? []).map((q, i) => (
          <Item
            key={`q${i}`}
            label={labelOf(REGIAO_DOR, q.regiao)}
            // tempo de evolução e fatores saíram do formulário na spec 1.2, mas
            // seguem exibidos quando o registro é anterior: prontuário antigo
            // não pode perder informação por causa de mudança de formulário.
            value={[
              `${q.intensidade}/10`,
              q.tempo_evolucao ? labelOf(TEMPO_EVOLUCAO, q.tempo_evolucao) : '',
              q.lesao_previa_regiao ? 'lesão prévia' : '',
              q.fatores_piora ? `piora: ${q.fatores_piora}` : '',
              q.fatores_melhora ? `melhora: ${q.fatores_melhora}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
        <Item label="História da dor" value={a.dor_historia} />
        <Item label="O que já tentou / piora e melhora" value={a.dor_tentativas} />
        <Item label="Impacto e medo" value={a.dor_impacto_medo} />
        <Item label="Lesões diagnosticadas" value={labelsOf(LESOES, a.lesoes_diagnosticadas ?? [])} />
        <Item label="Estado das lesões" value={a.lesoes_estado_atual} />
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
