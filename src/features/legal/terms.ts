// Termos de Uso do Avalix (contrato com o profissional que assina). O termo de
// consentimento do ALUNO é outro documento (features/consent/text.ts).
//
// Mudou o texto de forma relevante: suba TERMS_VERSION e TERMS_UPDATED_AT e
// avise os assinantes com 30 dias de antecedência (cláusula 11).
//
// Decreto 7.962/2013 (comércio eletrônico) pede nome, CPF/CNPJ e endereço do
// fornecedor em local de destaque. Preencha PROVIDER antes de divulgar; campo
// vazio simplesmente não aparece na página.

export const TERMS_VERSION = '1.0'
export const TERMS_UPDATED_AT = '17/10/2026'

export const PROVIDER = {
  name: 'Luiz Felipe',
  document: '123.358.696-39', // CPF (ou CNPJ, quando houver)
  address: 'Resplendor/MG', // cidade/UF ou endereço completo
  email: 'contato@avalixfit.com.br',
}

export type TermsSection = { title: string; paragraphs: string[] }

export const TERMS_SECTIONS: TermsSection[] = [
  {
    title: '1. O que é o Avalix',
    paragraphs: [
      'O Avalix é um software online, oferecido por assinatura, para personal trainers e profissionais de educação física: cadastro de alunos, anamnese, avaliação física e postural, prescrição de treinos com link para o aluno registrar o que fez e relatórios em PDF.',
      'Ao criar uma conta ou assinar um plano, você concorda com estes Termos. Se não concordar, não use o serviço.',
    ],
  },
  {
    title: '2. Sua conta e sua responsabilidade profissional',
    paragraphs: [
      'Você é responsável pelos dados que cadastra, pelo sigilo da sua senha e por tudo o que é feito na sua conta. Recomendamos ativar a verificação em dois fatores em Ajustes.',
      'O Avalix é uma ferramenta de apoio. Cálculos, sugestões de carga, classificações e relatórios não substituem o julgamento do profissional habilitado, nem avaliação médica. A prescrição e o acompanhamento do aluno são de sua responsabilidade.',
      'Você declara que tem habilitação para exercer a atividade (por exemplo, registro no CREF, quando exigido) e que usará o Avalix só para fins profissionais lícitos.',
    ],
  },
  {
    title: '3. Teste grátis e planos',
    paragraphs: [
      'Toda conta nova tem 14 dias de teste grátis, sem precisar informar cartão. O teste vale uma vez por pessoa; organizações adicionais criadas pelo mesmo usuário não ganham um teste novo.',
      'Os planos se diferenciam pelo número de alunos ativos. Os preços e limites em vigor ficam em Ajustes > Plano e cobrança. Alunos inativos não contam para o limite.',
      'Se você passar do limite, nada é apagado: só não é possível cadastrar ou reativar alunos acima dele até mudar de plano ou inativar cadastros.',
    ],
  },
  {
    title: '4. Pagamento e renovação automática',
    paragraphs: [
      'Os pagamentos são processados pelo Asaas, instituição de pagamento parceira. O Avalix não recebe nem armazena os dados do seu cartão. Para pagar por Pix, o Asaas exige nome e CPF ou CNPJ de quem paga; esses dados vão direto para o Asaas.',
      'A assinatura começa no dia do pagamento e se renova automaticamente ao fim de cada ciclo, mensal ou anual, pelo mesmo valor, até que você cancele. No cartão, a cobrança é feita sozinha; no Pix, uma fatura é enviada por e-mail a cada ciclo.',
      'Podemos reajustar os preços. O novo valor só vale para ciclos que começarem pelo menos 30 dias depois do aviso, e você pode cancelar antes disso sem custo.',
    ],
  },
  {
    title: '5. Atraso e acesso só leitura',
    paragraphs: [
      'Se uma cobrança não for paga no vencimento, você tem 5 dias de carência com acesso completo e um aviso no app.',
      'Depois disso, ou ao fim do teste grátis sem assinatura, a conta fica só leitura: você continua vendo, exportando e corrigindo seus dados, mas não cria novos registros. Seus dados não são apagados por falta de pagamento. Os alunos continuam acessando o treino pelo link.',
      'Ao pagar, o acesso completo volta sozinho.',
    ],
  },
  {
    title: '6. Cancelamento e reembolso',
    paragraphs: [
      'Você pode cancelar a qualquer momento em Ajustes > Plano e cobrança, sem multa. Depois de cancelar, não há novas cobranças, e o acesso completo continua até o fim do período já pago.',
      'Direito de arrependimento: em até 7 dias da primeira cobrança, você pode pedir o reembolso integral pelo e-mail de contato, conforme o art. 49 do Código de Defesa do Consumidor. Fora desse prazo, não há reembolso proporcional de período já iniciado.',
      'Estornos e contestações (chargeback) encerram o período pago correspondente.',
    ],
  },
  {
    title: '7. Dados dos seus alunos (LGPD)',
    paragraphs: [
      'Em relação aos dados dos seus alunos, você é o controlador e o Avalix é o operador, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018). O Avalix trata esses dados só para prestar o serviço e conforme as suas instruções, nunca para outras finalidades, e não os vende nem compartilha para publicidade.',
      'Cabe a você ter base legal para coletar os dados, inclusive os de saúde, que são sensíveis. O Avalix oferece o termo de consentimento do aluno, o registro do aceite e as ferramentas de revogação, correção, exportação e exclusão para você atender aos pedidos dos titulares.',
      'Medidas de segurança incluem criptografia em trânsito, controle de acesso por organização no banco de dados, verificação em dois fatores opcional, trilha de auditoria e backups criptografados.',
      'Para funcionar, o Avalix usa provedores de infraestrutura (Supabase para banco de dados e arquivos, Cloudflare para hospedagem, Resend para envio de e-mails e Asaas para pagamentos). Alguns deles podem processar dados fora do Brasil, com as salvaguardas previstas no art. 33 da LGPD. Em caso de incidente de segurança que possa afetar seus alunos, avisaremos você.',
    ],
  },
  {
    title: '8. Seus próprios dados',
    paragraphs: [
      'Sobre você, guardamos o necessário para a conta e a cobrança: e-mail, nome da organização, contato informado, situação da assinatura e registros de acesso para segurança. Usamos esses dados para prestar o serviço, cobrar, dar suporte e cumprir obrigações legais.',
      'Você pode pedir acesso, correção ou exclusão dos seus dados pelo e-mail de contato. Dados de cobrança podem ser mantidos pelo prazo que a lei fiscal exigir.',
    ],
  },
  {
    title: '9. Fim da conta',
    paragraphs: [
      'Enquanto a conta existir, os dados ficam guardados, mesmo sem assinatura, para você consultar e exportar. Para excluir a conta e todos os dados dos seus alunos de forma definitiva, peça pelo e-mail de contato. A exclusão não pode ser desfeita, então exporte antes o que quiser guardar.',
      'Podemos suspender contas usadas para fraude, abuso, violação da lei ou destes Termos, avisando sempre que possível.',
    ],
  },
  {
    title: '10. Disponibilidade e responsabilidade',
    paragraphs: [
      'Trabalhamos para manter o Avalix disponível e seguro, mas o serviço pode ter interrupções para manutenção ou por falhas de terceiros. Não garantimos funcionamento ininterrupto nem livre de erros.',
      'Na máxima extensão permitida pela lei, a responsabilidade do Avalix por danos ligados ao serviço fica limitada ao valor pago por você nos 12 meses anteriores ao fato. Isso não afasta direitos que o Código de Defesa do Consumidor garante.',
    ],
  },
  {
    title: '11. Mudanças nestes Termos',
    paragraphs: [
      'Podemos atualizar estes Termos. Mudanças relevantes serão avisadas por e-mail ou no app com pelo menos 30 dias de antecedência. Continuar usando o Avalix depois disso significa concordar com a nova versão; se não concordar, você pode cancelar.',
    ],
  },
  {
    title: '12. Lei e foro',
    paragraphs: [
      'Estes Termos seguem a lei brasileira. Fica eleito o foro do domicílio do consumidor para resolver qualquer questão.',
    ],
  },
]
