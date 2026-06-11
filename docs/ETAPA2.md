# BodyTrack, Etapa 2: arquitetura detalhada

Documento de referência do projeto. Vive em `docs/ETAPA2.md` no repositório.
As migrations propostas estão em `0001_schema.sql` e `0002_rls.sql`.

## 1. Decisões fechadas (Etapa 1 + respostas)

- Anotações posturais (pontos, linhas, ângulos, templates) ficam para a v1.1. A V1 postural tem captura, categorias, compressão, comparação lado a lado, em grade e overlay por opacidade.
- Multi-organização no schema desde a primeira migration; UI de equipe (convites, papéis) fica para depois. V1 opera como profissional solo.
- Apenas protocolos com fonte primária sólida entram no app: Jackson & Pollock 7 dobras (1978), Jackson & Pollock 3 dobras (1978), Jackson, Pollock & Ward 3 dobras para mulheres (1980), Durnin & Womersley (1974) e US Navy (Hodgdon & Beckett, 1984), com conversões de densidade por Siri (1961) e Brozek (1963). Petroski, Guedes, Faulkner e Sloan não entram enquanto não houver verificação contra fonte primária.
- MFA TOTP entra (recurso nativo do Supabase Auth).
- Auditoria mínima: quem/o quê/quando, sem payload.
- Todos os obrigatórios e os opcionais baratos entram na V1: overlay de fotos e logo do profissional no PDF inclusos.
- Campo de responsável legal para menores de 18, com consentimento eletrônico dentro do app (sem papel, sem scanner, sem certificado digital). Detalhe na seção 5.
- Teto de custo: máximo ~R$50/mês mesmo com 50 clientes. Supabase Pro (US$25/mês) está fora do caminho. A matemática que sustenta isso está na seção 10.

## 2. Desvios do escopo original (para validação)

1. **Protocolos viram código TypeScript, não tabelas.** As tabelas `protocols`, `protocol_fields` e `protocol_results` saem do banco. Fórmula armazenada como dado exigiria uma mini-linguagem e um avaliador de expressões, que é over-engineering e risco de corretude. Em TS, cada protocolo é um objeto tipado com metadados, exigências e uma função pura, coberto por testes unitários com exemplos publicados. O resultado calculado é gravado como snapshot em `assessments.results` (jsonb) junto com `engine_version`, o que mantém qualquer PDF emitido reproduzível mesmo que o engine mude depois.
2. **PDFs não são armazenados** e a tabela `reports` sai. Relatório é regenerado sob demanda a partir do snapshot. O 1 GB de storage fica inteiro para fotos. A geração é registrada em `audit_logs`.
3. **`export_logs` foi fundida em `audit_logs`**, com as ações `EXPORT_CSV`, `EXPORT_JSON`, `PDF_REPORT` e `AI_SUMMARY`.
4. **`sex` restrito a M/F.** As equações antropométricas são validadas por sexo biológico; o campo existe para seleção de protocolo, e o formulário deixa isso explícito.
5. **CSV em dois formatos**, com padrão internacional como default (vírgula como separador, ponto decimal, RFC 4180) por ser o alvo declarado análise posterior em R/Python, e opção "Excel BR" (ponto e vírgula como separador, vírgula decimal) no diálogo de exportação. Ambos em UTF-8 com BOM para o Excel abrir acentos corretamente.

Se algum desses cinco não servir, é barato reverter agora e caro depois.

## 3. Modelo de dados

```
organizations ── org_members ── profiles (espelho de auth.users)
      │
      └── subjects (avaliados)
             ├── assessments ──┬── circumference_readings
             │                 └── skinfold_readings
             ├── posture_sessions ── posture_photos ── posture_annotations (v1.1)
             └── consent_records
audit_logs (transversal)    plans / org_subscriptions (estrutura futura)
```

Decisões estruturais:

- **`org_id` denormalizado em todas as tabelas filhas.** As policies de RLS não precisam de join, e triggers `before insert` copiam o `org_id` do registro pai, ignorando o que vier do cliente. Consistência garantida no banco, não no front.
- **Snapshot de resultados.** Medidas brutas ficam normalizadas nas tabelas de leitura; o resultado calculado (IMC, densidade, %G, massas, razões, deltas) vai em `assessments.results` com a versão do engine.
- **Consentimento imutável.** Trigger guard impede alterar qualquer campo além de `revoked_at`. Não existe policy de delete: o registro só some no cascade da exclusão definitiva do avaliado.
- **Auditoria enxuta** por causa do limite de 500 MB do banco: sem old/new payload, só org, usuário, ação, tabela, linha e timestamp.
- **`posture_annotations` já existe no schema** (payload jsonb) para a v1.1 não precisar de migration, mas não tem UI na V1.
- Convenção de nomes: tabelas e colunas em inglês (evita acento e palavra reservada); termos de domínio em pt-BR ficam na UI, incluindo o termo configurável (`organizations.subject_term`).

## 4. RLS

Padrão adotado:

- Funções auxiliares no schema `app`, que o PostgREST não expõe. Todas `security definer` com `search_path` vazio (evita recursão de RLS e hijack de schema) e `(select auth.uid())` para o Postgres cachear o valor por statement.
- Regra de visibilidade central: `app.can_view_subject(org, evaluator)`. Owner e admin veem tudo da org; avaliador comum vê os próprios avaliados, ou todos se `organizations.evaluators_see_all` estiver ligado. Tudo que pende de um avaliado (avaliações, leituras, fotos, consentimentos) herda essa regra via `can_view_*_id`.
- Escrita sempre com `with check`, prendendo a linha a uma org da qual o usuário é membro.
- Criação de organização só pela RPC `create_organization` (security definer), que insere org e membership owner atomicamente.
- Storage: buckets `photos` e `logos` privados, com limite de tamanho e mime types permitidos definidos no próprio bucket. O path sempre começa com o `org_id`, e a policy valida a primeira pasta. Exibição via `createSignedUrl` com TTL de 300 s.

### Roteiro de teste de RLS (executar antes de qualquer dado real)

Preparação: criar dois usuários de teste pelo dashboard (A e B), logar com cada um no app e criar uma organização para cada, com um avaliado e uma avaliação em cada. Anotar os UUIDs.

No SQL Editor, impersonar o usuário A:

```sql
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<UUID_DO_USER_A>', 'role', 'authenticated')::text,
  true
);

-- os testes entram aqui

rollback;
```

Checklist (tudo dentro do bloco acima, trocando o sub conforme o caso):

1. `select count(*) from subjects;` como A retorna só os da org A.
2. `select * from subjects where id = '<subject_da_org_B>';` retorna zero linhas.
3. `insert into subjects (org_id, full_name, birth_date, sex) values ('<org_B>', 'x', '2000-01-01', 'M');` falha com violação de policy.
4. `update subjects set notes = 'x' where id = '<subject_da_org_B>';` afeta zero linhas.
5. `delete from assessments where id = '<assessment_da_org_B>';` afeta zero linhas.
6. `insert into skinfold_readings (assessment_id, site, reading_1) values ('<assessment_da_org_B>', 'triceps', 10);` falha.
7. `select count(*) from consent_records;` e `from posture_photos;` como A só retornam os da org A.
8. `update consent_records set signer_name = 'x' where id = '<consent_da_org_A>';` falha no guard de imutabilidade.
9. `select count(*) from audit_logs;` como avaliador comum retorna zero (apenas owner/admin leem); como owner da org A retorna só os da org A.
10. `set local role anon;` e qualquer select nas tabelas retorna zero linhas.
11. No app, logado como A, tentar `createSignedUrl` para um path da org B: erro.
12. Anotar para a v1.x multiusuário: com `evaluators_see_all = false`, avaliador comum não enxerga avaliado de outro avaliador da mesma org.

## 5. Consentimento eletrônico (LGPD)

Medidas corporais e fotos posturais são dados referentes à saúde, portanto dados pessoais sensíveis (art. 5º, II), tratados com base em consentimento específico e destacado (art. 11, II, a). Para menor de 18, consentimento do responsável legal (art. 14, § 1º). A LGPD não exige forma específica de manifestação, exige que seja livre, informada e inequívoca, e que o controlador consiga provar que ela ocorreu. O fluxo abaixo atende isso sem papel e sem certificado digital:

1. No cadastro, o app calcula a idade. Menor de 18 exige `guardian_name` e `guardian_relationship` preenchidos antes de prosseguir.
2. Tela de consentimento: exibe o texto versionado (arquivo `consent/v2026-06.md` no repositório, com versão e hash fixados no build). O avaliador entrega o aparelho; o titular (ou o responsável, no caso de menor) lê, digita o nome completo e toca em "Li e concordo".
3. O app grava em `consent_records`: versão do texto, sha256 do texto exibido, tipo de signatário (titular ou responsável), nome digitado, quem coletou, user agent e timestamp. O registro é imutável.
4. Sem consentimento ativo, o app bloqueia criação de avaliação e upload de foto (gate na UI e verificação na query de consentimento vigente).
5. Revogação: botão no perfil do avaliado seta `revoked_at`. Revogar não apaga dados; a exclusão é o fluxo próprio de exclusão definitiva (art. 18), que remove fotos do storage e cascateia o banco.
6. Papéis: o profissional/academia é o controlador; o BodyTrack é o operador. A política de privacidade da V1 deve dizer isso com clareza. Antes de virar produto pago, revisar o texto com advogado; para o beta, texto próprio bem escrito resolve.

## 6. Estrutura de pastas

```
bodytrack/
├─ .github/workflows/        keep-alive.yml, backup.yml
├─ supabase/
│  ├─ migrations/            0001_schema.sql, 0002_rls.sql, ...
│  └─ config.toml
├─ public/                   manifest, ícones PWA
├─ consent/                  v2026-06.md (texto de consentimento versionado)
├─ docs/                     ETAPA2.md, notas
├─ src/
│  ├─ app/                   router, providers, AppShell
│  ├─ components/            compartilhados (PageHeader, ConfirmDialog, EmptyState...)
│  ├─ components/ui/         shadcn/ui (gerado por CLI)
│  ├─ features/
│  │  ├─ auth/               login, signup, confirmação, MFA
│  │  ├─ onboarding/         criação da organização
│  │  ├─ subjects/           CRUD de avaliados
│  │  ├─ consent/            fluxo de aceite e revogação
│  │  ├─ protocols/          registry, fórmulas, testes (engine puro, sem React)
│  │  ├─ assessments/        wizard de avaliação física
│  │  ├─ results/            cálculo derivado, comparações, deltas
│  │  ├─ charts/             wrappers de Recharts
│  │  ├─ posture/            captura, compressão, comparação
│  │  ├─ reports/            PDF, CSV, resumo IA
│  │  └─ org-settings/       termo exibido, logo, conta, MFA
│  ├─ lib/                   supabase.ts, storage.ts, image.ts, csv.ts, utils.ts
│  ├─ hooks/
│  └─ types/                 database.types.ts (gerado), domain.ts
└─ vite.config.ts
```

Testes (vitest) ficam colocalizados: `jp7.test.ts` ao lado de `jp7.ts`.

## 7. Componentes principais

- `AppShell`: sidebar no desktop, bottom nav no mobile.
- `SubjectList` / `SubjectForm` / `SubjectProfile`: perfil com abas Resumo, Avaliações, Postural, Dados.
- `AssessmentWizard`: passos dados básicos, circunferências, dobras, revisão com resultados ao vivo.
- `MeasureInput`: input numérico otimizado para velocidade (teclado numérico, enter avança para o próximo campo); é o componente mais importante do fluxo real de avaliação, com adipômetro na mão ninguém quer caçar campo na tela.
- `SkinfoldInput`: 1 a 3 aferições por ponto com média ao vivo.
- `ProtocolPicker`: filtra por sexo e idade do avaliado, mostra exigências, referência e limitações do protocolo.
- `ResultsPanel` / `ComparisonPicker` / `DeltaBadge`: resultados, escolha da avaliação de referência, indicadores de variação.
- `EvolutionChart` / `SummaryCards`: séries temporais e cards do dashboard e do perfil.
- `PhotoCapture` / `PhotoGrid` / `PhotoCompare`: captura/upload com compressão, grade de thumbs, comparação lado a lado, em grade e overlay com slider de opacidade.
- `ConsentDialog`: o fluxo da seção 5.
- `PdfReportButton` / `CsvExportButton` / `AiSummaryDialog`: exportações, esta última com alternância identificado/anônimo.

## 8. Fluxo de telas

```
Login ──> confirmação de e-mail ──> Onboarding (nome da org + termo exibido) ──> Dashboard
Dashboard: cards (ativos, avaliações no mês), últimas avaliações, atalho "nova avaliação"
Avaliados: lista com busca e filtro ativo/inativo ──> Perfil do avaliado
  Resumo:      última vs anterior (default), cards, minigráficos
  Avaliações:  histórico, nova, abrir detalhe, comparar com qualquer uma
  Postural:    sessões, nova sessão, comparar fotos
  Dados:       cadastro, responsável, consentimento (status/aceite/revogação),
               exportar (CSV/JSON), excluir definitivamente
Configurações: organização (termo, logo) e conta (senha, MFA TOTP)
```

Mobile-first em tudo que é usado durante a avaliação; o desktop ganha densidade nas tabelas e gráficos.

## 9. Storage e compressão de imagens

Pipeline 100% client-side, em `lib/image.ts`:

1. Foto via `<input type="file" accept="image/*" capture="environment">` (abre a câmera nativa) ou seleção da galeria/arquivo.
2. `createImageBitmap` com correção de orientação EXIF.
3. Redimensionamento em canvas: lado maior 1600 px para a foto, 320 px para o thumbnail.
4. `canvas.toBlob('image/webp', 0.82)`. Se o navegador devolver outro tipo (Safari pode), reencodar como JPEG 0.8. O reencode via canvas descarta o EXIF inteiro, inclusive GPS, que é exatamente o que a LGPD pede aqui.
5. Upload para o bucket privado `photos` no path `{org}/{subject}/{session}/{uuid}.webp` e `..._thumb.webp`, registrando dimensões e bytes em `posture_photos`.

Alvo: 150 a 350 KB por foto, o que dá 3 a 5 mil fotos no 1 GB gratuito. Grades exibem só thumbs; o original carrega ao abrir, sempre via URL assinada de 300 s.

Exclusão definitiva: o storage não cascateia com o banco, então o fluxo é `storage.removePrefix('{org}/{subject}/')` primeiro e delete do subject depois (o banco cascateia o resto).

Costura para o futuro: todo acesso a arquivos passa por `lib/storage.ts` (upload, signedUrl, remove, removePrefix). Quando o uso passar de ~700 MB, a migração para Cloudflare R2 (10 GB gratuitos, egress zero, URL assinada via Worker) troca uma implementação sem tocar no resto do app.

## 10. Matemática de custo (50 clientes, teto de R$50/mês)

- Banco: medidas são quilobytes. 50 orgs x ~80 avaliados x ~10 avaliações dá ~40 mil avaliações com filhas, bem abaixo de 300 MB com a auditoria enxuta. Cabe nos 500 MB.
- Fotos: 50 orgs x 40 avaliados x 8 fotos x 250 KB dá ~4 GB. Estoura o 1 GB do Supabase, e é por isso que a migração para R2 já tem costura pronta: 10 GB gratuitos e, acima disso, ~US$0,015/GB/mês. Custo: R$0 a R$5.
- Egress de banco (5 GB/mês): queries JSON são pequenas; fotos servidas pelo R2 não contam (egress zero).
- E-mail: SMTP do Resend (free) quando o rate limit do Supabase incomodar.
- Total projetado com 50 clientes: R$0 a R$10/mês, mais domínio opcional (~R$40/ano). Dentro do teto com folga.
- Risco residual, registrado com honestidade: free tier não tem SLA nem backup nativo. Mitigação na seção 12. Com 50 pagantes haverá receita; vale reavaliar a infraestrutura nesse momento, mas a arquitetura não força isso.

## 11. PDF, CSV e resumo para IA

**PDF** (`@react-pdf/renderer`, client-side, custo zero de servidor): cabeçalho com logo do BodyTrack e logo da organização; identificação do avaliado e do avaliador; cards de resumo; tabelas de circunferências e dobras; gráficos rasterizados; comparativo com a avaliação escolhida; fotos posturais opcionais (checkbox na geração); observações; disclaimer fixo de que os resultados são estimativas dependentes do protocolo e da qualidade da medição e não constituem diagnóstico. Rasterização dos gráficos: SVG do Recharts serializado com `XMLSerializer`, desenhado em canvas e exportado como PNG dataURL para o `<Image>` do react-pdf. Plano B documentado caso o layout brigue: rota `/print` com CSS de impressão.

**CSV** (papaparse): dados brutos e calculados, uma linha por avaliação com colunas dinâmicas para medidas. Default internacional e opção Excel BR, conforme desvio 5.

**Resumo para IA**: markdown estruturado com cadastro resumido, histórico de avaliações, medidas, resultados e evolução. Modo identificado e modo anônimo (remove nome, contatos e datas exatas; mantém idade, sexo e a série temporal relativa). Aviso fixo no topo: material de apoio, não usar como diagnóstico médico.

As três exportações inserem a ação correspondente em `audit_logs`.

## 12. Operação no free tier

- `keep-alive.yml`: GitHub Action com cron a cada 3 dias fazendo um GET simples na REST API (secrets `SUPABASE_URL` e `SUPABASE_ANON_KEY`). Elimina a pausa por 7 dias de inatividade.
- `backup.yml`: semanal; `pg_dump` pela connection string (secret), criptografado com gpg simétrico (secret `BACKUP_PASSPHRASE`), publicado como artifact do repositório privado (retenção de 90 dias). Fazer um teste de restore antes do beta, backup que nunca foi restaurado não é backup.
- Auth: confirmação de e-mail ligada, senha mínima de 10 caracteres, MFA TOTP opcional na tela de conta. O Supabase avisa por e-mail ao se aproximar dos limites do plano; ainda assim, olhar o painel de uso a cada semana ou duas.

## 13. Plano da Etapa 3 (ordem de implementação)

Cada parte vem com passo a passo completo para Windows/CMD/VSCode, do `npm create` ao `git push`.

1. Setup: repositório, Vite + React + TS, Tailwind + shadcn/ui, projeto Supabase, migrations aplicadas, tipos gerados (`database.types.ts`), deploy vazio no Cloudflare Pages.
2. Auth e onboarding: signup, confirmação, login, `create_organization`, guards de rota.
3. Avaliados: CRUD completo + fluxo de consentimento.
4. Engine de protocolos: registry, fórmulas e testes unitários com vetores publicados. Nesta parte cada fórmula é validada contra a fonte antes de aparecer na UI.
5. Avaliação física: wizard, leituras, snapshot de resultados, comparações.
6. Gráficos e dashboard.
7. Exportações: PDF, CSV, resumo IA.
8. Postural: captura, compressão, sessões, comparações.
9. LGPD operacional: exportação de dados do titular, exclusão definitiva (storage + banco), log de exportações.
10. PWA (manifest, service worker, ícones), MFA, polimento de UX.
11. Operação: keep-alive, backup com teste de restore, execução do roteiro de RLS da seção 4, beta com a avaliadora.

Estimativa realista no seu ritmo, com faculdade e os outros projetos em paralelo: 6 a 8 semanas.
