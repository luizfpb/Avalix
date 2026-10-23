# Auditoria completa de 23/10/2026

Base: `b701cc3` (CPF e cidade do fornecedor nos Termos). Roteiro em seis frentes, o mesmo da skill `.claude/skills/auditoria-completa`. Cada achado foi provado antes da correção, e cada teste novo foi rodado também contra a versão do HEAD (arquivo trocado temporariamente por `git show HEAD:...`, ou o corpo antigo da função recriado numa transação descartada) para confirmar que reprova nela.

Produção foi tocada só por GET sem login (cabeçalhos e rotas públicas). Nenhum dado real foi lido, criado, alterado ou apagado.

**Exige a migration 0053** (aplicar no SQL Editor antes do push: o gate do deploy passou a esperar `0053`). Ela não muda tabela, policy nem dado; troca o corpo de duas funções e acrescenta um parâmetro opcional. Regenerar `database.types` é opcional: a API usa contrato provisório para `p_id`, no padrão do projeto.

## Validação

- `npm run lint`: verde.
- `npm run test`: **1264 testes em 151 arquivos**, verdes.
- `npm run build` e `npm run check:build`: verdes. Pré-cache em **1.989.552 de 2.000.000 bytes**, depois de tirar a Agenda dele (ver "Riscos").
- pgTAP no PostgreSQL 18 descartável, migrations 0001–0053: **568 verificações em 27 suítes**, 0 falhas (16 da 0053). Contra o corpo antigo das duas funções, a suíte da 0053 reprova 12 das 16 (as 4 de controle passam).
- Navegador real (Chrome 156, por CDP, com o CSS e os componentes reais servidos pelo Vite): foco dos diálogos e envio de arquivo pelo teclado, antes e depois.
- Smoke de deploy (`check-deployment.mjs`, só GET) contra produção: reprova em `/termos` (404) com o código desta rodada, como esperado até o próximo deploy.

## Inventário

### Chamadas externas

| Onde | Chamadas | Observação |
| --- | --- | --- |
| `features/*/api.ts` (profissional) | PostgREST: `subjects`, `anamneses`, `assessments`, `circumference_readings`, `appointments`, `posture_*`, `consent_records`, `workout_*`, `exercises`, `exercise_videos`, `audit_logs`, `client_errors`, `profiles`, `organizations`, views `last_assessment_by_subject`, `workout_log_summary`, `pending_anamnese_intakes`; RPCs `create_assessment`, `save_assessment`, `create_workout_plan`, `save_workout_plan`, `create_workout_log`, `save_trainer_workout_session`, `update_workout_log`, `subject_last_sets`, `revoke_consent`, `prepare/finalize_subject_deletion`, `export_subject_data`, `log_data_action`, `issue/revoke_workout_link`, `accept/reject/cancel_anamnese_intake`, `get_org_billing`, `create_organization` | Erro devolvido em `{ error }`, lido em todos. Update sem `.select()` não acusa 0 linhas (A6). |
| Páginas públicas (`/t`, `/a`) | RPCs `get_workout_for_link`, `get_workout_plan_for_link`, `get_workout_history_page_for_link`, `submit_workout_session`, `update_workout_session_for_link`, `get_anamnese_intake`, `submit_anamnese_intake`, `report_link_error` | Prazo em todas (`lib/deadline`); envio idempotente por `client_ref` (0027/0043). |
| Storage | `photos` (upload, signed URL em lotes de 100, remove verificado), `logos` (upload upsert, signed URL, remove) | Limites do bucket: 2 MiB (fotos), 1 MiB (logo). |
| Auth | `getSession`, `onAuthStateChange`, `signInWithPassword`, `signUp`, `signOut`, `resetPasswordForEmail`, `updateUser`, `verifyOtp`, `mfa.*` | |
| Edge Functions | `billing` (app → function → PostgREST service role + Asaas), `billing-webhook` (Asaas → function) | Asaas com timeout de 60 s; webhook idempotente por id do evento. |
| Service worker | `navigateNetworkFirst` (3,5 s, cópia do aparelho como reserva) | Não cacheia Supabase. |
| Scripts/CI | `backup-storage`, `verify-backup`, `find-orphan-photos`, `check-schema-version`, `check-deployment`, `asaas-webhook`, `buscar-videos-leandro-twin` | Paginação com ordem total (nome ou id). |

### Limites

| Limite | Valor | Quem chama respeita? |
| --- | --- | --- |
| Corte do PostgREST | 1000 linhas, sem erro | Listas paginadas em 500 com ordem total; RPCs `setof`: só 4, e a única com várias linhas (`prepare_subject_deletion`) é paginada e ordenada por `created_at, id`. A trilha de auditoria paginava sem desempate (A5). |
| Página da auditoria | 50 | Corrigido o desempate (A5). |
| CHECKs de texto/faixa | contato 8–30 / 5–254; agendamento título 120, local 200, duração 5–1440 inteira; nome 160/120; reps 0–100; carga 0–1000; série 1–50 | Contato e agenda não respeitavam (A7). |
| Buckets | fotos 2 MiB (webp/jpeg), logo 1 MiB | O app reencoda antes (1600 px, q 0,85; logo até 1 MiB). |
| Cotas anônimas | 60 séries, 600 caracteres, 16 KiB, 3 sessões/data, 30 gravações/h, erros 30/link e 300/org por hora | Documentadas (0033/0039/0043). |
| Pré-cache | 2.000.000 bytes | 1.999.772 (risco). |
| Outros | seletor de exercício 60 resultados (avisa), apelidos 20, músculos adicionais 2, 25 organizações por usuário, rascunho 24 h/2 h | Documentados. |

### Dados sensíveis e onde moram

- **Saúde (anamnese, avaliação, fotos, treino):** tabelas com RLS por organização e MFA; `audit_logs`; exportação `export_subject_data` (cobre todas as tabelas que referenciam o aluno, inclusive anotações de resguardo); PDFs e CSV sob ação explícita; backup criptografado (90 dias); rascunhos no `localStorage` por usuário+organização, limpos no logout (`clientPrivacy.ts`); fila e rascunho do aluno no IndexedDB do aparelho; anamnese pública em `sessionStorage` por aba.
- **Fotos:** sempre reencodadas no canvas (sem EXIF/GPS), como o termo de consentimento afirma.
- **CPF do Pix:** só passa pela Edge Function `billing` para o Asaas; o log da function não leva a query string (correção de 21/10).
- **Token do link do aluno:** `localStorage` por aparelho (decisão registrada), filtrado do log de erros.
- **Chaves locais:** `avalix:draft:private:<user>:<org>:…` (por usuário), `avalix:draft:session:…` (por aba), `avalix:intakelink:v2:<user>:<org>:…`, `avalix:workoutlink:v1:<user>:<org>:…`, `avalix:treino:token` (por aparelho, decisão), `avalix:auth:password-recovery:v1` (por aba), `avalix:pwa:auto-update-at`, `theme` (por aparelho, não sensível), `sb-<ref>-auth-token`. Todas escolhidas pelo código, nenhuma pelo usuário.

### Diálogos e controles de teclado

`ConfirmDialog` (21 usos), `SessionEditForm` (correção de sessão, aluno e Execução), lightbox da sessão postural; grupos `role="radiogroup"` no Plano (ciclo) e em Ajustes (tema); inputs de arquivo da foto postural e da logo; puxador da Execução (setas, já documentado); `AnnotationCanvas` (desenho por ponteiro).

## Achados

| ID | Prior. | Problema | Prova | Correção | Teste |
| --- | --- | --- | --- | --- | --- |
| A1 | P2 | `/termos` e `/configuracoes/plano` respondiam **404** em produção para quem chega sem o service worker: o link dos Termos (cadastro, plano) e o **retorno do checkout do Asaas** (`/configuracoes/plano?retorno=ok`) caíam em "Página não encontrada". As rotas da 0049 ficaram fora do `_redirects`, e o teste tinha a lista fixa à mão. | `curl` em produção: 404 nas duas, 200 nas demais. | `_redirects` com `/termos` e `/configuracoes/*`; smoke de deploy confere as duas. | `pagesConfig.test.ts` cruza toda rota do `App.tsx` com o `_redirects` (reprovava apontando as duas). |
| A2 | P2 | Criar **avaliação física** e **plano de treino** (inclusive duplicar plano) com a resposta perdida depois do commit: a tela dizia "tente de novo" e o segundo clique criava outra avaliação (entra na evolução e no PDF) ou outro plano (que ainda arquivava o primeiro). Irmão da 0043, que só cobriu a sessão de treino. | pgTAP da 0053 contra o corpo antigo: 12 de 16 reprovam. | Migration **0053**: `p_id` (identidade da ação) em `create_assessment` e `create_workout_plan`; a nova tentativa devolve a linha já gravada, conferida antes do insert (o gatilho que arquiva o plano é BEFORE INSERT). Telas geram a identidade uma vez por formulário (duplicar: uma por destino). | `0053_criacao_idempotente.test.sql`; `AvaliacaoNova.idempotencia.test.tsx`; `TreinoNovo.test.tsx`. |
| A3 | P2 | O mesmo em **novo aluno** (ocupa vaga do plano) e **anamnese** (dado de saúde em dobro). | Teste com "servidor" que grava e perde a resposta: 2 linhas no HEAD. SQL no banco descartável: o reenvio com o mesmo id dá `23505` em `subjects_pkey`. | O id da linha vem da tela; `23505` na chave primária devolve a linha existente (`isPrimaryKeyConflict`). Sem migration. | `AvaliadoForm.idempotencia.test.tsx`; `anamnesis/api.criacao.test.ts`. |
| A4 | P3 | O mesmo em **agendamento** e **sessão postural** (sessão vazia a mais). | Testes das telas: a segunda tentativa ia sem identidade. | Mesmo padrão de A3; na Agenda a identidade renasce depois de cada agendamento criado. | `Agenda.test.tsx`; `PosturaSessaoNova.test.tsx`. |
| A5 | P3 | A **trilha de auditoria** paginava por OFFSET ordenando só por `at`, e os gatilhos gravam o `now()` da transação (exclusão em cascata = dezenas de eventos empatados): páginas repetiam uns e pulavam outros. | Banco descartável, plano por ordenação: 8 de 1000 eventos nunca apareciam e 8 apareciam duas vezes. | Desempate por `id`. | `audit.test.ts` (PostgREST falso que embaralha empates). |
| A6 | P3 | Recusa silenciosa da policy (0 linhas, sem erro) dita como sucesso: **"Contato salvo"** sem salvar; remover/enviar **logo** idem. Irmão da correção de 21/10 (nome e termo da organização), que já conferia as linhas. | Testes com update devolvendo 0 linhas. | `.select('id')` e erro em pt-BR quando nada foi atualizado. | `Configuracoes.test.tsx`; `logo.test.ts`. |
| A7 | P3 | Limite da tela diferente do banco: telefone do contato fora de 8–30, e-mail fora de 5–254; agenda com título >120, local >200 e **duração fracionada** em coluna `integer`. Voltava o texto do Postgres em inglês, com nome de constraint. | Testes das telas; `select '7.5'::int` no banco. | Validação e `maxLength` nas telas; `normalizeDbError` traduz o texto padrão de CHECK/tipo/faixa, sem esconder as mensagens pt-BR dos nossos gatilhos (que também usam 23514). | `Configuracoes.test.tsx`, `Agenda.test.tsx`, `errors.test.ts`. |
| A8 | P3 | Cobrança: 503 sem corpo, página de erro em HTML ou sem rede mostravam "Edge Function returned a non-2xx status code" / "Failed to send a request to the Edge Function". E a tela não relia o estado depois de uma falha: o Pix criado com a fatura atrasada ("aparece nesta tela em instantes") não aparecia. | supabase-js real com fetch falso; teste da tela. | Mensagens em pt-BR por tipo de erro do SDK; `invalidateQueries(['billing'])` depois de falha (escolher plano e desistir do Pix). | `billing/api.test.ts`; `Plano.test.tsx`. |
| A9 | P3 | Diálogos **não devolviam o foco** a quem os abriu: `ConfirmDialog` e `SessionEditForm` saem da árvore com o `<dialog>` aberto e o navegador só devolve o foco no `close()`. Depois de Esc, Cancelar ou Confirmar, o foco ia para o `<body>`. | Chrome 156 por CDP: `body` nos três casos; depois da correção, o botão de origem. | `useReturnFocus` (lê o foco antes do `showModal`, devolve ao desmontar). | `ConfirmDialog.test.tsx`; `SessionEditForm.test.tsx`. |
| A10 | P3 | **"Adicionar foto"** (sessão postural) era inalcançável pelo teclado (`input` com `display:none`); o botão da **logo** recebia foco sem indicador visível. | Chrome 156: o Tab pulava o envio de foto; `outline: none` e nenhuma sombra no botão da logo. | Input `peer sr-only` e anel de foco no texto visível. | `PosturaSessaoDetalhe.test.tsx`; `Configuracoes.test.tsx`. |
| A11 | P3 | `role="radio"` (ciclo do plano, tema) prometia o padrão do ARIA, mas as setas não faziam nada e cada opção era uma parada do Tab. | Testes das telas. | `lib/radioGroup.ts`: setas/Home/End trocam e levam o foco; só a marcada fica no Tab. | `Plano.test.tsx`; `Configuracoes.test.tsx`. |
| A12 | P3 | **Termos, cláusula 5:** "você continua vendo, exportando e corrigindo seus dados", mas no só leitura o banco só deixa corrigir o cadastro do aluno (avaliação, anamnese, sessão postural, agendamento e treino ficam travados — suíte pgTAP da 0052). | Texto contra a regra 0049/0052. | Texto descreve o que vale; **Termos 1.1** (23/10/2026). | `Termos.test.tsx`. |
| A13 | P3 | `AGENTS.md` dizia "push na main → build automático do Cloudflare Pages"; quem publica é o GitHub Actions, que para no gate de schema se a migration não estiver aplicada. | `.github/workflows/deploy.yml`. | Texto corrigido, com o gate, o `_redirects` e a skill. | Documentação (sem teste automático). |

## Suspeitas descartadas

| Suspeita | Por que não é problema |
| --- | --- |
| `prepare_subject_deletion` paginada sobre função sem ordem | A função tem `order by p.created_at, p.id` (definição lida no banco descartável). |
| Outras paginações por OFFSET | Todas terminam em coluna única: alunos (`…, id`), agenda (`starts_at, id`), circunferências (`id`), última avaliação (`subject_id`, uma por aluno), fotos (`created_at, id`), sessões (`performed_at, created_at, id`), séries (`created_at, id`), planos (`created_at, id`), resumo (`plan_id`); scripts (`id` e nome no Storage). |
| RPCs cortadas em 1000 linhas | Só 4 devolvem `setof`; três devolvem uma linha e a quarta pagina (acima). |
| RLS das tabelas da assinatura | `org_subscriptions` só com policy de SELECT por membro; `billing_events` sem acesso de `anon`/`authenticated`; views com `security_invoker`. |
| Termo de consentimento: "metadados de localização removidos" | `processImage` sempre reencoda no canvas, inclusive a miniatura. |
| Lightbox da sessão postural | Fecha por `close()`: o navegador devolve o foco. |
| Rotas de só leitura | `READ_ONLY_ROUTES` cobre toda rota de criação/edição do `App.tsx`. |
| Exportação do titular incompleta | `export_subject_data` cobre todas as tabelas com `subject_id`, mais anotações de resguardo e `audit_logs`; `workout_links` só tem hash do token. |
| "Carregando" eterno no 2FA (Ajustes) | `mfa.listFactors` devolve o erro em vez de lançar; o estado sai do carregamento nos dois caminhos. |
| Consultas com `enabled: false` | As telas só montam com organização/aluno presentes; a lightbox e as URLs assinadas tratam a lista vazia antes. |
| Altura com vírgula (`type="number"`) no cadastro | A faixa 50–250 recusa o "1755" do iOS; "1,75" virando 175 dá o valor certo em cm. |
| `AnnotationCanvas` sem teclado | Ferramenta de desenho à mão livre, que depende do caminho do ponteiro (exceção do WCAG 2.1.1). |
| Docs `ETAPA2.md`/`ETAPA3-1.md` citam `jp7.ts`, `lib/image.ts` e migrations com timestamp | Planos históricos de etapa, não instruções operacionais. |
| Afirmações "tem teste" recentes | `pagesConfig.test.ts` amarra MediaPipe/CSP; `pdfFonts.test.ts` conta glifos compostos; `navigationHandler.test.ts` tem os 6 casos citados. |

## O que não foi coberto, e por quê

- **Asaas real ou sandbox:** a ordem real dos eventos e três cenários de falha parcial ficam sem prova: (1) Pix com resposta perdida depois de criar a assinatura no Asaas e antes de `billing_checkout_started` (a nova tentativa apaga só a assinatura que o banco conhece; a outra ficaria órfã no Asaas); (2) falha do DELETE da assinatura substituída no webhook (só vai para o log; reenviar o evento não ajudaria, porque ele já está registrado); (3) `PAYMENT_CREATED` atrasado depois de "Desistir deste Pix" (o `PAYMENT_DELETED` que o Asaas manda ao remover a assinatura deveria limpar o pendente). Precisam do sandbox para reproduzir.
- **Edge Functions em Deno:** não há Deno nesta máquina; a lógica pura delas é testada no vitest (`_shared/billing.test.ts`), o `index.ts` não foi executado.
- **iPhone/Android reais:** as provas de navegador foram no Chrome do Windows.
- **Área logada em produção:** por regra, nada além de GET público.
- **Página do aluno (`/t`) e anamnese pública em profundidade:** inventariadas e conferidas nas chamadas, prazos e chaves, mas não reauditadas cenário a cenário (foram o foco das auditorias de 05/10 e 06/10).
- **PDFs:** nenhum PDF mudou nesta rodada; não foram renderizados.
- **Duplicação sob corrida de duas abas no Supabase real:** coberta no banco descartável (`on conflict`), não contra o PostgREST de produção.

## Riscos registrados

- **Pré-cache no teto.** Com as correções, o pré-cache chegou a 2.000.624 bytes e o `check:build` reprovou. A **Agenda** saiu do pré-cache (`vite.config.ts`), no mesmo critério de Plano e Auditoria em 18/10: ela só lista e grava com internet. Sem rede, abrir a Agenda agora mostra o erro de rota em vez do erro de carregamento da lista. Ficou em 1.989.552 bytes, ~10 KB de folga; o teto continua apertado para as próximas telas.
- **Termos 1.1:** a cláusula 11 promete aviso de 30 dias para "mudanças relevantes". A mudança só alinha o texto ao que o app já faz desde a 0049; decidir se ela pede aviso é do Luiz.

## Fica com o usuário

1. Aplicar a **0053** no SQL Editor do Supabase e só depois dar o push (o gate do deploy espera `0053`).
2. Opcional: regenerar `database.types` (no cmd) para tirar os contratos provisórios de `p_id`.
3. Depois do deploy: `/termos` e `/configuracoes/plano` abrindo em aba anônima; o smoke do workflow já confere as duas.
