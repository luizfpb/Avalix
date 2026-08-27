// Briefing de prescrição: anamnese mais recente + avaliações físicas do mesmo
// avaliado, num prompt só.
//
// É o prompt que os outros três não cobrem. Anamnese e avaliação lidas
// separadamente respondem "como está a saúde dele?" e "como está a composição
// corporal dele?"; lidas juntas respondem a pergunta que o profissional
// realmente tem na frente — "o que eu faço com essa pessoa na segunda-feira?".
// O cruzamento é onde mora o achado que nenhuma das duas telas mostra: meta
// declarada que a triagem não autoriza, queixa de dor que explica a
// estagnação de uma medida, perda de peso acompanhada de perda de massa magra
// em quem disse querer hipertrofia.

import type { AnamnesisAnswers } from '../anamnesis/spec'
import type { Liberacao } from '../anamnesis/clearance'
import { identificacaoBlock, respostasBlocks, sinaisBlock, triagemBlock } from './anamnese'
import {
  circunferenciasBlock,
  dobrasBlock,
  PREMISSAS_METODOLOGICAS,
  resultadoBlock,
  serieBlock,
  type AssessmentPromptPoint,
  type SkinfoldReading,
} from './assessment'
import { fmtDate, joinBlocks } from './format'
import type { PromptSubject } from './identity'
import { FECHAMENTO, PAPEL, REGRAS_DE_RIGOR } from './guardrails'

export type BriefingPromptInput = {
  subject: PromptSubject
  anamnese: { assessedAt: string; answers: AnamnesisAnswers; liberacao?: Liberacao } | null
  // ordem cronológica ascendente; pode vir vazia
  points: AssessmentPromptPoint[]
  skinfolds?: SkinfoldReading[]
}

const PREMISSAS_CRUZAMENTO = `PREMISSAS PARA O CRUZAMENTO (aplicar)

- Anamnese e avaliação física têm naturezas diferentes: a primeira é
  autorrelato coletado num dia, a segunda é medida com erro conhecido. Não
  trate as duas com o mesmo grau de confiança.
- As duas podem ter datas distantes entre si. Antes de cruzar um achado da
  anamnese com uma medida, verifique se as datas permitem essa leitura, e diga
  quando não permitirem.
- Percentual de gordura e massas são estimativas com erro de vários pontos;
  peso e circunferências são medidas diretas. Uma divergência entre eles é
  informação, não erro a ser resolvido escolhendo o número que agrada.
- Correlação temporal entre uma queixa e uma mudança de medida não estabelece
  causa. Muitas outras coisas mudaram no período e não estão neste material.`

const TAREFA_BRIEFING = `O QUE EU PRECISO DE VOCÊ

Responda nesta ordem, com estes títulos:

1. O caso em uma frase
   Quem é este avaliado, o que ele quer e o que a triagem permite. Factual.

2. Restrições não negociáveis
   O que a triagem de prontidão e os achados clínicos impõem antes de
   qualquer prescrição. Isto vem primeiro de propósito: nada nos itens
   seguintes pode passar por cima daqui.

3. Onde a anamnese e os números conversam
   Achados da anamnese que ajudam a explicar o que as medidas mostram, e
   medidas que dão contexto ao que o aluno relatou. Só o que se sustenta.

4. Onde a anamnese e os números discordam
   Contradição entre o que foi relatado e o que foi medido, entre o objetivo
   declarado e o que os dados indicam, ou entre duas medidas. Para cada uma,
   diga qual fonte é mais confiável e por quê — e o que precisaria ser
   checado para resolver.

5. Prioridades de conduta
   Em ordem, o que merece atenção primeiro e por quê. Consequências
   concretas, não plano de treino: nada de divisão semanal, séries,
   repetições, cargas ou dieta.

6. Riscos e o que monitorar
   O que pode dar errado com esta pessoa, que sinal indicaria isso e o que
   acompanhar entre avaliações.

7. O que confirmar antes de prescrever
   Perguntas objetivas, em ordem de prioridade, com o que cada resposta
   mudaria.

8. O que este material não permite concluir`

export function buildBriefingPrompt(input: BriefingPromptInput): string {
  const { subject, anamnese, points, skinfolds } = input
  const ultima = points.length > 0 ? points[points.length - 1] : null
  const referencia = ultima?.assessedAt ?? anamnese?.assessedAt ?? ''

  const materialParts = [
    anamnese ? `anamnese de ${fmtDate(anamnese.assessedAt)}` : 'nenhuma anamnese registrada',
    points.length === 0
      ? 'nenhuma avaliação física registrada'
      : points.length === 1
        ? `1 avaliação física (${fmtDate(points[0].assessedAt)})`
        : `${points.length} avaliações físicas (${fmtDate(points[0].assessedAt)} a ${fmtDate(points[points.length - 1].assessedAt)})`,
  ]

  return joinBlocks([
    PAPEL,
    `MATERIAL: briefing para revisão de conduta — ${materialParts.join(' e ')}. As duas fontes vêm do mesmo avaliado e devem ser lidas em conjunto.`,
    identificacaoBlock(subject, referencia),
    anamnese ? triagemBlock(anamnese.answers, anamnese.liberacao) : null,
    ...(anamnese ? respostasBlocks(anamnese.answers, subject.sex) : []),
    anamnese ? sinaisBlock(anamnese.answers) : null,
    ultima ? resultadoBlock(ultima, subject) : null,
    ultima && skinfolds ? dobrasBlock(skinfolds) : null,
    ultima ? circunferenciasBlock(ultima) : null,
    // A série só entra quando há mais de um ponto: com uma avaliação só, a
    // tabela repetiria o bloco de resultado acima e sugeriria evolução onde
    // não há.
    points.length > 1 ? serieBlock(points) : null,
    // As premissas de método só fazem sentido quando há número medido no
    // material; num briefing sem avaliação seriam regras sobre nada.
    points.length > 0 ? PREMISSAS_METODOLOGICAS : null,
    PREMISSAS_CRUZAMENTO,
    TAREFA_BRIEFING,
    REGRAS_DE_RIGOR,
    FECHAMENTO,
  ])
}
