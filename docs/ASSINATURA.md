# Assinatura paga (Asaas) — como ligar

Estado em 17/10/2026: código, migration 0049 e testes prontos. Falta criar a
conta no Asaas, configurar os segredos, publicar as duas Edge Functions e
testar no sandbox. Nada disso foi executado daqui.

## O que foi decidido

- **Asaas**, conta de **pessoa física (CPF)** para começar. Sem mensalidade,
  paga por cobrança recebida (no site, em 10/2026: Pix R$ 1,99; cartão
  2,99% + R$ 0,49; os três primeiros meses têm taxa promocional). Confirme
  na sua conta, porque a taxa pode mudar.
- **Planos** (preços na tabela `plans`; mudar é um `UPDATE`, sem deploy):

  | Plano | Limite | Mensal | Anual (10x) |
  |---|---|---|---|
  | Até 30 | 30 avaliados ativos | R$ 19,90 | R$ 199,00 |
  | Ilimitado | sem limite | R$ 39,90 | R$ 399,00 |

  Preço de lançamento, aplicado por UPDATE em 17/10/2026 (a 0049 semeou
  49,90/499 e 89,90/899). Assinatura já feita mantém no Asaas o valor da
  época; subir o preço depois só vale para quem assinar ou trocar de plano.

- **Teste grátis** de 14 dias no Ilimitado, só na primeira organização de
  cada usuário.
- **Carência** de 5 dias depois do vencimento, com aviso no topo do app.
- **Vencido = só leitura.** Ver, exportar, corrigir cadastro, revogar
  consentimento e excluir continuam liberados. Criar avaliado, avaliação,
  anamnese, postura, agendamento, plano de treino e links fica travado. **Nada
  é apagado por falta de pagamento.** O aluno continua registrando treino pelo
  link.
- **Organizações que já existiam** quando a 0049 entrou viram **cortesia**:
  sem cobrança e sem limite. Para pôr uma delas em teste:
  `update public.org_subscriptions set status = 'trial', trial_ends_at = now() + interval '14 days' where org_id = '<uuid>';`
- **Pagamento:** checkout hospedado pelo Asaas (o cartão nunca passa pelo
  Avalix), recorrente, cartão ou Pix. Pix gera uma fatura por ciclo; o
  Asaas avisa o cliente por e-mail e o app mostra "Pagar fatura".
- **Troca de plano:** o limite novo vale na hora, e o valor novo vale a partir
  da próxima cobrança, sem cobrança proporcional. Não deixa descer para o
  Até 30 com mais de 30 ativos.
- **Cancelamento:** pelo app, a qualquer momento. O acesso segue até o fim do
  período pago.
- **Arrependimento (7 dias, CDC art. 49):** o reembolso é manual, feito no
  painel do Asaas. O estorno chega por webhook e devolve o período daquela
  cobrança. O e-mail de contato na tela é `contato@avalixfit.com.br`
  (`SUPPORT_EMAIL` em `src/features/billing/rules.ts`).

## Peças

- `supabase/migrations/0049_assinatura.sql`: planos, estado da assinatura,
  `app.org_access`, as travas (triggers `*_b9_billing`), `billing_events`
  (idempotência) e as RPCs `billing_*` (só service role), mais
  `get_org_billing` e `billing_manage_org` (usuário).
- `supabase/functions/billing`: assinar, trocar e cancelar (JWT do usuário,
  owner/admin com 2FA em dia).
- `supabase/functions/billing-webhook`: eventos do Asaas, autenticados pelo
  header `asaas-access-token`. Pagamento só ativa depois de reconsultado no
  Asaas.
- `src/pages/Plano.tsx` (`/configuracoes/plano`) e `src/components/BillingBanner.tsx`.
- `scripts/asaas-webhook.mjs`: cria o webhook no Asaas pela API.

## Passo a passo (CMD, um comando por vez)

### 1. Banco
Aplique `0049_assinatura.sql` no SQL Editor do Supabase e regenere os tipos
pelo CMD:

```cmd
npx supabase gen types typescript --linked > src\lib\database.types.ts
```

**Atenção:** o gate do deploy agora exige `0049`. Aplique a migration **antes**
de dar push.

### 2. Conta no sandbox do Asaas
Crie a conta em https://sandbox.asaas.com (é separada da conta real) e gere a
chave em Integrações → Chave de API.

### 3. Token do webhook (gera um aleatório)

```cmd
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Segredos das Edge Functions

```cmd
npx supabase secrets set ASAAS_ENV=sandbox ASAAS_API_KEY=COLE_A_CHAVE ASAAS_WEBHOOK_TOKEN=COLE_O_TOKEN APP_URL=https://avalixfit.com.br
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já existem
nas functions. Se o projeto desativou as chaves antigas (JWT), grave também
`BILLING_SERVICE_KEY` (chave `sb_secret_...`) e `BILLING_PUBLISHABLE_KEY`.

### 5. Publicar as functions

```cmd
npx supabase functions deploy billing
```

```cmd
npx supabase functions deploy billing-webhook --no-verify-jwt
```

### 6. Webhook no Asaas

```cmd
set ASAAS_API_KEY=COLE_A_CHAVE
```

```cmd
set ASAAS_WEBHOOK_TOKEN=COLE_O_TOKEN
```

```cmd
set ASAAS_WEBHOOK_EMAIL=SEU_EMAIL
```

```cmd
node scripts/asaas-webhook.mjs
```

### 7. Testar no sandbox
Crie uma conta nova no app (para nascer em teste) e assine em Ajustes → Plano
e cobrança. No sandbox:

- **Cartão:** use os cartões de teste da documentação do Asaas. Deve virar
  "Ativa" em segundos.
- **Pix:** no painel do sandbox, abra a cobrança e confirme o recebimento.
- **Atraso:** mude o vencimento da cobrança para o passado. Deve aparecer
  "Pagamento pendente" com o link da fatura.
- **Estorno e cancelamento:** devem refletir no app.

Para conferir o webhook (fila pausada aparece na lista):

```cmd
node scripts/asaas-webhook.mjs listar
```

Logs das functions: painel do Supabase → Edge Functions → Logs.

### 8. Produção
Crie a conta real no Asaas (CPF), envie os documentos e aguarde a aprovação.
Depois repita os passos 4 e 6 com `ASAAS_ENV=production` e a chave real.

```cmd
set ASAAS_ENV=production
```

## Pendências conhecidas

- **Pix Automático** (débito recorrente por Pix) no Asaas exige CNPJ ativo
  há 6 meses. Até lá, Pix recorrente é fatura por ciclo, que o cliente paga.
- **Checkout recorrente com Pix:** a documentação do Asaas não deixa
  explícito se ele aceita Pix. Confirmar no sandbox; se não aceitar, o
  checkout mostra só cartão, e o Pix fica para a fatura das cobranças
  seguintes.
- **Nota fiscal:** pessoa física não emite NFS-e pelo Asaas. Receita de
  pessoa física para pessoa física entra no carnê-leão mensal. Falar com um
  contador antes de o faturamento crescer (ME no Simples, por causa do fator R).
- **Termos de Uso** do serviço (preço, renovação, cancelamento, dados após o
  fim) ainda não existem como página.
- Criar o e-mail `contato@avalixfit.com.br` (Cloudflare Email Routing,
  encaminhando para a sua caixa).
