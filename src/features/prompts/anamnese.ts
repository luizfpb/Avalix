// Prompt de parecer sobre uma anamnese.
//
// Rende as PERGUNTAS junto das respostas, e não só os valores: sem o enunciado
// a IA não sabe o que "ativo_regular = Não" significa, e "Não" para "toma
// medicação?" tem peso oposto ao "Não" de "sente dor no peito?". Campo em
// branco entra explicitamente como "não respondido" — ausência de resposta é
// informação clínica, não lacuna a ser aparada.
//
// Campos que o formulário atual não pergunta (o detalhamento IPAQ de B4, que
// existe no tipo mas não tem UI) só aparecem quando algum payload antigo os
// traz preenchidos: listá-los sempre como "não respondido" sugeriria que a
// pergunta foi feita e ignorada.

import {
  ALCOOL,
  ALTERACAO_POSTURAL,
  DOENCAS_CRONICAS,
  DOENCA_CMR,
  ESTRESSE,
  EXPERIENCIA,
  HISTORIA_FAMILIAR,
  INTENSIDADE,
  LADO_DOMINANTE,
  LESOES,
  LOCAL_TREINO,
  OBJETIVOS,
  PARQ_ITEMS,
  PERFIL_SESSAO,
  RED_FLAGS,
  REGIAO_DOR,
  SINAIS_SINTOMAS,
  SONO_QUALIDADE,
  TABAGISMO,
  TEMPO_EVOLUCAO,
  TEMPO_SESSAO,
  TREINO_FREQ,
  type AnamnesisAnswers,
} from '../anamnesis/spec'
import { computeGate, NIVEL_LABEL } from '../anamnesis/gate'
import { resolveLiberacao, SEM_LIBERACAO, type Liberacao } from '../anamnesis/clearance'
import { posturalEmphasis } from '../workout/contraindications'
import { abbreviateName, ageAt, sexLabel, type PromptSubject } from './identity'
import {
  block,
  boolLabel,
  fmtDate,
  joinBlocks,
  line,
  multiLine,
  optionLabel,
  optionLabels,
  optionalLine,
} from './format'
import { FECHAMENTO, PAPEL, REGRAS_DE_RIGOR } from './guardrails'

export type AnamnesePromptInput = {
  subject: PromptSubject
  assessedAt: string
  answers: AnamnesisAnswers
  liberacao?: Liberacao
}

export function identificacaoBlock(subject: PromptSubject, referenceIso: string): string {
  const idade = ageAt(subject.birthDate, referenceIso)
  return block('IDENTIFICAÇÃO', [
    line('Avaliado', abbreviateName(subject.fullName)),
    line('Idade na data do registro', idade != null ? `${idade} anos` : null),
    line('Sexo biológico', sexLabel(subject.sex)),
    '- O nome vai abreviado de propósito. Não peça nome completo, contato ou qualquer outro identificador: nada disso muda a análise.',
  ])
}

// A triagem já foi decidida por módulo puro e testado (gate.ts, matriz PAR-Q+ /
// ACSM). Entra no prompt como resultado fechado justamente para a IA não
// refazer a matriz por conta própria e chegar num nível diferente do que a tela
// mostra ao profissional.
export function triagemBlock(answers: AnamnesisAnswers, liberacao?: Liberacao): string {
  const gate = computeGate(answers)
  const incomplete = gate.status === 'incompleto'
  return block('RESULTADO DA TRIAGEM — JÁ CALCULADO PELO SISTEMA', [
    '- Saiu de regra fixa e auditada do app (triagem inspirada no PAR-Q+ e na matriz de pré-participação da ACSM). É entrada fixa: explique, não recalcule.',
    line(
      'Estado da triagem',
      incomplete ? 'incompleta — liberação não calculada' : gate.status
    ),
    line('Liberado na triagem', incomplete ? 'não calculado' : gate.liberado ? 'sim' : 'não'),
    line(
      'Nível de encaminhamento',
      incomplete ? 'não calculado' : NIVEL_LABEL[gate.nivelEncaminhamento]
    ),
    line(
      'Sinaliza avaliação médica',
      incomplete ? 'não calculado' : gate.flagEncaminhamento ? 'sim' : 'não'
    ),
    ...(gate.motivos.length > 0
      ? ['- Motivos registrados pelo sistema:', ...gate.motivos.map((m) => `  - ${m}`)]
      : ['- Motivos registrados pelo sistema: nenhum']),
    declaracaoLine(answers),
    ...liberacaoLines(liberacao),
  ])
}

// Autorrelato do avaliado (A3). Entra rotulado como tal: é informação útil
// para a conduta ("existe documento a pedir"), mas não é liberação, e a IA não
// pode tratar as duas como a mesma coisa.
function declaracaoLine(a: AnamnesisAnswers): string {
  const rotulo = 'Avaliado declara liberação médica recente (autorrelato)'
  if (a.liberacao_declarada === false) return line(rotulo, 'não')
  if (a.liberacao_declarada !== true) return line(rotulo, null)
  const quando = a.liberacao_declarada_em ? ` em ${fmtDate(a.liberacao_declarada_em)}` : ''
  return line(rotulo, `sim${quando} — NÃO confirmado por documento`)
}

// Desfecho médico da triagem. Sem estas linhas a IA analisaria um
// encaminhamento já resolvido como se ainda estivesse aberto — e devolveria
// "encaminhe ao médico" para quem acabou de voltar dele.
function liberacaoLines(liberacao?: Liberacao): (string | null)[] {
  const l = resolveLiberacao(liberacao ?? SEM_LIBERACAO)
  if (l.status === 'pendente') {
    return ['- Parecer médico registrado depois da triagem: nenhum.']
  }
  const rotulo =
    l.status === 'nao_liberado'
      ? 'o médico avaliou e NÃO liberou a prática'
      : l.vencida
        ? `liberação médica ${l.status === 'liberado_com_restricoes' ? 'com restrições ' : ''}VENCIDA`
        : l.status === 'liberado_com_restricoes'
          ? 'liberado pelo médico, com restrições'
          : 'liberado pelo médico'
  return [
    `- Parecer médico registrado depois da triagem: ${rotulo}.`,
    line('Data do parecer', fmtDate(l.em)),
    line('Validade do parecer', l.validade ? fmtDate(l.validade) : 'sem validade declarada'),
    optionalLine('Restrições/observações do parecer', l.obs),
    '- O parecer é fato registrado pelo profissional, não recalculável: trate-o como entrada fixa e leve-o em conta antes de sugerir qualquer encaminhamento.',
  ]
}

function parqBlock(a: AnamnesisAnswers): string {
  return block('A1. TRIAGEM DE PRONTIDÃO (PAR-Q+) — 7 itens, resposta Sim/Não', [
    ...PARQ_ITEMS.map((i) => line(i.label, boolLabel(a.parq?.[i.key]))),
    optionalLine('Qual é a condição crônica (desdobramento do item acima)', a.parq_condicao_cronica_qual),
    optionalLine('Qual é a medicação (desdobramento do item acima)', a.parq_medicacao_cronica_qual),
  ])
}

function acsmBlock(a: AnamnesisAnswers): string {
  return block('A2. REFINAMENTO (ACSM)', [
    line(
      'Pratica exercício estruturado regular há 3 meses ou mais (>= 30 min, >= 3x/semana, ao menos moderado)?',
      boolLabel(a.ativo_regular)
    ),
    a.doenca_cmr_confirmada
      ? line(
          'Doença diagnosticada (cardiovascular / metabólica / renal)',
          optionLabels(DOENCA_CMR, a.doenca_cmr) ?? 'Nenhuma (ausência confirmada)'
        )
      : line('Doença diagnosticada (cardiovascular / metabólica / renal)', null),
    a.sinais_sintomas_confirmados
      ? line(
          'Sinais/sintomas atuais',
          optionLabels(SINAIS_SINTOMAS, a.sinais_sintomas) ?? 'Nenhum (ausência confirmada)'
        )
      : line('Sinais/sintomas atuais', null),
  ])
}

function objetivoBlock(a: AnamnesisAnswers): string {
  return block('B1. OBJETIVO E CONTEXTO', [
    multiLine('Objetivo principal', OBJETIVOS, a.objetivo_principal),
    line('Por que esse objetivo é importante pra você hoje?', a.objetivo_motivo),
    line('Onde gostaria de estar daqui a 6 meses?', a.objetivo_6meses),
    line('Esporte/modalidade', a.esporte_modalidade),
    line('Experiência de treino', optionLabel(EXPERIENCIA, a.experiencia_treino)),
    line('Intensidade desejada', optionLabel(INTENSIDADE, a.intensidade_desejada)),
  ])
}

function logisticaBlock(a: AnamnesisAnswers): string {
  return block('B1b. LOGÍSTICA E PREFERÊNCIAS DE TREINO', [
    line('Quantas vezes por semana pretende treinar?', optionLabel(TREINO_FREQ, a.treino_freq_semana)),
    line('Tempo disponível por sessão', optionLabel(TEMPO_SESSAO, a.treino_tempo_sessao)),
    line('Onde vai treinar na maior parte do tempo?', optionLabel(LOCAL_TREINO, a.treino_local)),
    optionalLine('Equipamentos à disposição', a.treino_equipamentos),
    line('Exercícios ou treinos que mais gosta', a.pref_gosta),
    line('Exercícios ou treinos que menos gosta', a.pref_nao_gosta),
    line('Algum exercício que não quer fazer de jeito nenhum?', a.pref_veto),
    line('Estilo de sessão que combina mais', optionLabel(PERFIL_SESSAO, a.perfil_sessao)),
  ])
}

function clinicaBlock(a: AnamnesisAnswers): string {
  const cirurgias = (a.cirurgias ?? [])
    .map((c) => [c.descricao, c.ano].filter(Boolean).join(' · '))
    .filter((s) => s.trim() !== '')
  const medicamentos = (a.medicamentos ?? [])
    .map((m) => [m.nome, m.dose].filter(Boolean).join(' · '))
    .filter((s) => s.trim() !== '')

  return block('B2. HISTÓRIA CLÍNICA', [
    multiLine('Doenças crônicas', DOENCAS_CRONICAS, a.doencas_cronicas),
    line('Cirurgias (priorizando ortopédicas)', cirurgias.length > 0 ? cirurgias.join(' | ') : null),
    // Pergunta obrigatória desde ago/2026: "nenhum" confirmado é resposta, e
    // dizer só "não informado" faria a IA tratar ausência confirmada de
    // medicamento como lacuna de coleta.
    line(
      'Medicamentos em uso',
      medicamentos.length > 0
        ? medicamentos.join(' | ')
        : a.medicamentos_confirmados
          ? 'Nenhum (ausência confirmada)'
          : null
    ),
    line(
      'Morte por doença cardíaca ou súbita em familiar de 1º grau (homem < 55a, mulher < 65a)?',
      optionLabel(HISTORIA_FAMILIAR, a.historia_familiar_dcv)
    ),
    line('Tabagismo', optionLabel(TABAGISMO, a.tabagismo)),
    optionalLine('Maços-ano (estimado)', a.tabagismo_macos_ano),
    line('Álcool', optionLabel(ALCOOL, a.alcool)),
  ])
}

function dorBlock(a: AnamnesisAnswers): string {
  const queixas = (a.dor_queixas ?? []).flatMap((q, i) => {
    const regiao = optionLabel(REGIAO_DOR, q.regiao) ?? 'região não informada'
    return [
      `- Queixa ${i + 1} — ${regiao}`,
      `  - Intensidade (escala 0 a 10): ${q.intensidade ?? 0}`,
      `  - Lesão prévia nesta região: ${q.lesao_previa_regiao ? 'sim' : 'não'}`,
      // registros das specs 1.0/1.1 têm estes campos; a partir da 1.2 a mesma
      // informação vem na narrativa, em vez de em campos de uma linha
      ...(q.tempo_evolucao
        ? [`  - Tempo de evolução: ${optionLabel(TEMPO_EVOLUCAO, q.tempo_evolucao) ?? q.tempo_evolucao}`]
        : []),
      ...(q.fatores_piora?.trim() ? [`  - Piora com: ${q.fatores_piora.trim()}`] : []),
      ...(q.fatores_melhora?.trim() ? [`  - Melhora com: ${q.fatores_melhora.trim()}`] : []),
    ]
  })

  // A narrativa vai ANTES das listas: é o que contextualiza tudo o que vem
  // depois, e num briefing lido de cima para baixo enterrar isso no fim
  // devolveria o recorte puramente biológico que a spec 1.2 saiu de.
  const narrativa = [
    optionalLine('História da dor, nas palavras da pessoa', a.dor_historia),
    optionalLine('O que já tentou, o que piora e o que melhora', a.dor_tentativas),
    optionalLine('O que deixou de fazer por causa da dor, e o que teme', a.dor_impacto_medo),
  ].filter(Boolean)

  return block('B3. DOR E SISTEMA MUSCULOESQUELÉTICO', [
    ...narrativa,
    ...(queixas.length > 0 ? queixas : ['- Queixas de dor: nenhuma registrada']),
    multiLine('Lesões com diagnóstico médico/cirúrgico', LESOES, a.lesoes_diagnosticadas),
    optionalLine(
      'Como está hoje (operado, liberado pelo médico, instabilidade...)',
      a.lesoes_estado_atual
    ),
    multiLine(
      'Sinais de alerta (red flags) — indicam avaliação médica, não treino',
      RED_FLAGS,
      a.red_flags
    ),
  ])
}

function habitosBlock(a: AnamnesisAnswers): string {
  return block('B4. HÁBITOS DE VIDA', [
    line('Ocupação', a.ocupacao),
    line('Horas sentado por dia', a.horas_sentado_dia),
    line('Sono (horas por noite)', a.sono_horas),
    line('Qualidade do sono', optionLabel(SONO_QUALIDADE, a.sono_qualidade)),
    line('Estresse percebido', optionLabel(ESTRESSE, a.estresse_percebido)),
    line('Esforço repetitivo ou carga no trabalho?', boolLabel(a.esforco_repetitivo_carga)),
    optionalLine('Descrição do esforço repetitivo', a.esforco_repetitivo_desc),
    line('Faz acompanhamento nutricional?', boolLabel(a.acompanhamento_nutricional)),
    optionalLine('Atividade física atual — tipo', a.atividade_tipo),
    optionalLine('Atividade física atual — vezes por semana', a.atividade_freq_semanal),
    optionalLine('Atividade física atual — minutos por sessão', a.atividade_duracao_min),
    optionalLine('Atividade física atual — intensidade', a.atividade_intensidade),
  ])
}

function posturalBlock(a: AnamnesisAnswers): string {
  return block('B5. POSTURAL / OCUPACIONAL', [
    line('Lado dominante', optionLabel(LADO_DOMINANTE, a.lado_dominante)),
    line('Atividade assimétrica (tênis, arremesso, instrumento)?', boolLabel(a.atividade_assimetrica)),
    optionalLine('Qual atividade assimétrica', a.atividade_assimetrica_desc),
    line('Usa palmilha ou órtese?', boolLabel(a.uso_palmilha_ortese)),
    optionalLine('Qual palmilha/órtese', a.uso_palmilha_desc),
    multiLine(
      'Alteração postural diagnosticada',
      ALTERACAO_POSTURAL,
      a.alteracao_postural_diagnosticada
    ),
    line('Queixa postural principal', a.queixa_postural_principal),
  ])
}

function mulherBlock(a: AnamnesisAnswers, sex: string | null | undefined): string | null {
  const respondeu = a.gestante !== null || a.pos_parto_recente !== null
  if (sex !== 'F' && !respondeu) return null
  return block('B6. SAÚDE DA MULHER', [
    line('Gestante?', boolLabel(a.gestante)),
    optionalLine('Semanas de gestação', a.gestante_semanas),
    line('Pós-parto recente?', boolLabel(a.pos_parto_recente)),
    optionalLine('Meses desde o parto', a.pos_parto_meses),
  ])
}

function encerramentoBlock(a: AnamnesisAnswers): string | null {
  const linhas = [
    optionalLine('Observações registradas', a.observacoes),
    // Só aparece quando falsa: é ressalva de confiabilidade do material, e o
    // caso normal (declarou) não precisa ocupar espaço no prompt.
    a.declaracao_veracidade === false
      ? '- Atenção: o aluno NÃO marcou a declaração de que respondeu com honestidade.'
      : null,
  ].filter((l): l is string => l !== null)
  return linhas.length > 0 ? block('OBSERVAÇÕES E RESSALVAS DO REGISTRO', linhas) : null
}

// Blocos de pergunta-e-resposta, na ordem da spec. Exportado porque o
// briefing (briefing.ts) reaproveita a anamnese inteira dentro de um prompt
// maior — duplicar a renderização criaria duas versões da mesma pergunta.
const RESPOSTAS_CABECALHO = `RESPOSTAS DA ANAMNESE (pergunta e resposta, na ordem do formulário)
- "não respondido" significa campo deixado em branco.
- "nenhuma opção marcada" aparece em pergunta de múltipla escolha: o aluno não assinalou nenhuma das opções oferecidas, e foi assim que o sistema calculou a triagem. Não é confirmação ativa de ausência — trate como ausência não confirmada.`

export function respostasBlocks(
  a: AnamnesisAnswers,
  sex: string | null | undefined
): (string | null)[] {
  return [
    RESPOSTAS_CABECALHO,
    parqBlock(a),
    acsmBlock(a),
    objetivoBlock(a),
    logisticaBlock(a),
    clinicaBlock(a),
    dorBlock(a),
    habitosBlock(a),
    posturalBlock(a),
    mulherBlock(a, sex),
    encerramentoBlock(a),
  ]
}

// Sinais que o próprio app já deriva das respostas (contraindications.ts).
// Entram para a IA não gastar a resposta redescobrindo o que a tela já mostra
// — e, pela regra 4, para ela não contradizer o que o profissional está vendo.
export function sinaisBlock(a: AnamnesisAnswers): string | null {
  const emphasis = posturalEmphasis(a)
  if (emphasis.length === 0) return null
  return block('SINAIS QUE O SISTEMA JÁ DERIVOU (orientação geral, não diagnóstico)', [
    ...emphasis.map((e) => `- ${e}`),
  ])
}

const TAREFA = `O QUE EU PRECISO DE VOCÊ

Responda nesta ordem, com estes títulos:

1. Quadro em uma frase
   Uma frase factual que situe o caso. Sem adjetivo de efeito.

2. Achados que mudam a conduta
   Lista ordenada por impacto. Para cada achado: o que é, por que importa na
   prescrição de exercício e o que muda na prática. O que for só contexto e
   não mudar nada fica de fora desta lista.

3. Interações entre achados
   O que só aparece quando dois ou mais itens são lidos juntos e passaria
   despercebido item a item. Se não houver nenhuma, diga isso.

4. Leitura do que o aluno escreveu com as próprias palavras
   Motivação, meta de 6 meses, vetos, fatores de piora e melhora, estado das
   lesões, observações. O que isso sugere sobre expectativa, adesão e risco de
   abandono — e onde a expectativa dele conflita com o que a triagem indica.

5. Implicações práticas
   Traduza os itens 2 a 4 em consequências concretas: o que exige cuidado, o
   que deve ser evitado por ora, o que a logística e as preferências limitam.
   Não monte treino: nada de séries, repetições, cargas ou divisão semanal.

6. O que confirmar antes de prescrever
   Perguntas objetivas a fazer ao aluno ou a checar em documento, em ordem de
   prioridade. Diga o que cada resposta mudaria na conduta.

7. O que este material não permite concluir
   Onde a informação é insuficiente, contraditória ou frágil demais para
   sustentar decisão, e o que seria preciso coletar.`

export function buildAnamnesePrompt(input: AnamnesePromptInput): string {
  const { subject, assessedAt, answers, liberacao } = input
  return joinBlocks([
    PAPEL,
    `MATERIAL: anamnese e triagem de prontidão registradas em ${fmtDate(assessedAt)}.`,
    identificacaoBlock(subject, assessedAt),
    triagemBlock(answers, liberacao),
    ...respostasBlocks(answers, subject.sex),
    sinaisBlock(answers),
    TAREFA,
    REGRAS_DE_RIGOR,
    FECHAMENTO,
  ])
}
