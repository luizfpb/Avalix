// Geradores de prompt para IA externa. O app não chama IA nenhuma: ele monta
// o texto, o profissional copia e cola na IA que já usa. Custo zero, nenhuma
// chave para guardar, funciona offline e sem lock-in de fornecedor.
//
// Todos os builders são funções puras sobre dados já carregados na tela, o que
// os deixa testáveis por snapshot — que é como o conteúdo dos prompts fica
// travado contra mudança acidental.

export { PROMPT_VERSION } from './guardrails'
export { abbreviateName, ageAt, sexLabel, type PromptSubject } from './identity'
export { buildAnamnesePrompt, type AnamnesePromptInput } from './anamnese'
export {
  buildAssessmentPrompt,
  buildAssessmentSeriesPrompt,
  seriesConsistency,
  type AssessmentPromptInput,
  type AssessmentPromptPoint,
  type AssessmentSeriesPromptInput,
  type SkinfoldReading,
} from './assessment'
export { buildBriefingPrompt, type BriefingPromptInput } from './briefing'
