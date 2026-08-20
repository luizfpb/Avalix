// Prompts de parecer sobre avaliação física: uma isolada e uma série.
//
// Duas decisões carregam o rigor aqui, e as duas são cálculo do app, não
// pedido à IA:
//
// 1. As premissas metodológicas viajam junto. Um número de percentual de
//    gordura sem o erro do método vira verdade absoluta na leitura de quem
//    recebe — e a diferença entre "caiu 0,8 ponto" e "mudou dentro do erro do
//    método" é a diferença entre um parecer útil e um parecer errado.
//
// 2. Troca de protocolo no meio da série invalida a comparação direta de
//    percentual de gordura. Isso o app sabe (protocol_id está gravado por
//    avaliação) e a IA não teria como adivinhar, porque o número sozinho parece
//    perfeitamente comparável. Então a checagem é feita aqui e entra no prompt
//    como fato, não como pergunta.

import { computeBmi, bmiCategory } from '../assessment/bmi'
import { classifyBodyFat } from '../assessment/bodyFat'
import { protocolLabel, type Sex } from '../assessment/protocols'
import type { AssessmentResultSnapshot } from '../assessment/result'
import { CIRCUMFERENCE_CATALOG, circumferenceLabel, SKINFOLD_LABELS } from '../assessment/sites'
import type { SkinfoldSite } from '../assessment/protocols'
import { abbreviateName, ageAt, sexLabel, type PromptSubject } from './identity'
import {
  block,
  daysBetween,
  fmtDate,
  fmtNum,
  fmtSigned,
  joinBlocks,
  line,
  optionalLine,
} from './format'
import { FECHAMENTO, PAPEL, REGRAS_DE_RIGOR } from './guardrails'

export type AssessmentPromptPoint = {
  assessedAt: string
  protocolId: string | null
  engineVersion: string | null
  weightKg: number
  heightCm: number
  results: AssessmentResultSnapshot | null
  circumferences: { site: string; valueCm: number }[]
}

export type SkinfoldReading = { site: string; readings: number[] }

export type AssessmentPromptInput = {
  subject: PromptSubject
  point: AssessmentPromptPoint
  skinfolds: SkinfoldReading[]
  medications?: string | null
  notes?: string | null
}

export type AssessmentSeriesPromptInput = {
  subject: PromptSubject
  // ordem cronológica ascendente (mais antiga primeiro)
  points: AssessmentPromptPoint[]
}

// Premissas que a IA precisa aplicar e não teria como inferir do material. São
// propriedades conhecidas dos métodos, não julgamento do app — e a regra 5 do
// bloco de rigor proíbe a IA de "melhorar" isso com número de memória.
export const PREMISSAS_METODOLOGICAS = `PREMISSAS METODOLÓGICAS (aplicar; não substituir por valores de memória)

- Percentual de gordura obtido por dobras cutâneas é estimativa em dois
  passos: a equação estima a densidade corporal e uma segunda equação (Siri ou
  Brozek) converte densidade em percentual. Cada passo tem erro próprio, e os
  erros se acumulam.
- As equações de dobras são regressões validadas contra pesagem hidrostática,
  com erro-padrão de estimativa da ordem de 3 a 4 pontos percentuais de
  gordura na população de validação. Fora dessa população o erro é maior e
  desconhecido.
- A conversão densidade para percentual assume densidade constante da massa
  livre de gordura (modelo de dois compartimentos). Essa premissa varia com
  idade, etnia, hidratação e nível de treinamento, o que desloca o resultado de
  forma sistemática em alguns perfis.
- Estimativa por circunferências (US Navy) não passa por densidade e tem erro
  individual maior ainda do que o das dobras.
- Consequência prática: o valor absoluto tem precisão individual limitada. A
  comparação seriada — mesmo avaliado, mesmo protocolo, mesmo avaliador,
  condições semelhantes — é mais informativa do que o número isolado, porque
  boa parte do erro é sistemática e se cancela na diferença.
- Peso, circunferências e IMC são medidas diretas: têm erro bem menor do que o
  percentual de gordura estimado, e por isso sustentam afirmação mais forte.
- Se você não souber com segurança o erro do protocolo citado, diga isso em
  vez de afirmar um valor.`

function subjectSex(point: AssessmentPromptPoint, subject: PromptSubject): Sex | null {
  const raw = point.results?.inputs.sex ?? subject.sex
  return raw === 'M' || raw === 'F' ? raw : null
}

function identificacao(subject: PromptSubject, referenceIso: string): string {
  const idade = ageAt(subject.birthDate, referenceIso)
  return block('IDENTIFICAÇÃO', [
    line('Avaliado', abbreviateName(subject.fullName)),
    line('Idade na data de referência', idade != null ? `${idade} anos` : null),
    line('Sexo biológico', sexLabel(subject.sex)),
    '- O nome vai abreviado de propósito. Não peça nome completo, contato ou qualquer outro identificador: nada disso muda a análise.',
  ])
}

// Ressalvas gravadas no snapshot no momento do cálculo (domain.ts): idade fora
// da faixa de validação, soma de dobras além do vértice da parábola, resultado
// fora da faixa usual. São a razão principal de o app existir em vez de uma
// planilha — não podem ficar de fora do prompt.
function ressalvasLines(results: AssessmentResultSnapshot | null): string[] {
  const warnings = results?.warnings ?? []
  if (warnings.length === 0) return ['- Ressalvas do protocolo: nenhuma registrada no cálculo.']
  return [
    '- Ressalvas registradas pelo sistema no momento do cálculo (entrada fixa, ver regra 4):',
    ...warnings.map((w) => `  - [${w.code}] ${w.message}`),
  ]
}

export function resultadoBlock(point: AssessmentPromptPoint, subject: PromptSubject): string {
  const r = point.results
  const bmi = computeBmi(point.weightKg, point.heightCm)
  const sex = subjectSex(point, subject)
  const bfCat = r && sex ? classifyBodyFat(sex, r.bodyFatPct) : null

  return block(`RESULTADO DA AVALIAÇÃO DE ${fmtDate(point.assessedAt)}`, [
    line('Protocolo', protocolLabel(point.protocolId)),
    line('Versão do motor de cálculo', point.engineVersion),
    line('Peso', `${fmtNum(point.weightKg, 1)} kg`),
    line('Altura', `${fmtNum(point.heightCm, 1)} cm`),
    line('IMC', `${fmtNum(bmi, 1)} — ${bmiCategory(bmi).label} (faixas OMS para adultos)`),
    r
      ? line(
          'Percentual de gordura (estimado)',
          `${fmtNum(r.bodyFatPct, 1)}%${bfCat ? ` — ${bfCat.label} (faixas ACE por sexo, sem ajuste por idade)` : ''}`
        )
      : '- Percentual de gordura: não calculado (avaliação sem protocolo de composição corporal)',
    r?.bodyDensity != null ? line('Densidade corporal', `${r.bodyDensity.toFixed(4)} g/cc`) : null,
    r?.conversions
      ? line(
          'Conversões densidade → gordura',
          `Siri ${fmtNum(r.conversions.siri, 1)}% · Brozek ${fmtNum(r.conversions.brozek, 1)}% (o app usa Siri como principal)`
        )
      : null,
    r ? line('Massa gorda', `${fmtNum(r.fatMassKg, 1)} kg`) : null,
    r ? line('Massa magra', `${fmtNum(r.leanMassKg, 1)} kg`) : null,
    ...ressalvasLines(r),
  ])
}

// As aferições cruas, e não só a média: a dispersão entre as 1 a 3 medidas do
// mesmo ponto é o único sinal disponível sobre a confiabilidade da coleta.
export function dobrasBlock(skinfolds: SkinfoldReading[]): string | null {
  const linhas = skinfolds
    .map((s) => {
      const vals = s.readings.filter((v) => Number.isFinite(v) && v > 0)
      if (vals.length === 0) return null
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      const spread = vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : null
      const label = SKINFOLD_LABELS[s.site as SkinfoldSite] ?? s.site
      const spreadTxt = spread != null ? `, amplitude ${fmtNum(spread, 1)} mm` : ''
      return `- ${label}: ${vals.map((v) => fmtNum(v, 1)).join(' / ')} mm (média ${fmtNum(mean, 1)} mm${spreadTxt})`
    })
    .filter((l): l is string => l !== null)

  if (linhas.length === 0) return null
  return block('DOBRAS CUTÂNEAS — aferições e média usada no cálculo', [
    ...linhas,
    '- A amplitude entre aferições do mesmo ponto é indício da reprodutibilidade da coleta; amplitude alta reduz a confiança no resultado.',
  ])
}

// Ordem canônica do catálogo, com as customizadas depois, em ordem alfabética.
const CATALOG_ORDER = new Map<string, number>(
  CIRCUMFERENCE_CATALOG.flatMap((g) => g.items).map((item, i) => [item.key, i])
)

function sortSites(sites: string[]): string[] {
  return [...sites].sort((a, b) => {
    const ia = CATALOG_ORDER.get(a)
    const ib = CATALOG_ORDER.get(b)
    if (ia != null && ib != null) return ia - ib
    if (ia != null) return -1
    if (ib != null) return 1
    return a.localeCompare(b)
  })
}

export function circunferenciasBlock(point: AssessmentPromptPoint): string | null {
  if (point.circumferences.length === 0) return null
  const bySite = new Map(point.circumferences.map((c) => [c.site, c.valueCm]))
  const linhas = sortSites([...bySite.keys()]).map(
    (site) => `- ${circumferenceLabel(site)}: ${fmtNum(bySite.get(site) ?? null, 1)} cm`
  )
  return block('CIRCUNFERÊNCIAS (cm) — medida direta', linhas)
}

const TAREFA_ISOLADA = `O QUE EU PRECISO DE VOCÊ

Responda nesta ordem, com estes títulos:

1. Leitura do resultado em uma frase
   O que esta avaliação diz sobre a composição corporal desta pessoa hoje,
   com a precisão que o método permite.

2. O que sustenta e o que não sustenta
   Separe o que o material permite afirmar do que só permite levantar.
   Aponte explicitamente onde a precisão do método impede conclusão — em
   especial quando a classificação está perto de um limite de faixa.

3. Coerência interna das medidas
   Peso, IMC, dobras, circunferências e o percentual estimado contam a mesma
   história? Aponte divergência entre medida direta e valor estimado, e o que
   ela sugere sobre coleta, protocolo ou perfil do avaliado.

4. Qualidade da coleta
   O que a amplitude entre aferições, a escolha do protocolo e as ressalvas
   registradas dizem sobre a confiabilidade deste resultado. Diga se o
   protocolo escolhido é adequado a este avaliado e por quê.

5. O que isso significa para o acompanhamento
   O que faz sentido medir na próxima avaliação, com que intervalo, e que
   magnitude de mudança seria necessária para ser interpretável acima do erro
   do método.

6. O que este material não permite concluir`

export function buildAssessmentPrompt(input: AssessmentPromptInput): string {
  const { subject, point, skinfolds } = input
  return joinBlocks([
    PAPEL,
    `MATERIAL: uma avaliação física isolada, realizada em ${fmtDate(point.assessedAt)}. Não há comparação com outras datas neste material.`,
    identificacao(subject, point.assessedAt),
    resultadoBlock(point, subject),
    dobrasBlock(skinfolds),
    circunferenciasBlock(point),
    input.medications || input.notes
      ? block('REGISTRO DO AVALIADOR', [
          optionalLine('Medicamentos em uso anotados na avaliação', input.medications),
          optionalLine('Observações da avaliação', input.notes),
        ])
      : null,
    PREMISSAS_METODOLOGICAS,
    TAREFA_ISOLADA,
    REGRAS_DE_RIGOR,
    FECHAMENTO,
  ])
}

// ---- Série -------------------------------------------------------------

export type SeriesConsistency = {
  protocolos: string[]
  protocoloMudou: boolean
  motoresMudaram: boolean
}

export function seriesConsistency(points: AssessmentPromptPoint[]): SeriesConsistency {
  const comProtocolo = points.filter((p) => p.results != null)
  const protocolos = [...new Set(comProtocolo.map((p) => p.protocolId ?? 'sem protocolo'))]
  const motores = [...new Set(points.map((p) => p.engineVersion).filter(Boolean))]
  return {
    protocolos,
    protocoloMudou: protocolos.length > 1,
    motoresMudaram: motores.length > 1,
  }
}

function metricRow(p: AssessmentPromptPoint): string {
  const r = p.results
  const bmi = computeBmi(p.weightKg, p.heightCm)
  const cells = [
    fmtDate(p.assessedAt),
    fmtNum(p.weightKg, 1) ?? '—',
    fmtNum(bmi, 1) ?? '—',
    fmtNum(r?.bodyFatPct ?? null, 1) ?? '—',
    fmtNum(r?.leanMassKg ?? null, 1) ?? '—',
    fmtNum(r?.fatMassKg ?? null, 1) ?? '—',
    protocolLabel(p.protocolId),
  ]
  return `  ${cells.join(' | ')}`
}

function deltaLines(points: AssessmentPromptPoint[]): string[] {
  if (points.length < 2) return []
  const first = points[0]
  const last = points[points.length - 1]
  const dias = daysBetween(first.assessedAt, last.assessedAt)

  // Métrica que falta numa das pontas (avaliação sem protocolo de composição)
  // some da lista em vez de virar "não respondido": ali a frase descreveria a
  // variação, e "a variação não foi respondida" não quer dizer nada.
  const delta = (
    rotulo: string,
    de: number | null | undefined,
    para: number | null | undefined,
    unidade: string
  ): string | null => {
    if (de == null || para == null || !Number.isFinite(de) || !Number.isFinite(para)) return null
    return line(rotulo, `${fmtSigned(para - de, 1)}${unidade ? ` ${unidade}` : ''}`)
  }

  const total = [
    delta('Peso', first.weightKg, last.weightKg, 'kg'),
    delta(
      'IMC',
      computeBmi(first.weightKg, first.heightCm),
      computeBmi(last.weightKg, last.heightCm),
      ''
    ),
    delta(
      'Percentual de gordura',
      first.results?.bodyFatPct,
      last.results?.bodyFatPct,
      'pontos percentuais'
    ),
    delta('Massa magra', first.results?.leanMassKg, last.results?.leanMassKg, 'kg'),
    delta('Massa gorda', first.results?.fatMassKg, last.results?.fatMassKg, 'kg'),
  ].filter((l): l is string => l !== null)

  const faltando = first.results == null || last.results == null

  return [
    `- Da primeira (${fmtDate(first.assessedAt)}) à última (${fmtDate(last.assessedAt)})${dias != null ? `, intervalo de ${dias} dias` : ''}:`,
    ...total.map((l) => `  ${l}`),
    ...(faltando
      ? [
          '  - Composição corporal fora da variação total: uma das pontas da série não tem protocolo de composição calculado.',
        ]
      : []),
  ]
}

function intervalLines(points: AssessmentPromptPoint[]): string[] {
  const out: string[] = []
  for (let i = 1; i < points.length; i++) {
    const dias = daysBetween(points[i - 1].assessedAt, points[i].assessedAt)
    out.push(
      `- ${fmtDate(points[i - 1].assessedAt)} → ${fmtDate(points[i].assessedAt)}: ${dias != null ? `${dias} dias` : 'intervalo indeterminado'}`
    )
  }
  return out
}

function circunferenciasSerieBlock(points: AssessmentPromptPoint[]): string | null {
  const sites = sortSites([...new Set(points.flatMap((p) => p.circumferences.map((c) => c.site)))])
  if (sites.length === 0) return null

  const header = `  Ponto | ${points.map((p) => fmtDate(p.assessedAt)).join(' | ')} | Δ total`
  const rows = sites.map((site) => {
    const valores = points.map((p) => p.circumferences.find((c) => c.site === site)?.valueCm ?? null)
    const primeiro = valores.find((v) => v != null) ?? null
    const ultimo = [...valores].reverse().find((v) => v != null) ?? null
    const delta = primeiro != null && ultimo != null ? fmtSigned(ultimo - primeiro, 1) : null
    return `  ${circumferenceLabel(site)} | ${valores.map((v) => fmtNum(v, 1) ?? '—').join(' | ')} | ${delta ?? '—'}`
  })

  return block('CIRCUNFERÊNCIAS AO LONGO DA SÉRIE (cm, medida direta)', [
    header,
    ...rows,
    '- Célula com "—" significa que o ponto não foi medido naquela data, não que o valor seja zero.',
  ])
}

export function serieBlock(points: AssessmentPromptPoint[]): string {
  const consist = seriesConsistency(points)
  const alertas: string[] = []
  if (consist.protocoloMudou) {
    alertas.push(
      '- ATENÇÃO — o protocolo mudou ao longo da série: ' +
        consist.protocolos.map((id) => protocolLabel(id)).join(', ') +
        '. Percentual de gordura obtido por protocolos diferentes não é diretamente comparável: parte da diferença observada é troca de método, não mudança do avaliado. Trate os trechos com protocolos distintos como séries separadas e diga isso no parecer.'
    )
  }
  if (consist.motoresMudaram) {
    alertas.push(
      '- A versão do motor de cálculo difere entre avaliações. As equações são as mesmas; a diferença está nas checagens de domínio aplicadas. Não é motivo para descartar a comparação, mas vale registrar.'
    )
  }

  return block(`SÉRIE DE AVALIAÇÕES — ${points.length} registros`, [
    '- Tabela (uma linha por avaliação, em ordem cronológica):',
    '  Data | Peso (kg) | IMC | % gordura | Massa magra (kg) | Massa gorda (kg) | Protocolo',
    ...points.map(metricRow),
    '',
    '- Intervalos entre avaliações consecutivas:',
    ...intervalLines(points).map((l) => `  ${l}`),
    '',
    '- Variação total:',
    ...deltaLines(points).map((l) => `  ${l}`),
    ...(alertas.length > 0 ? ['', ...alertas] : []),
  ])
}

const TAREFA_SERIE = `O QUE EU PRECISO DE VOCÊ

Responda nesta ordem, com estes títulos:

1. O que aconteceu, em uma frase
   A leitura mais defensável da série inteira. Se a série não sustenta
   nenhuma leitura, diga isso aqui.

2. O que mudou de fato
   Métrica por métrica: a variação observada, se ela é maior do que o erro
   plausível do método e em que direção. Deixe claro quais mudanças são
   interpretáveis e quais estão dentro do ruído de medição. Medida direta
   (peso, circunferências) e valor estimado (percentual de gordura, massas)
   merecem graus de confiança diferentes — trate-os assim.

3. O padrão da série
   Direção, consistência e ritmo ao longo do tempo. Diga se há tendência,
   estabilidade, reversão ou oscilação sem padrão — e quantos pontos você
   está usando para afirmar isso. Com poucos pontos, diga que são poucos.

4. Leitura conjunta
   O que a combinação das métricas sugere sobre o que mudou na composição, e
   não só no peso. Onde as métricas discordam entre si, diga qual delas é
   mais confiável e por quê.

5. Fatores de confusão
   O que poderia produzir esse mesmo padrão sem que o avaliado tenha mudado:
   troca de protocolo, avaliador diferente, condição de coleta, hidratação,
   momento do ciclo, horário, intervalo curto demais entre medidas.

6. O que isso sugere para o acompanhamento
   O que observar na próxima avaliação, com que intervalo, e que magnitude de
   mudança seria necessária para ser interpretável. Não monte treino nem
   prescreva dieta.

7. O que esta série não permite concluir`

export function buildAssessmentSeriesPrompt(input: AssessmentSeriesPromptInput): string {
  const { subject, points } = input
  const primeira = points[0]
  const ultima = points[points.length - 1]
  return joinBlocks([
    PAPEL,
    `MATERIAL: série de ${points.length} avaliações físicas do mesmo avaliado, de ${fmtDate(primeira?.assessedAt ?? '')} a ${fmtDate(ultima?.assessedAt ?? '')}, em ordem cronológica.`,
    identificacao(subject, ultima?.assessedAt ?? ''),
    serieBlock(points),
    circunferenciasSerieBlock(points),
    // As ressalvas da avaliação mais recente: são as que valem para o estado
    // atual e as que o profissional vai encontrar na tela ao ler o parecer.
    block(`RESSALVAS DO CÁLCULO NA AVALIAÇÃO MAIS RECENTE (${fmtDate(ultima?.assessedAt ?? '')})`, [
      ...ressalvasLines(ultima?.results ?? null),
    ]),
    PREMISSAS_METODOLOGICAS,
    TAREFA_SERIE,
    REGRAS_DE_RIGOR,
    FECHAMENTO,
  ])
}
