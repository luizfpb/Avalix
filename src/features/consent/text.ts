// TEXTO DE CONSENTIMENTO (LGPD) - versao 1.1.
//
// REGRA DE VERSIONAMENTO: o hash gravado no aceite (consent_records.
// consent_text_sha256) e calculado sobre o texto EXATO retornado por
// consentText(). Qualquer mudanca (ate um espaco) exige nova versao.
//
// A migration 0020 possui a copia canonica deste texto. Ela valida o hash
// recebido e grava texto, nome do Controlador, versao e hash como snapshots.
// Ao editar este arquivo, a funcao SQL deve mudar byte-a-byte na mesma janela.

export const CONSENT_VERSION = '1.1'

function controllerLabel(name: string | null | undefined): string {
  const normalized = name?.trim()
  return normalized && normalized.length > 0
    ? normalized
    : 'o profissional ou a organização responsável pela sua avaliação'
}

export function consentText(controllerName: string | null | undefined): string {
  const controller = controllerLabel(controllerName)
  return `Termo de Consentimento para Tratamento de Dados Pessoais e de Saúde

1. Controlador e alcance deste termo
Ao confirmar, você autoriza ${controller} (o “Controlador”) a tratar, por meio do Avalix, seus dados pessoais e dados pessoais sensíveis de saúde para as finalidades descritas neste termo.

2. Dados tratados
- Identificação, cadastro e contato: nome, data de nascimento, sexo biológico, telefone, e-mail, responsável legal e relação com o responsável.
- Anamnese e saúde: histórico de saúde, sintomas, dores, lesões, doenças, cirurgias, limitações, medicamentos, gestação ou possibilidade de gravidez, hábitos, prática de atividade física, objetivos e respostas fornecidas nos formulários.
- Avaliação física e postural: peso, altura, dobras cutâneas, circunferências, composição corporal calculada, fotografias do corpo e anotações associadas.
- Acompanhamento: planos e registros de treino, séries, cargas, repetições, percepção de esforço, agenda de avaliações, evolução e observações do profissional.
- Operação e segurança: registros de acesso, auditoria, erros técnicos, dispositivo/navegador e ações de exportação.

3. Finalidades
Os dados são usados para cadastrar e identificar você, realizar anamnese e avaliações físicas ou posturais, verificar cuidados e encaminhamentos necessários, planejar e acompanhar treinos, organizar a agenda, acompanhar sua evolução, manter a segurança e a rastreabilidade do serviço e gerar relatórios ou exportações solicitados.

4. Base legal e liberdade de escolha
O tratamento baseado neste termo utiliza o consentimento previsto na Lei nº 13.709/2018 (LGPD), art. 7º, inciso I, para dados pessoais, e art. 11, inciso I, para dados pessoais sensíveis de saúde. O consentimento é livre e pode ser recusado ou revogado, ciente de que isso pode impedir novas coletas e funcionalidades que dependam desses dados.

5. Compartilhamento e infraestrutura
Os dados não são vendidos. Eles podem ser tratados por profissionais autorizados da organização e por fornecedores de infraestrutura, armazenamento, autenticação, processamento e suporte necessários ao funcionamento do Avalix, sujeitos a deveres de segurança e confidencialidade, além das hipóteses exigidas por lei ou por autoridade competente.

6. PDFs, CSV, Google Agenda e WhatsApp
Relatórios em PDF e exportações em CSV somente são gerados por ação explícita de usuário autorizado. Inclusões no Google Agenda e compartilhamentos pelo WhatsApp também somente ocorrem após ação explícita: o Avalix não envia esses dados automaticamente. Depois do envio a um serviço externo ou destinatário escolhido, o tratamento também fica sujeito às práticas desse terceiro; confira o conteúdo antes de compartilhar.

7. Armazenamento, segurança e retenção
O Controlador deve limitar o acesso a pessoas autorizadas e adotar medidas técnicas e administrativas de segurança. Fotografias processadas pelo aplicativo têm os metadados de localização removidos antes do envio. Os dados são mantidos enquanto forem necessários para o acompanhamento e para as finalidades informadas, durante a relação com o Controlador ou pelos prazos de guarda exigidos por lei ou necessários ao exercício regular de direitos. Encerrada a necessidade, devem ser eliminados ou anonimizados, ressalvadas as hipóteses legais de conservação. Convites cancelados, rejeitados ou expirados têm as respostas e os dados de cadastro anonimizados pelo sistema.

8. Seus direitos e contato
Você pode solicitar ao Controlador confirmação do tratamento, acesso, correção, informação sobre compartilhamentos, anonimização, bloqueio, eliminação ou portabilidade quando aplicável, além de retirar o consentimento e obter informações sobre as consequências da retirada. Solicitações devem ser dirigidas ao Controlador identificado no início deste termo, pelos canais que ele disponibilizar.

9. Revogação
Você pode revogar este consentimento a qualquer momento. A revogação bloqueia novas coletas baseadas nele, mas não invalida tratamentos realizados licitamente antes da retirada. Um novo consentimento, se necessário, gera um novo registro sem apagar o histórico da revogação.

10. Crianças, adolescentes e responsável legal
Para titular menor de 18 anos ou que não possa consentir por si, o aceite deve ser feito pelo responsável legal, no melhor interesse do titular e com observância do art. 14 da LGPD. O responsável declara possuir legitimidade para fornecer o consentimento.

11. Declaração
Declaro que li e compreendi este termo, tive oportunidade de esclarecer dúvidas e forneço informações verdadeiras. Ao digitar meu nome completo e confirmar, manifesto consentimento livre, informado e inequívoco para o tratamento descrito.`
}

export type ConsentContent = {
  version: string
  text: string
}

export function consentContent(controllerName: string | null | undefined): ConsentContent {
  return { version: CONSENT_VERSION, text: consentText(controllerName) }
}
