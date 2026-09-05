import { medicamentosRespondidos } from './gate'
import { PARQ_ITEMS, type AnamnesisAnswers } from './spec'

// O QUE AINDA FALTA responder para a anamnese poder ser enviada.
//
// A anamnese completa passa de oito mil pixels de altura num celular de 360 px.
// Os blocos são legíveis, mas quem responde não tinha indicação nenhuma de
// quanto falta nem de onde: descobria a pendência ao tocar em Enviar, e voltava
// a rolar procurando. Aqui a lista de pendências vira dado — puro e testável —
// para a tela mostrar contagem, nome e âncora.
//
// Só entra o que é OBRIGATÓRIO. A camada B (objetivo, hábitos, postural) é
// contexto opcional de propósito, e contar "progresso" sobre ela transformaria
// pergunta facultativa em cobrança — além de nunca chegar a 100%.

/** id da seção correspondente, usado como âncora de rolagem no formulário */
export type SecaoId = 'sec-parq' | 'sec-acsm' | 'sec-medicamentos'

export type Pendencia = {
  secao: SecaoId
  /** rótulo curto, na voz de quem responde */
  rotulo: string
  /** quantas respostas faltam dentro do item (o PAR-Q tem sete) */
  faltam: number
}

export function pendenciasDaAnamnese(a: AnamnesisAnswers): Pendencia[] {
  const out: Pendencia[] = []

  const parqSemResposta = PARQ_ITEMS.filter((i) => typeof a.parq[i.key] !== 'boolean').length
  if (parqSemResposta > 0) {
    out.push({
      secao: 'sec-parq',
      rotulo: parqSemResposta === 1 ? 'Sobre sua saúde: 1 pergunta' : `Sobre sua saúde: ${parqSemResposta} perguntas`,
      faltam: parqSemResposta,
    })
  }

  // A2: três respostas, e "Nenhuma" precisa ser DITA — lista vazia sem
  // confirmação é pergunta em branco, não negativa (mesmo desenho do gate).
  const a2: string[] = []
  if (typeof a.ativo_regular !== 'boolean') a2.push('prática de exercício')
  if (a.doenca_cmr_confirmada !== true) a2.push('doenças diagnosticadas')
  if (a.sinais_sintomas_confirmados !== true) a2.push('sinais e sintomas atuais')
  if (a2.length > 0) {
    out.push({
      secao: 'sec-acsm',
      rotulo: `Atividade física e sintomas: ${a2.join(', ')}`,
      faltam: a2.length,
    })
  }

  if (!medicamentosRespondidos(a)) {
    out.push({
      secao: 'sec-medicamentos',
      rotulo: 'Medicamentos em uso',
      faltam: 1,
    })
  }

  return out
}

export function totalPendente(pendencias: Pendencia[]): number {
  return pendencias.reduce((soma, p) => soma + p.faltam, 0)
}
