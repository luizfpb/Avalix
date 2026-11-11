# Auditoria — integração, confiança no cliente, concorrência, idempotência e responsabilidades

Data: 11/11/2026. Base: `main` em `07b5c05`, árvore limpa. Escopo: leitura do
código, das 57 migrations e das duas Edge Functions, mais a suíte vitest
(hermética). Nenhum arquivo do projeto foi alterado além deste relatório.
Nenhuma migration foi aplicada e nada foi instalado.

## Estado das correções (11/11/2026)

Os 5 achados do topo foram corrigidos no código: migration
`0058_cobranca_plano_pago.sql`, handlers das functions em
`supabase/functions/*/handler.ts` com 23 testes, `npm run test:db` e o
workflow `.github/workflows/db-tests.yml`. pgTAP 0001–0058 no PostgreSQL 18
descartável: 641 verificações em 32 suítes, todas verdes. **Só valem em
produção depois de aplicar a 0058 e publicar `billing` e `billing-webhook`**
(ver `docs/ASSINATURA.md`). O workflow do banco ainda não rodou no GitHub. Os
achados médios e baixos fora do topo (teste grátis ao recriar a organização,
chave de idempotência no Asaas, rebaixamento em paralelo com cadastro,
refatoração do `TreinoAluno.tsx`) seguem em aberto.

## Os 5 achados de maior risco

| # | Achado | Risco | Onde |
|---|---|---|---|
| 1 | **O plano liberado depois do pagamento é o do último checkout aberto, não o do que foi pago.** Abrir um checkout do Até 30 (R$ 19,90), abrir outro do Ilimitado (R$ 100,00) e pagar o primeiro link deixa a organização no Ilimitado, com o Asaas cobrando R$ 19,90 todo mês. | **Alto** | `supabase/migrations/0052_assinatura_pix_pendente_e_so_leitura.sql:236`, `supabase/functions/billing/index.ts:104` e `:159` |
| 2 | **Os handlers HTTP das duas Edge Functions (`billing` e `billing-webhook`) não têm nenhum teste**, e os testes de banco (pgTAP) não rodam no CI. O caminho do dinheiro só é exercitado em produção. | **Alto** | `supabase/functions/billing/index.ts`, `supabase/functions/billing-webhook/index.ts`, `.github/workflows/deploy.yml:29-32` |
| 3 | **O webhook reconsulta o pagamento no Asaas, mas continua achando a organização pelos campos do corpo recebido** (`payment.subscription`, `payment.externalReference`). Com o token vazado, um pagamento real qualquer da conta ativa a organização que o atacante escolher. | Médio | `supabase/functions/billing-webhook/index.ts:53-59` e `:62-86` |
| 4 | **Quando uma assinatura nova substitui outra, o cancelamento da antiga no Asaas pode falhar em silêncio.** O evento já ficou marcado como processado, então ninguém tenta de novo e o cliente segue com duas cobranças. | Médio | `supabase/functions/billing-webhook/index.ts:102-105` |
| 5 | **A troca de plano grava no banco e depois no Asaas, sem atomicidade nem trava.** Se a resposta se perde ou dois pedidos se cruzam, o banco e o Asaas ficam com planos diferentes: o cliente usa o Ilimitado pagando o Até 30, ou o contrário. | Médio | `supabase/functions/billing/index.ts:179-205` |

O que está bem feito, para dar contexto: RLS ligada nas 30 tabelas, nenhuma
policy de escrita com `true`, todas as RPCs sensíveis com `revoke` explícito
de `anon`, limite de avaliados com advisory lock no banco, papéis protegidos
por trigger, idempotência do webhook por chave primária e uma suíte vitest de
1308 testes, todos verdes.

---

## 1. Testes de integração

**Ferramentas.** Há duas suítes:

- **vitest** (`npm run test`), com jsdom e Testing Library. É hermética: o
  `vite.config.ts:120-123` força `VITE_SUPABASE_URL=https://example.supabase.co`
  e uma chave falsa, então nada sai para a rede. **Rodei: 153 arquivos e
  1308 testes, 1308 passando e 0 falhando** (35 s).
- **pgTAP** em `supabase/tests/` (31 suítes, `*.test.sql`). Cada arquivo abre
  transação e faz `rollback` ao fim, e o cabeçalho exige "PostgreSQL/Supabase
  descartável". Essas suítes chamam as funções reais sob `authenticated`,
  `anon` e `service_role`, e são os únicos testes que batem no banco de
  verdade.

**Banco de teste separado.** Não existe um configurado no repositório: não há
`supabase start`, nem docker, nem script que aplique as migrations e rode o
`pg_prove`. O `psql` 18 está instalado nesta máquina, e o registro da rodada
anterior (`docs/AUDITORIA_2026-10-23.md:14`) diz que 568 verificações em 27
suítes passaram contra um PostgreSQL 18 descartável com as migrations até a
0053. **Não verificado agora:** rodar o pgTAP exige aplicar as 57 migrations
num banco, e a tarefa proíbe rodar migration. As suítes 0054 a 0057 não
constam daquele registro.

**Comando para rodar tudo:** `npm run check` (lint, vitest, build e
`check:build`). O pgTAP fica fora dele e fora do CI.

### Fluxos críticos

| Fluxo | Teste batendo na rota/banco de verdade | Só unitário ou com mock | Sem nada |
|---|---|---|---|
| Cadastro (Supabase Auth + `create_organization` + teste grátis) | pgTAP de `create_organization` e do gatilho do teste grátis (0020, 0022, 0028, 0049) | — | Tela `src/pages/Cadastro.tsx` (sem `.test`) |
| Login + 2FA | pgTAP do gate de 2FA (`0022_mfa_gate_org.test.sql`) | `AuthProvider.test.ts`, `recovery.test.ts`, `RecoveryFlow.test.tsx`, `emailLink.test.ts` (cliente mockado) | Tela `src/pages/Login.tsx` |
| Checkout (cartão e Pix) | pgTAP de `billing_checkout_started` e `billing_snapshot` | `billing.test.ts` (só funções puras: corpo do checkout, CPF, data); `Plano.test.tsx` mocka `features/billing/api` | **Handler `supabase/functions/billing/index.ts` inteiro** (`startCard`, `startPix`, permissão, CORS) |
| Assinatura (trocar e cancelar) | pgTAP de `billing_change_plan`, `billing_mark_canceled`, `billing_discard_pending` | `Plano.test.tsx` (mock) | `changePlan`, `cancel` e `discardPending` do handler, incluindo o desfazer quando o Asaas recusa |
| Webhook do Asaas | pgTAP de `billing_apply_event`, incluindo "o mesmo evento duas vezes não muda nada" (`0049_assinatura.test.sql:192`) | `parseWebhook` e `safeEqual` em `billing.test.ts` | **Handler `supabase/functions/billing-webhook/index.ts` inteiro**: token, reconsulta do pagamento, busca da organização, cancelamento da assinatura substituída |
| Link público do aluno (treino) | pgTAP de `submit_workout_session` e do `client_ref` (0027, 0036, 0043, 0045...) | `TreinoAluno*.test.tsx` (API mockada) | — |
| Anamnese pública | pgTAP de `submit_anamnese_intake` (0020, 0043) | `AnamnesePublica.test.tsx` (mock) | — |

| Achado | Risco | Arquivo e linha | Correção sugerida |
|---|---|---|---|
| Os handlers das Edge Functions de cobrança não têm teste. Erro na ordem das chamadas, no desfazer da troca de plano ou na busca da organização só aparece em produção. | **Alto** | `supabase/functions/billing/index.ts:235-276`, `supabase/functions/billing-webhook/index.ts:27-112` | Extrair o corpo de cada `Deno.serve` para uma função `handle(req, deps)` com `asaas` e `rpc` injetados e testar no vitest com dublês que registram as chamadas: assinatura dupla, Asaas recusando, webhook repetido, organização desconhecida. |
| pgTAP fora do CI: uma migration nova pode quebrar regra de cobrança, RLS ou 2FA e o deploy passa. | **Alto** | `.github/workflows/deploy.yml:29-32` | Job com `services: postgres` (ou `supabase start`) que aplica `supabase/migrations/*.sql` em ordem e roda `pg_prove supabase/tests/*.sql`. Ele é descartável por construção e nunca encosta na produção. |
| Não há banco de teste reproduzível no repositório; a última rodada pgTAP registrada parou na 0053. | Médio | `supabase/config.toml` (mínimo), `docs/AUDITORIA_2026-10-23.md:14` | Script `scripts/test-db.mjs` que cria um banco temporário, aplica as migrations, roda o `pg_prove` e apaga o banco no fim. |
| Telas de cadastro e login sem teste. | Baixo | `src/pages/Cadastro.tsx`, `src/pages/Login.tsx` | Teste de tela com o cliente Supabase mockado: erro de senha, e-mail já usado, desvio para `/mfa`. |

---

## 2. Confiança no cliente

### Regras que existem só no front

Nenhuma encontrada. Conferi cada uma:

- **Preço:** a tela manda só `plan` e `cycle`; o valor sai da tabela `plans`
  dentro da Edge Function (`billing/index.ts:66-73`). O "N meses grátis" de
  `src/features/billing/rules.ts` é só exibição.
- **Limite de plano:** gatilho `app.billing_subject_guard` com advisory lock
  (`0052_...sql:356-404`).
- **Só leitura por falta de pagamento:** gatilhos `*_b9_billing` no banco
  (0049 e 0052).
- **Papéis owner/admin:** as checagens `role === 'owner' || role === 'admin'`
  em `Configuracoes.tsx`, `Auditoria.tsx`, `ExerciciosBiblioteca.tsx:36` e
  `AvaliadoForm.tsx:240` só escondem botões. O banco repete cada regra:
  `organizations_update`, `audit_select`, `exercises_delete` e
  `prepare_subject_deletion` (0020), além do gatilho
  `org_member_governance_guard` (0020:1019), que impede admin de se promover
  a owner e a organização de ficar sem owner.
- **Gerenciar assinatura:** `billing_manage_org` (0049:358) confere owner/admin
  e 2FA com o JWT de quem pediu.

### Chaves e tokens

| Variável | Onde | Classificação |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local`, front | Pública por design |
| `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`) | `.env.local`, front | Pública por design; a proteção é a RLS |
| `SUPABASE_SERVICE_ROLE_KEY` / `BILLING_SERVICE_KEY` | segredo das Edge Functions (`server.ts:269`) | Secreta, só no servidor |
| `ASAAS_API_KEY` | segredo das Edge Functions (`server.ts:344`) e variável de shell para `scripts/asaas-webhook.mjs` | Secreta, só no servidor |
| `ASAAS_WEBHOOK_TOKEN` | segredo da `billing-webhook` (`index.ts:31`) | Secreta, só no servidor |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secrets do GitHub Actions, fora do passo de build | Secretas, não entram no bundle |

O código do front só lê `import.meta.env.VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY`. Uma busca por `sb_secret_` e por JWT
(`eyJhbGciOi`) no repositório e no `dist/` não achou nenhuma chave. A única
ocorrência é o texto `startsWith("sb_secret_")` do próprio supabase-js, num
cache do Chrome dentro de `audit-preview.local/`, que está no `.gitignore`.
`.env.local` também está no `.gitignore`.

### Supabase: RLS e policies

RLS está **ligada nas 30 tabelas** (`0002_rls.sql:172-185`, 0005, 0007, 0010,
0012, 0017, 0019, 0027, 0034, 0049). Nenhuma migration desliga RLS. Calculei o
estado final das policies (criadas menos removidas): são **100 policies, todas
`to authenticated`**, nenhuma para `anon`. A única com `using (true)` é a
leitura do catálogo de planos. O aluno sem login só alcança 9 RPCs
`security definer` que validam o token do link (`get_*_for_link`,
`submit_workout_session`, `update_workout_session_for_link`,
`get_anamnese_intake`, `submit_anamnese_intake`, `report_link_error` e
`app_schema_version`). As outras 35 funções públicas têm `revoke … from
public, anon` explícito.

Funções auxiliares, para ler a tabela abaixo:

- `is_member(org)`: o usuário logado é membro da organização.
- `role_in(org, papéis)`: é membro com um desses papéis.
- `mfa_satisfied()`: a sessão está em aal2, ou o usuário não tem 2FA cadastrado.
- `can_view_subject(org, avaliador)`: 2FA em dia e (owner/admin, ou membro que
  é o avaliador responsável, ou membro de organização com "avaliadores veem
  todos"). As variantes `can_view_subject_id`, `_assessment_id`, `_plan_id`,
  `_workout_day_id`, `_workout_log_id`, `_session_id` e `_photo_id` sobem até
  o avaliado e aplicam a mesma regra.
- `has_active_consent*`: o avaliado tem consentimento LGPD vigente.

Todas comparam com `auth.uid()` por dentro.

| Tabela | Policies | O que permitem, em português | Observação |
|---|---|---|---|
| `profiles` | select, update | Ver o próprio perfil e o de quem divide organização com você; editar só o próprio. | OK |
| `organizations` | select, update, delete | Membro vê; owner/admin com 2FA edita; só owner com 2FA exclui. Inserção só pela RPC `create_organization`. | OK |
| `org_members` | select, insert, update, delete | Membro vê a equipe; owner/admin com 2FA adiciona e muda papel; sair da organização ou remover alguém exige 2FA e ser owner/admin (ou ser você mesmo). Um gatilho impede promover-se a owner e remover o último owner. | OK |
| `subjects` | select, insert, update | Ver avaliado conforme `can_view_subject`; criar e editar exige ser membro com 2FA. `org_id` é congelado e o avaliador atribuído é validado por gatilho. Não há delete: exclusão só pela RPC, com owner/admin. | OK |
| `assessments`, `anamneses`, `posture_sessions` | select, insert, update, delete | Quem vê o avaliado vê, edita e exclui; criar exige também consentimento vigente. | OK |
| `circumference_readings`, `skinfold_readings` | select, insert, update, delete | Quem vê a avaliação mexe nas leituras; inserir exige consentimento vigente. | OK |
| `posture_photos` | select, insert, delete | Quem vê a sessão postural vê e apaga a foto; enviar exige consentimento. | OK |
| `posture_annotations` | select, insert, update, delete | Quem vê a foto mexe na marcação; criar exige consentimento. | OK |
| `consent_records` | select, insert | Quem vê o avaliado lê; registrar exige ser quem coletou (`collected_by = auth.uid()`). Sem update e sem delete: o registro é imutável. | OK |
| `audit_logs` | select, insert | Só owner/admin com 2FA lê; qualquer membro grava, em nome próprio, as quatro ações de exportação. | OK |
| `client_errors` | select, insert, delete | Membro grava erro em nome próprio; owner/admin com 2FA lê e apaga. | Baixo: um membro pode encher a tabela (há `purge_client_errors`). |
| `plans` | select | **`using (true)`**: qualquer usuário logado lê o catálogo de planos e preços. | Público por natureza. OK |
| `org_subscriptions` | select | Membro lê a assinatura da própria organização. Escrita só pela service role. | OK |
| `billing_events` | nenhuma | RLS ligada e sem policy: só a service role lê e grava. | OK |
| `exercises` | select, insert, update, delete | Todos veem o catálogo global e o da sua organização; membro com 2FA cria e edita os próprios; só owner/admin com 2FA exclui. | Leitura sem 2FA (catálogo, risco baixo). |
| `exercise_videos` | select, insert, update, delete | Membro vê; membro com 2FA cria, edita e apaga, só para exercício global ou da própria organização. | Leitura sem 2FA (baixo). |
| `workout_plans`, `workout_links`, `workout_logs` | select, insert, update, delete | Quem vê o avaliado mexe; link exige `created_by = auth.uid()`; registro do profissional só com `source = 'trainer'`. | OK |
| `workout_days`, `workout_weeks`, `workout_week_overrides`, `workout_exercises`, `workout_log_sets` | select, insert, update, delete | Herdam a permissão do plano, do dia ou do registro, e por eles a do avaliado. | OK |
| `anamnese_intakes` | select, insert | Link de cadastro novo: membro com 2FA; link de avaliado existente: quem vê o avaliado. Criar exige `created_by = auth.uid()`. Transições por RPC. | OK |
| `posture_annotations_shadowed` | nenhuma | RLS ligada e sem policy: arquivo morto, só a service role. | OK |
| `storage.objects` (fotos) | select, insert, delete | Fotos posturais: acesso conferido pelo caminho (`can_access_photo_object`, `can_upload_photo_object`). | OK |
| `storage.objects` (logos) | select, insert, update, delete | Membro vê o logo da organização; owner/admin com 2FA envia, troca e apaga, com o caminho canônico. | OK |

| Achado | Risco | Arquivo e linha | Correção sugerida |
|---|---|---|---|
| Nenhuma regra de preço, limite ou papel existe só no front. | — | — | — |
| Nenhuma chave secreta no front nem no `dist/`. | — | — | — |
| Nenhuma tabela sem RLS e nenhuma policy de escrita com `true`. | — | — | — |
| O teste grátis de 14 dias vale para "a primeira organização", mas a regra conta só as organizações que existem agora. Quem exclui a organização e cria outra ganha mais 14 dias. | Médio | `supabase/migrations/0049_assinatura.sql:99-119` | Gravar em `profiles` (ou numa tabela própria) a data do primeiro teste grátis do usuário e consultar esse registro, em vez de contar memberships atuais. |
| `exercises` e `exercise_videos` são legíveis com só a senha (sem aal2) em conta com 2FA. | Baixo | `0007_workout_rls.sql` (exercises_select), `0042_videos_dos_exercicios.sql` | Acrescentar `app.mfa_satisfied()` ao select, se o catálogo próprio for considerado sensível. |
| `client_errors` aceita inserção ilimitada de qualquer membro. | Baixo | `0019_v2_hardening.sql` (client_errors_insert) | Limite por usuário e hora na própria policy ou num gatilho. |

---

## 3. Race condition

| Recurso | Duas requisições iguais juntas | Proteção no banco | Risco |
|---|---|---|---|
| **Plano pendente do checkout** (`checkout_plan_id`) | Cada checkout novo sobrescreve o plano pendente sem cancelar o checkout anterior no Asaas, que continua pagável por 60 min (`billing.ts:76`). O webhook de pagamento aplica `plan_id = coalesce(checkout_plan_id, plan_id)` (`0052:236`) sem conferir valor nem de qual checkout veio. Pagar o link mais barato libera o plano do último checkout aberto. Também acontece com duas abas e com Pix seguido de cartão. | Nenhuma: um único campo de estado e nenhum vínculo checkout → plano | **Alto** |
| Duas assinaturas criadas por clique duplo ou duas abas (cartão ou Pix) | A Edge Function lê o snapshot, decide "não tem assinatura" e cria no Asaas, sem trava. Saem duas assinaturas e dois clientes Asaas (o `GET /customers?cpfCnpj` seguido de `POST` é ler-decidir-gravar). A 0052 atenua: quando a segunda é adotada, a primeira é cancelada pelo webhook. Se as duas forem pagas, a primeira cobrança sai em dobro. | `asaas_subscription_id unique` e `for update` no `billing_apply_event`, mas nada serializa a Edge Function | Médio |
| Troca de plano concorrente | A e B gravam no banco (cada um com `for update`, em sequência) e depois fazem `PUT` no Asaas em ordem qualquer. O banco pode ficar com o plano de B e o Asaas com o de A. Resposta perdida: o banco desfaz para o plano antigo e o Asaas fica com o novo. | `for update` só dentro de cada RPC; nenhuma trava cobre banco + Asaas | Médio |
| Rebaixar para o Até 30 enquanto alguém cria avaliado | `billing_change_plan` conta os ativos sob `for update` em `org_subscriptions`, mas não pega o advisory lock `billing-subjects:`. O gatilho de avaliado, com o plano ainda Ilimitado (`v_max is null`), sai antes do lock. As duas passam e ficam 31 ativos no Até 30. | Parcial | Baixo |
| Limite de avaliados por plano | Duas abas criando o 30º e o 31º: o advisory lock por organização serializa a contagem e o segundo é recusado. | **Sim**: `pg_advisory_xact_lock` (`0052:390`) | OK |
| Teste grátis com duas organizações criadas juntas | `create_organization` trava a linha do perfil (`for update`, `0028:303`), e a segunda vê a primeira. | **Sim** | OK |
| Link de anamnese (uso único) | `select … for update` com `status = 'pending'` (`0043:216-221`): o segundo envio espera, revalida e recebe "já utilizado". | **Sim** | OK |
| Registro de treino pelo link (reenvio offline) | Índice único `(plan_id, client_ref)` (`0027:167`): o reenvio atualiza em vez de duplicar. | **Sim** | OK |
| Criação de avaliação e de plano de treino (resposta perdida) | `p_id` da ação (0053) e chave primária: a segunda tentativa devolve a linha já gravada, ou falha na PK se chegar junto. | **Sim** | OK |
| Mudança de owner | O gatilho de governança trava a organização (`for update`, `0020:1043`). | **Sim** | OK |
| Evento de webhook repetido | Chave primária em `billing_events.id` e `on conflict do nothing` (`0052:181`). | **Sim** | OK |

**Proteções que dependem de memória, Redis ou cache.** Não há Redis no
projeto. A única trava em memória é `studentDraftOperations`
(`src/pages/TreinoAluno.tsx:1004`), um `Map` de promessas que serializa
gravações do rascunho local (IndexedDB) do aluno. Ela não protege nenhum
recurso do servidor, e o banco já resolve o reenvio pelo `client_ref`. Os
botões de `Plano.tsx` ficam desabilitados enquanto há pedido em andamento
(`busy !== null`, linhas 408, 451, 573, 584 e 633): isso segura o clique
duplo numa aba, mas não segura duas abas nem a retentativa. Nos casos da
cobrança, **o banco sozinho resolveria** com uma trava curta por organização
na Edge Function (veja a correção 1).

| Achado | Risco | Arquivo e linha | Correção sugerida |
|---|---|---|---|
| Plano liberado = último checkout aberto, não o pago. | **Alto** | `0052_assinatura_pix_pendente_e_so_leitura.sql:236`; `billing/index.ts:104` e `:159` | Tabela `billing_checkouts (id pk, org_id, plan_id, cycle, value, created_at)` gravada a cada checkout ou Pix. No pagamento, o plano sai da linha ligada ao `checkoutSession` ou à assinatura que foi paga, e o valor do pagamento reconsultado tem que bater com o preço dela. Checkout novo cancela ou expira o anterior. |
| Criação de assinatura sem trava (clique duplo ou duas abas). | Médio | `billing/index.ts:75-177` | RPC `billing_begin(p_org)` que marca "checkout em andamento" com `for update` e recusa um segundo pedido por N segundos; ou `pg_advisory_xact_lock` numa RPC que envolve a decisão. |
| Troca de plano sem atomicidade entre banco e Asaas. | Médio | `billing/index.ts:179-205` | Gravar o plano novo como pendente, chamar o Asaas e só então confirmar; ou fazer `GET` da assinatura no Asaas depois do erro para reconciliar, em vez de desfazer às cegas. Trava por organização como acima. |
| Rebaixamento e criação de avaliado em paralelo passam do limite. | Baixo | `0049_assinatura.sql:626-666`; `0052:356-404` | `billing_change_plan` pega o mesmo `pg_advisory_xact_lock('billing-subjects:'||org)` antes de contar. |

---

## 4. Idempotência

### Webhook do Asaas

- **Assinatura com o corpo bruto:** não se aplica. O Asaas não assina o corpo
  com HMAC; ele manda um token fixo no header `asaas-access-token`. O código
  compara esse token em tempo constante (`safeEqual`, `billing.ts:154`) antes
  de ler o corpo (`billing-webhook/index.ts:30-33`). É o mecanismo que o
  provedor oferece. A consequência é que quem tiver o token forja qualquer
  evento, e por isso o código reconsulta o pagamento no Asaas antes de liberar
  acesso. Ver o achado 3 para o furo que resta.
- **Registro de eventos processados com ID único:** sim. `billing_events.id`
  é chave primária (`0049:130-131`) e `billing_apply_event` faz
  `insert … on conflict (id) do nothing`. Se não inseriu, devolve
  `duplicate` sem mexer em nada (`0052:178-184`). O insert e as mudanças
  correm na mesma transação da RPC: se algo falha, o evento some junto e a
  retentativa do Asaas é reprocessada.
- **Mesmo evento duas vezes:** a segunda entrega faz de novo o `GET` do
  pagamento no Asaas (custo inócuo), chega ao banco e recebe `duplicate`. Duas
  entregas simultâneas: a segunda espera a checagem da chave única e também
  recebe `duplicate`. Coberto no pgTAP (`0049_assinatura.test.sql:192`).
  Eventos diferentes do mesmo pagamento (`PAYMENT_CONFIRMED` e depois
  `PAYMENT_RECEIVED`) também não esticam o período, porque o fim é calculado
  pelo vencimento com `greatest()`.
- **Efeitos fora do banco não são idempotentes:** o `DELETE` da assinatura
  substituída roda depois do commit, e uma falha só vira log
  (`billing-webhook/index.ts:102-105`). Como o evento já está gravado, a
  retentativa do Asaas cai em `duplicate` e não cancela de novo.

### Chamadas ao gateway

- **Idempotency key:** nenhuma chamada ao Asaas manda chave de idempotência
  (`server.ts:333-366`). **Não verificado:** se a API v3 do Asaas aceita um
  cabeçalho de idempotência. Não consultei a documentação nesta tarefa. Sem
  ele, `POST /checkouts`, `POST /customers` e `POST /subscriptions`
  repetidos (clique duplo, retentativa depois de timeout de 60 s) criam
  objetos duplicados.
- `startPix` cria a assinatura no Asaas e só depois grava no banco
  (`billing/index.ts:146-164`). Se a gravação falha, sobra uma assinatura Pix
  órfã que gera fatura todo mês. A 0052 atenua: o `PAYMENT_CREATED` dela é
  adotado pela referência externa e ela aparece na tela, onde dá para
  desistir.

| Achado | Risco | Arquivo e linha | Correção sugerida |
|---|---|---|---|
| A organização é achada pelos campos do corpo não verificado, não pelo pagamento reconsultado. | Médio | `billing-webhook/index.ts:53-59`, `:62-86`; `billing.ts:185-214` | Incluir `subscription`, `externalReference` e `value` em `paymentFields`, e usar os do pagamento reconsultado (`fresh`) para achar a organização e conferir o valor. Ignorar os do corpo em eventos pagos. |
| Cancelamento da assinatura substituída sem retentativa. | Médio | `billing-webhook/index.ts:102-105` | Gravar `replaced_subscription_id` numa fila (`billing_pending_cancellations`) dentro do `billing_apply_event` e apagar só depois do `DELETE` bem-sucedido; reprocessar a fila no próximo webhook ou por agendamento. |
| `POST` ao Asaas sem chave de idempotência. | Médio | `server.ts:333-366`; `billing/index.ts:90`, `:139`, `:146` | Se o Asaas aceitar, mandar uma chave derivada de `org_id + ação + janela`. Senão, `externalReference` única por tentativa e busca (`GET ?externalReference=`) antes de criar. |
| Assinatura Pix criada antes de gravar no banco. | Baixo | `billing/index.ts:146-164` | Gravar a intenção antes (`billing_checkouts`, ver a correção 1) e atualizar com o id depois. |
| `PAYMENT_OVERDUE` e `PAYMENT_REFUNDED` não são reconsultados no Asaas. Um evento fora de ordem (vencido depois de pago) põe `past_due`. | Baixo | `0052_…sql` (ramos `PAYMENT_OVERDUE` e `PAYMENT_REFUNDED`) | Reconsultar o status do pagamento também nesses eventos, ou ignorar `OVERDUE` de pagamento que já consta como pago. |

---

## 5. Separação de responsabilidades

Contagem de linhas sem testes e sem `database.types.ts`:

| Arquivo | Linhas | Tela | Regra de negócio | Banco/serviço | Leitura |
|---|---|---|---|---|---|
| `src/pages/TreinoAluno.tsx` | 2688 | sim (10 componentes) | sim: fila offline, reenvio a cada 30 s (`:579`), rascunho, trava em memória (`:1004`), cronômetro, semana sugerida | indireto (via `features/workout/api` e `studentStore`) | **Mistura tela e orquestração.** O `TreinoDoDia` sozinho vai da linha 1027 à 2262 (~1235 linhas), e o arquivo tem 78 `useState`/`useEffect`. |
| `src/pages/Execucao.tsx` | 1858 | sim | sim: progressão, 1RM, ordem da sessão, rascunho | indireto | Mesmo padrão, menor. |
| `src/pages/TreinoNovo.tsx` | 1172 | sim | sim: contraindicações, volume, conflito de versão | indireto | Regras já estão em `features/workout/*`; a tela orquestra. |
| `src/pages/AvaliadoDetalhe.tsx` | 1045 | sim (10 componentes) | pouca | indireto | Agrega muitas seções; dá para dividir por aba. |
| `src/features/anamnesis/AnamneseForm.tsx` | 953 | sim | validação | não | Formulário grande, coeso. |
| `src/features/workout/api.ts` | 927 | não | mapeamento | sim | Camada de dados; tamanho por volume de RPCs. |
| `supabase/functions/billing/index.ts` | 276 | — | sim | sim (Asaas + PostgREST) | Pequeno, mas mistura HTTP, regra e duas integrações no mesmo escopo, o que impede o teste (achado 2). |

Nenhuma página chama `supabase.from/rpc` direto: o acesso a dados está nas
pastas `features/*/api.ts` e `hooks.ts`. A mistura que sobra é de tela com
orquestração de estado (fila, timers, rascunho).

**Candidato número 1: `src/pages/TreinoAluno.tsx`.** É o maior arquivo do
projeto, roda no celular do aluno sem login e offline (o caminho com mais
estados possíveis), e a lógica de fila e reenvio
(`TreinoAluno` linhas 252–821) está presa a `useEffect`, só testável
montando a tela. Proposta: extrair um hook `useStudentQueue` (fila,
intervalo, online/offline e envio) e um `useStudentDraft` (rascunho e a
trava do `Map`), e quebrar `TreinoDoDia` em blocos por exercício. Para
risco de negócio, o segundo candidato é `supabase/functions/billing/index.ts`:
pequeno, mas é onde o dinheiro passa sem teste.

| Achado | Risco | Arquivo e linha | Correção sugerida |
|---|---|---|---|
| `TreinoAluno.tsx` com 2688 linhas, fila offline e timers dentro da tela. | Médio | `src/pages/TreinoAluno.tsx:252-821`, `:1027-2262` | Extrair `useStudentQueue` e `useStudentDraft` com testes próprios; dividir `TreinoDoDia`. |
| `Execucao.tsx` com 1858 linhas, mesmo padrão. | Baixo | `src/pages/Execucao.tsx` | Mesmo tratamento depois do `TreinoAluno`. |
| Edge Function `billing` sem separar HTTP de regra. | Médio | `supabase/functions/billing/index.ts:235-276` | `handle(req, deps)` com dependências injetadas (é a mesma correção do achado 2). |

---

## Prompts de correção (um por achado do topo)

1. **Plano pago = plano liberado.** "Crie a migration 0058 com a tabela
   `billing_checkouts` (id do checkout ou `pix:<assinatura>`, org, plano,
   ciclo, valor, data), grave nela em `startCard` e `startPix`, e mude o ramo
   pago de `billing_apply_event` para tirar o plano da linha ligada ao
   `checkoutSession` ou à assinatura paga, recusando quando o valor do
   pagamento reconsultado não bate. Checkout novo invalida o anterior. pgTAP
   que reprova na 0057: dois checkouts, paga o barato, o plano tem que ser o
   barato."
2. **Testes dos handlers.** "Refatore `billing` e `billing-webhook` para
   `handle(req, deps)` e escreva testes vitest com dublês para assinatura
   dupla, Asaas recusando a troca, webhook repetido, organização desconhecida
   e substituição de assinatura. Adicione ao CI um job que aplica as
   migrations num Postgres de serviço e roda o `pg_prove`."
3. **Webhook confiando no corpo.** "No `billing-webhook`, use
   `subscription`, `externalReference` e `value` do pagamento reconsultado
   para achar a organização e validar o valor; ignore os do corpo em eventos
   pagos. Teste com corpo forjado apontando outra organização."
4. **Cancelamento perdido.** "Crie a fila `billing_pending_cancellations`
   gravada dentro do `billing_apply_event`, apague só depois do `DELETE` no
   Asaas e reprocesse a fila a cada webhook. Teste com o `DELETE` falhando."
5. **Troca de plano.** "Torne `changePlan` reconciliável: trava por
   organização, plano novo pendente até o Asaas confirmar, e `GET` da
   assinatura depois de erro em vez de desfazer às cegas. Teste com o `PUT`
   dando timeout depois de aplicado."

**Rode o 1 primeiro.** É o único achado explorável hoje, sem vazamento de
segredo e sem corrida de milissegundos: qualquer owner com dois cliques e um
pagamento fica no Ilimitado por R$ 19,90 ao mês, para sempre, porque a
assinatura recorrente no Asaas mantém o valor pago. Os achados 3 a 5 exigem
token vazado, falha de rede ou coincidência. O 2 é o que impede a próxima
regressão, e por isso vem logo depois: a correção do 1 deve nascer com o
teste que reprova no código atual. Antes de corrigir, vale reproduzir o
cenário no sandbox do Asaas. Confirmei o caminho lendo o código, mas não o
executei.
