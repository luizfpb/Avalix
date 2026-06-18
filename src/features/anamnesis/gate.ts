import { PARQ_ITEMS, type AnamnesisAnswers } from './spec'

// Gate de prontidão — lógica pura e testável (spec: "calcule num único módulo
// puro, separado da UI"). Inspirado no PAR-Q+ (triagem) e nas diretrizes ACSM
// de pré-participação (matriz de encaminhamento). É TRIAGEM, não diagnóstico.

export type NivelEncaminhamento = 'liberado' | 'antes_vigorosa' | 'antes_iniciar'

export type GateResult = {
  // PAR-Q: liberado quando os 7 itens são "Não"
  liberado: boolean
  // matriz ACSM
  nivelEncaminhamento: NivelEncaminhamento
  // qualquer sinal que peça avaliação médica (PAR-Q, sintomas, doença, red flag, gestação)
  flagEncaminhamento: boolean
  motivos: string[]
}

export const NIVEL_LABEL: Record<NivelEncaminhamento, string> = {
  liberado: 'Liberado',
  antes_vigorosa: 'Liberação médica antes de intensidade vigorosa',
  antes_iniciar: 'Liberação médica antes de iniciar',
}

export function computeGate(a: AnamnesisAnswers): GateResult {
  const motivos: string[] = []

  // A1 — PAR-Q+: qualquer "Sim" tira a liberação automática
  const parqYes = PARQ_ITEMS.some((i) => a.parq[i.key] === true)
  const liberado = !parqYes
  if (parqYes) {
    motivos.push(
      'Triagem (PAR-Q+): ao menos uma resposta "Sim" — buscar liberação de profissional de saúde antes de progredir a intensidade.'
    )
  }

  // A2 — matriz ACSM
  const sintomas = a.sinais_sintomas.length > 0
  const cmr = a.doenca_cmr.length > 0
  const ativo = a.ativo_regular === true

  let nivelEncaminhamento: NivelEncaminhamento
  if (sintomas) {
    nivelEncaminhamento = 'antes_iniciar'
  } else if (cmr && !ativo) {
    nivelEncaminhamento = 'antes_iniciar'
  } else if (cmr && ativo) {
    nivelEncaminhamento = 'antes_vigorosa'
  } else {
    nivelEncaminhamento = 'liberado'
  }

  // sinais que pedem avaliação médica
  const redFlags = a.red_flags.length > 0
  const gestante = a.gestante === true

  if (sintomas) {
    motivos.push('Sinais/sintomas cardiovasculares presentes — liberação médica antes de exercício.')
  }
  if (cmr) {
    motivos.push('Doença cardiovascular, metabólica ou renal referida.')
  }
  if (redFlags) {
    motivos.push('Red flag(s) de coluna — indica avaliação médica, não é caso de treino.')
  }
  if (gestante) {
    motivos.push('Gestante — exige protocolo próprio e acompanhamento.')
  }

  const flagEncaminhamento = parqYes || sintomas || cmr || redFlags || gestante

  return { liberado, nivelEncaminhamento, flagEncaminhamento, motivos }
}
