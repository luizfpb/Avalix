// TEXTO DE CONSENTIMENTO (LGPD) - RASCUNHO.
//
// ATENCAO: rascunho tecnico, NAO revisado por advogado. Antes do beta com
// titular real, faca revisao juridica. Ao publicar a versao final, troque
// CONSENT_VERSION e o texto JUNTOS.
//
// REGRA DE VERSIONAMENTO: o hash gravado no aceite (consent_records.
// consent_text_sha256) e calculado sobre o texto EXATO retornado por
// consentText(). Qualquer mudanca (ate um espaco) muda o hash. Por isso,
// sempre que editar o texto, incremente CONSENT_VERSION.
//
// O Controlador (profissional/organizacao) aparece no texto pelo nome (vindo de
// organizations.name). Como o nome entra no texto, o hash varia por org: o
// registro de aceite prova exatamente o texto, com o nome, que a pessoa leu.

export const CONSENT_VERSION = '0.1-rascunho'

function controllerLabel(name: string | null | undefined): string {
  const n = name?.trim()
  return n && n.length > 0 ? n : 'o profissional ou a organização responsável pela sua avaliação'
}

export function consentText(controllerName: string | null | undefined): string {
  const controller = controllerLabel(controllerName)
  return `Termo de Consentimento para Tratamento de Dados Pessoais e de Saúde

1. O que este termo autoriza
Ao confirmar, você autoriza ${controller} (o "Controlador") a coletar e tratar seus dados pessoais e seus dados pessoais sensíveis de saúde, por meio do aplicativo BodyTrack, para as finalidades descritas abaixo.

2. Dados tratados
- Identificação e contato: nome, data de nascimento, sexo biológico, telefone e e-mail.
- Avaliação física: peso, altura, dobras cutâneas, circunferências e a composição corporal calculada a partir desses dados.
- Avaliação postural: fotografias do corpo e anotações associadas.
- Observações registradas pelo profissional durante o acompanhamento.

3. Finalidade
Os dados são usados para realizar e registrar avaliações físicas e posturais, acompanhar sua evolução ao longo do tempo e gerar relatórios para você e para o profissional responsável. Não são usados para outras finalidades sem novo consentimento.

4. Base legal
O tratamento dos dados de saúde se baseia no seu consentimento, nos termos da Lei nº 13.709/2018 (LGPD), art. 7º, inciso IX, e art. 11, inciso I.

5. Compartilhamento
Seus dados não são vendidos nem compartilhados com terceiros, exceto quando necessário para a prestação do serviço (por exemplo, a infraestrutura que armazena os dados) ou por obrigação legal. O BodyTrack atua como operador, tratando os dados em nome do Controlador.

6. Armazenamento e segurança
Os dados ficam em ambiente de acesso restrito, protegidos por controle de acesso. As fotografias têm a localização (GPS) removida antes do envio.

7. Seus direitos
A qualquer momento você pode solicitar ao Controlador acesso, correção, exclusão ou portabilidade dos seus dados, além de revogar este consentimento.

8. Revogação
Você pode revogar este consentimento a qualquer momento. A revogação impede novas coletas, mas não afeta os tratamentos já realizados de forma lícita. Dados já coletados podem ser mantidos quando houver obrigação legal de guarda.

9. Retenção
Os dados são mantidos enquanto durar a relação com o profissional e a finalidade da avaliação, ou pelo prazo exigido por lei.

10. Responsável legal
Se o titular for menor de 18 anos ou não puder consentir por si, o consentimento é dado pelo responsável legal, no melhor interesse do titular (LGPD, art. 14).

11. Declaração
Declaro que li e compreendi este termo e que as informações que forneço são verdadeiras. Ao digitar meu nome completo e confirmar, manifesto meu consentimento livre, informado e inequívoco para o tratamento dos dados descritos.`
}

export type ConsentContent = {
  version: string
  text: string
}

export function consentContent(controllerName: string | null | undefined): ConsentContent {
  return { version: CONSENT_VERSION, text: consentText(controllerName) }
}
