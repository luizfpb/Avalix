import { protocolLabel } from './protocols/registry'

// Comparabilidade entre avaliações de PROTOCOLOS diferentes, num lugar só.
//
// A regra já existia — mas só no prompt de parecer, que avisa a IA de que
// "percentual de gordura obtido por protocolos diferentes não é diretamente
// comparável: parte da diferença observada é troca de método, não mudança do
// avaliado". A tela de comparação, a evolução e os PDFs calculavam e COLORIAM
// a mesma diferença sem dizer isso a ninguém — e é o profissional, não a IA,
// quem assina o parecer.
//
// O que muda de protocolo: densidade corporal e tudo que sai dela (percentual
// de gordura, massa gorda, massa magra). O que NÃO muda: peso, altura, IMC e
// circunferências, que são medida direta e continuam comparáveis. Por isso o
// aviso é específico, e não um disclaimer geral que ensinaria a ignorar tudo.

/** métricas derivadas do protocolo — as que a troca de método desloca */
export const METRICAS_DEPENDENTES_DO_PROTOCOLO = new Set([
  'bodyFatPct',
  'leanMassKg',
  'fatMassKg',
])

export type Comparabilidade = {
  /** protocolos distintos encontrados na série, em ordem de aparição */
  protocolos: string[]
  protocoloMudou: boolean
  /** frase pronta para a tela/relatório; null quando não há o que avisar */
  aviso: string | null
}

export function comparabilidadeDeProtocolos(
  protocolIds: (string | null | undefined)[]
): Comparabilidade {
  const protocolos = [...new Set(protocolIds.filter((id): id is string => !!id))]
  if (protocolos.length < 2) {
    return { protocolos, protocoloMudou: false, aviso: null }
  }
  return {
    protocolos,
    protocoloMudou: true,
    aviso:
      `Protocolos diferentes nesta série (${protocolos.map(protocolLabel).join(', ')}). ` +
      'Percentual de gordura e massas vêm de equações distintas: parte da diferença é troca ' +
      'de método, não mudança do avaliado. Peso, IMC e circunferências continuam comparáveis.',
  }
}
