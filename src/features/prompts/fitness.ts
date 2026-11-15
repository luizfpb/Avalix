import { computeFitness, formatResultValue, type FitnessResult } from '../fitness/engine'
import type { Previous } from '../fitness/history'
import { parseMeasures, TEST_LABELS, type FitnessTestKey } from '../fitness/measures'
import { abbreviateName, ageAt, sexLabel, type PromptSubject } from './identity'
import { block, fmtDate, joinBlocks, line, optionalLine } from './format'
import { FECHAMENTO, PAPEL, REGRAS_DE_RIGOR } from './guardrails'

export type FitnessPromptPoint = {
  testedAt: string
  measures: unknown
  notes?: string | null
  previous?: Partial<Record<FitnessTestKey, Previous>>
}

export type FitnessPromptInput = {
  subject: PromptSubject
  point: FitnessPromptPoint
}

export const PREMISSAS_TESTES_FISICOS = `PREMISSAS METODOLÓGICAS — TESTES FÍSICOS (aplicar; não substituir por valores de memória)

- VO₂máx estimado por testes submáximos ou de campo (Cooper 12 min, Rockport 1
  milha, Banco de Queens 3 min) não é ergoespirometria direta: traz erro-padrão
  de estimativa de 3 a 5 mL/kg/min e depende de ritmo, motivação, temperatura e
  resposta autonômica da frequência cardíaca.
- VO₂máx obtido por protocolos diferentes (ex.: Cooper vs. Rockport ou Queens)
  não é diretamente comparável: parte da diferença decorre da equação e do tipo
  de esforço, não de adaptação cardiorrespiratória.
- A classificação de VO₂máx do sistema usa a referência brasileira de Herdy &
  Caixeta (2016, Arq Bras Cardiol, 15 a 74 anos). Os testes neuromotores
  (flexão de braço, abdominal 1 min, sentar e alcançar, preensão manual) usam
  as faixas de Pollock & Wilmore / CSEP por sexo e idade (15 a 69 anos).
- Flexão de braço na tabela normativa usa posição completa para homens e apoio
  nos joelhos para mulheres; quando realizada fora da posição padrão da tabela,
  o número de repetições serve para acompanhar a própria pessoa, sem
  classificação normativa.`

function formatTestLine(r: FitnessResult, prev?: Previous): string {
  const label = TEST_LABELS[r.key]
  const parts = [`${label}: ${r.valueLabel} ${formatResultValue(r)}`]
  if (r.detail.length > 0) parts.push(`(${r.detail.join(' · ')})`)
  if (r.rating) {
    parts.push(`— ${r.rating.label} (${r.rating.source})`)
  } else {
    parts.push('— sem faixa normativa')
  }
  if (prev) {
    const digits = r.key === 'push_ups' || r.key === 'sit_ups' ? 0 : 1
    const delta = r.value - prev.value
    const sign = delta > 0 ? '+' : ''
    const deltaFmt = delta.toLocaleString('pt-BR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
    const eraTxt =
      prev.ratingLabel && prev.ratingLabel !== r.rating?.label ? `, era ${prev.ratingLabel}` : ''
    parts.push(`[em ${fmtDate(prev.testedAt)}: Δ ${sign}${deltaFmt} ${r.unit}${eraTxt}]`)
  }
  if (r.notes.length > 0) {
    parts.push(`{Ressalvas: ${r.notes.join('; ')}}`)
  }
  return `- ${parts.join(' ')}`
}

export function testesFisicosBlock(
  point: FitnessPromptPoint,
  subject: PromptSubject
): string | null {
  const sex = subject.sex === 'F' ? 'F' : 'M'
  const age = ageAt(subject.birthDate, point.testedAt)
  if (age == null) return null
  const measures = parseMeasures(point.measures)
  const results = computeFitness(measures, sex, age)
  if (results.length === 0) return null

  return block(`TESTES FÍSICOS DE ${fmtDate(point.testedAt)}`, [
    ...results.map((r) => formatTestLine(r, point.previous?.[r.key])),
    optionalLine('Observações dos testes', point.notes),
  ])
}

const TAREFA_TESTES = `O QUE EU PRECISO DE VOCÊ

Responda nesta ordem, com estes títulos:

1. Leitura geral da aptidão física em uma frase
   O que este conjunto de testes mostra sobre a capacidade cardiorrespiratória e
   neuromotora desta pessoa na data da coleta.

2. Destaques e pontos de atenção por capacidade
   Separe aptidão cardiorrespiratória, força/resistência muscular e
   flexibilidade. Aponte onde o resultado está claramente acima ou abaixo do
   esperado para sexo e idade e onde está próximo de fronteira de faixa.

3. Limitações metodológicas e de comparabilidade
   Leve em conta o protocolo usado, a idade do avaliado frente às tabelas de
   referência e, se houver registro anterior, se a diferença supera o ruído
   esperado do teste.

4. Implicações práticas para o acompanhamento
   Que capacidades priorizar no treinamento e o que padronizar na próxima
   bateria de testes (sem montar ficha de treino detalhada).

5. O que este material não permite concluir`

export function buildFitnessPrompt(input: FitnessPromptInput): string {
  const { subject, point } = input
  const idade = ageAt(subject.birthDate, point.testedAt)
  const hasPrevious = point.previous && Object.keys(point.previous).length > 0
  const ident = block('IDENTIFICAÇÃO', [
    line('Avaliado', abbreviateName(subject.fullName)),
    line('Idade na data dos testes', idade != null ? `${idade} anos` : null),
    line('Sexo biológico', sexLabel(subject.sex)),
    '- O nome vai abreviado de propósito. Não peça nome completo, contato ou qualquer outro identificador: nada disso muda a análise.',
  ])

  return joinBlocks([
    PAPEL,
    `MATERIAL: bateria de testes físicos realizada em ${fmtDate(point.testedAt)}${
      hasPrevious ? ', acompanhada da comparação com a medida anterior de cada teste' : ''
    }.`,
    ident,
    testesFisicosBlock(point, subject),
    PREMISSAS_TESTES_FISICOS,
    TAREFA_TESTES,
    REGRAS_DE_RIGOR,
    FECHAMENTO,
  ])
}
