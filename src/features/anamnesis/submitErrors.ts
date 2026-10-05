import { normalizeDbError } from '../../lib/errors'

// Recusas do envio público da anamnese (RPC submit_anamnese_intake) na língua
// de quem está respondendo. As mensagens do banco são curtas e sem acento, e
// falam com o desenvolvedor: "quem assina como titular deve ser o avaliado
// cadastrado" não diz ao aluno que basta digitar o nome do jeito que o
// profissional cadastrou — e ele nunca viu esse cadastro.
export function intakeSubmitErrorMessage(
  error: unknown,
  context: { orgName: string; subjectFirstName: string | null }
): string {
  const raw = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : String(error ?? '')
  const text = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  if (text.includes('quem assina como titular deve ser o avaliado cadastrado')) {
    const inicio = context.subjectFirstName ? `, que começa com "${context.subjectFirstName}"` : ''
    return `O nome de quem aceita precisa ser igual ao nome completo cadastrado por ${context.orgName}${inicio}. ` +
      'Confira acentos e sobrenomes ou peça ao profissional para conferir o cadastro.'
  }
  if (text.includes('quem assina deve ser o responsavel legal cadastrado')) {
    return 'O nome de quem aceita precisa ser igual ao nome do responsável legal cadastrado. ' +
      'Confira acentos e sobrenomes ou peça ao profissional para conferir o cadastro.'
  }
  if (text.includes('menor de idade exige aceite e cadastro do responsavel legal')) {
    return 'Menor de idade: quem aceita o termo é o responsável legal, e o nome dele precisa estar no cadastro. ' +
      `Se ainda não está, peça a ${context.orgName} para incluí-lo.`
  }
  // Também é o que chega quando o envio deu certo mas a resposta se perdeu na
  // rede e a pessoa tocou em Enviar de novo.
  if (text.includes('link invalido, expirado ou ja utilizado')) {
    return 'Este link não aceita mais envios: ele expirou ou suas respostas já foram recebidas. ' +
      'Se você acabou de enviar, não precisa fazer mais nada.'
  }
  if (text.includes('formulario desatualizado')) {
    return `Este formulário foi atualizado. Peça um novo link a ${context.orgName}.`
  }
  return normalizeDbError(error)
}
