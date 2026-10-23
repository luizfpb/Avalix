---
name: auditoria-completa
description: Auditoria completa do Avalix em seis frentes (chamadas externas com falha parcial, limites N/N+1, irmãos de dado e de correção, entradas fora do formato, teclado/acessibilidade, documentação contra o código), com prova antes de corrigir e teste que reprova no código anterior. Use quando pedirem "auditoria", "caçar defeito", "checagem geral" ou uma nova rodada do roteiro.
---

# Auditoria completa do Avalix

Não é revisão de estilo: é caçar defeito real, provar cada um, corrigir e deixar
um teste que reprova no código antigo. A rodada anterior está em
`docs/AUDITORIA_2026-10-23.md`; leia antes para não repetir o que já foi
descartado e para conferir os "irmãos" das correções dela.

## Regras de trabalho

1. Nenhuma operação git que escreve (commit, push, branch, reset, rebase,
   stash, worktree). Leitura (`git show HEAD:arquivo`, `git diff`) é livre.
2. Todo comando entregue ao usuário cabe numa linha, em sintaxe do cmd.
3. Português, com acentuação nos arquivos; sem acento dentro de `-m` de commit.
4. Produção (https://avalixfit.com.br) é SÓ leitura: GET sem login, cabeçalhos,
   `DEPLOYMENT_URL=https://avalixfit.com.br node scripts/check-deployment.mjs`.
   Nada de criar, alterar ou apagar dado real; nada de chamar RPC autenticada.

## Regras de método

- Nenhum achado sem prova: teste automatizado, banco descartável, navegador com
  API simulada ou runtime local. "Parece" não é achado.
- Antes de chamar de defeito, procure a decisão em `docs/DECISIONS.md`
  (`grep -n` pelo termo), nos docs da etapa e nos comentários. Decisão
  documentada não é bug — mas texto legal/doc que contradiz a decisão é.
- Todo teste novo precisa REPROVAR no código anterior:
  `git show HEAD:caminho > %TEMP%\x.head`, copie a versão nova para o lado,
  ponha a do HEAD no lugar, rode o teste, restaure. Teste que passa nos dois
  estados não conta. Para migration, recrie o corpo antigo da função dentro de
  uma transação e rode a suíte pgTAP nova (ela deve reprovar e o rollback
  devolve a função nova).
- Desconfie das correções recentes (as últimas seções do DECISIONS): o
  primeiro lugar para procurar é o "irmão" esquecido do mesmo padrão.
- Não pare quando a lista "parecer suficiente": pare quando as seis frentes
  estiverem percorridas e o que ficou de fora estiver listado com motivo.

## Ferramentas desta máquina

- **Banco descartável (PostgreSQL 18 em `C:\Program Files\PostgreSQL\18\bin`).**
  O harness fica em `audit-preview.local/` (ignorado pelo git). Copie o
  `run_database.py` da rodada anterior para uma pasta NOVA da rodada, troque a
  porta e rode `python <pasta>/run_database.py setup` (initdb, bootstrap de
  auth/storage, todas as migrations, pgTAP), depois `... test` (todas as suítes
  de `supabase/tests`, resumo em `pgtap-summary.json`) e `... stop` no fim.
  Um arquivo `.sql` qualquer roda com `... caminho.sql`. O bootstrap cria os
  papéis `anon`/`authenticated`/`service_role`, os schemas `auth`, `storage` e
  `extensions`, `auth.users` (com `email`), `auth.uid()`/`auth.jwt()` lendo
  `request.jwt.claims`, e `storage.buckets/objects`. Para agir como usuário:
  `select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated","aal":"aal1"}', true); set local role authenticated;`.
- **Navegador real:** Chrome 156 em `C:\Program Files\Google\Chrome\Application`.
  Para provar comportamento do navegador (foco, `<dialog>`, teclado), sirva uma
  página mínima com o componente real pelo Vite
  (`npx vite --port <p> --strictPort --host 127.0.0.1`, página dentro de
  `audit-preview.local/`) e dirija por CDP (`--headless=new
  --remote-debugging-port`). Tecla Enter sintética precisa de `keyDown` com
  `text: "\r"`. Encerre o Vite pela porta no fim (PowerShell:
  `Get-NetTCPConnection -LocalPort <p> | Stop-Process`).
- **Servidor falso no vitest:** para "resposta perdida depois de gravar", mocke
  `../lib/supabase` com uma tabela em memória que grava, lança
  `TypeError('Failed to fetch')` na primeira resposta e devolve `23505` com
  `"<tabela>_pkey"` para id repetido. Para ordem/paginação, um builder que
  ordena pelas colunas pedidas e embaralha os empates a cada consulta.
- **supabase-js real com fetch falso:** o cliente guarda o `fetch` global ao
  ser criado; troque `globalThis.fetch` dentro de `vi.hoisted`. Com o fetch
  REJEITANDO, o SDK deixa uma rejeição derivada sem tratamento que o vitest
  acusa: simule o retorno do SDK (`FunctionsFetchError`) na fronteira.
- **PDF:** renderize e olhe a imagem (`pdftoppm`); nunca itere às cegas.

## As seis frentes (com onde olhar no Avalix)

### 1. Chamadas externas com falha parcial
Inventário: `grep -rnoE "\.(from|rpc)\('[a-z_]+'|functions\.invoke|storage\.from|fetch\(" src scripts supabase/functions`
e `supabase.auth.*`. Para cada uma:
- 500/503 com e sem corpo, HTML no lugar de JSON: a tela diz a verdade? A
  biblioteca DEVOLVE o erro (`{ error }`) em vez de lançar — ele é lido?
  Update/delete sem `.select()` volta "ok" com 0 linhas quando a RLS recusa.
- Resposta perdida depois de gravar: a nova tentativa duplica? A identidade
  (id/client_ref) é da AÇÃO (gerada uma vez pela tela), não de cada tentativa.
  Cuidado com `ON CONFLICT DO NOTHING`: gatilhos BEFORE INSERT rodam mesmo no
  conflito; confira a existência antes do insert.
- Falha de rede junto com falha local (localStorage bloqueado, IndexedDB
  fechado pelo Safari, cota cheia).
- "Carregando..." eterno (`enabled: false` deixa a query em `isPending`).
- Resposta antiga sobrescrevendo a nova (efeitos sem `active`/contador).
- Falha no meio de um fluxo de várias etapas (Edge Function `billing`: Asaas
  gravou, banco não; o estado da tela é relido depois do erro?).

### 2. Limites em N e N+1
Constantes (`grep -rnE "const [A-Z_]{4,} = [0-9_]+" src`), CHECKs do banco
(`pg_constraint` com `char_length`/faixa), limites de bucket
(`storage.buckets`), cotas das RPCs anônimas, teto do pré-cache
(`scripts/check-build.mjs`). Tetos invisíveis: o PostgREST corta em 1000 linhas
sem erro (inclusive RPC que devolve `setof`); paginação por OFFSET precisa de
ordem TOTAL (última coluna única) — empate em `at`/`created_at` repete e pula
linhas entre páginas. Quem chama respeita o teto de quem é chamado?

### 3. Irmãos de cada dado e de cada correção
Para cada dado sensível (saúde, fotos, CPF do Pix, token do link): tabelas,
histórico, `audit_logs`, `client_errors`, exportação (`export_subject_data`),
CSV/PDF, backup (90 dias), fila offline (IndexedDB), rascunhos (`lib/draft.ts`),
logs da Edge Function, e-mails. Para cada chave de armazenamento local: é por
usuário (`userId:orgId`) ou por aparelho? Quem escolhe a chave? É limpa no
logout (`clientPrivacy.ts`)? Para cada correção recente: onde mais o padrão
aparece (ex.: rota nova sem `_redirects`; checagem de 0 linhas em um update e
não no vizinho; idempotência num create e não nos outros).

### 4. Entradas fora do formato
Todo campo, parâmetro de URL (`?retorno=`), cabeçalho e arquivo: vazio,
espaços, negativo, zero, enorme, vírgula decimal (iOS 26), unicode, valor fora
da lista do select, decimal em coluna `integer`, arquivo válido mas incomum
(PNG enorme, WebP, EXIF). O limite da tela bate com o CHECK do banco? O erro
que escapa vira texto em pt-BR (`normalizeDbError`) ou nome de constraint?

### 5. Teclado e acessibilidade
Todo `<dialog>`/modal (`grep -rn "showModal\|role=\"dialog\""`): foco inicial,
Tab/Shift+Tab presos, Escape, fundo inerte, foco devolvido ao fechar — diálogo
que sai da árvore aberto não passa pelo `close()` e perde o foco (use
`useReturnFocus`). Elementos clicáveis que não são botão/link respondem a
Enter/Espaço? Papéis ARIA que prometem comportamento (`radio`, `tab`, `menu`,
`listbox`) implementam as setas? Input escondido (`sr-only`) tem foco visível?

### 6. Documentação contra o código
Todo comando, script, flag e passo de `AGENTS.md`, `docs/*.md` e workflows
existe e faz o que diz (`npm run`, `node scripts/...`, caminhos citados).
Afirmações "isto tem teste" conferem com o import real. Textos legais
(`features/legal/terms.ts`, `features/consent/text.ts`, telas de Pix/plano)
batem com o que o app e o banco fazem hoje — mudar o termo de consentimento
exige nova versão e a cópia byte a byte na migration.

## Entrega

1. Comece mostrando o inventário (chamadas externas, limites, dados sensíveis,
   chaves locais, diálogos) antes de sair corrigindo.
2. Tabela de achados: ID, prioridade (P1 privacidade/segurança, P2 perda de
   dado ou fluxo quebrado, P3 menor), problema, prova, correção, teste.
3. Suspeitas DESCARTADAS, cada uma com a prova de por que não é problema.
4. O que NÃO foi coberto e por quê (Asaas real, iPhone/Android, logado em
   produção...).
5. Corrija tudo, com teste para cada correção; rode `npm run lint`,
   `npm run test`, `npm run build`, `npm run check:build` e a suíte pgTAP
   inteira no banco descartável; informe os números.
6. Registre em `docs/AUDITORIA_<data>.md`, uma seção no topo do
   `docs/DECISIONS.md` e atualize o estado do schema. Migration que sobe o
   carimbo sobe também `EXPECTED_SCHEMA_VERSION`.
7. Feche com os comandos (um por linha, cmd) para revisar, aplicar a
   migration, commitar e publicar, e a lista curta do que só o usuário
   consegue testar logado.
