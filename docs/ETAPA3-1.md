# BodyTrack - Etapa 3.1 (file-first)

Arquivos base gerados por `scripts/write-etapa3-files.mjs`. Re-rodar o script restaura/atualiza os arquivos base. Ele NUNCA toca em: `supabase/migrations/*.sql`, `docs/DECISIONS.md`, `docs/ETAPA2.md`, `.env.local`. O `supabase/config.toml` so e criado se nao existir.

## Sequencia minima (terminal integrado do VSCode, perfil Command Prompt)

1. `node scripts\write-etapa3-files.mjs`
2. `npm install`
3. Manual: copiar `0001_schema.sql` e `0002_rls.sql` para `supabase\migrations\`; copiar `DECISIONS.md` e `ETAPA2.md` para `docs\` (pode ser pelo Explorer do Windows ou pelo VSCode).
4. Manual: criar projeto no Supabase (regiao South America - Sao Paulo; salvar a database password no gerenciador de senhas). Copiar: Project URL (Settings -> API), Publishable key (Settings -> API Keys; se so houver o botao "Create new API keys", clique nele) e Reference ID (Settings -> General).
5. Manual: criar `.env.local` na raiz copiando o `.env.example` e preenchendo.
6. `npm run dev` -> checkpoint A
7. `npx supabase login`
8. `npx supabase link --project-ref SEU_REF` (pede a database password)
9. `npx supabase db push` -> confirmar com Y
10. `npx supabase gen types typescript --linked > src\lib\database.types.ts`
    Terminal CMD obrigatorio neste comando: o `>` do PowerShell grava UTF-16 e quebra o arquivo.
11. `npm run test` e `npm run build`
12. `git init`, `git add .`, `git commit -m "etapa 3.1: esqueleto"`, criar repo privado `bodytrack` no GitHub (sem README), `git remote add origin ...`, `git branch -M main`, `git push -u origin main`
13. Manual: Cloudflare Pages -> Workers & Pages -> Create -> Pages -> Connect to Git -> repo `bodytrack`. Preset: Vite (build `npm run build`, output `dist`). Env vars de producao: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `NODE_VERSION=22`. Save and Deploy.
14. Manual: Supabase -> Authentication -> URL Configuration: Site URL = `https://SEU-PROJETO.pages.dev`; adicionar `http://localhost:5173` em Redirect URLs.

## Checkpoints

- A. `npm run dev` sem `.env.local`: a pagina abre e acusa env ausente. Com `.env.local` + restart do dev server: "API ok; acesso anonimo bloqueado como esperado (...)" ou "select anonimo liberado (lista vazia)". "chave invalida" = key errada; "rede: URL ... inacessivel" = URL errada.
- B. `db push` aplica 0001 e 0002. Cada arquivo roda em transacao: se falhar, nada fica pela metade; corrija o SQL in-place (pre-deploy permite) e repita. Conferir com `npx supabase migration list` e no Table Editor do painel.
- C. Depois do gen types: `database.types.ts` legivel, contendo `export type Database`, e `npm run dev` segue ok. Se o TypeScript reclamar de `subjects` no `App.tsx`, troque pelo nome real de alguma tabela do schema public.
- D. `npm run test` = 1 passed; `npm run build` verde.
- E. A URL `*.pages.dev` mostra a mesma pagina com conexao ok. Mudou env var no Pages = Retry deployment (env e de build).

## Notas

- `src/lib/database.types.ts` e placeholder; o passo 10 o substitui. A chave publishable e publica por design (vai no bundle); a seguranca vem do RLS da Etapa 2.
- Se `link`/`push` reclamarem de configuracao, rode `npx supabase init` (o config.toml gerado e preservado pelo script).
- Se o push pular migration com "file name must match pattern", renomeie com prefixo timestamp preservando a ordem: `20260611000001_schema.sql`, `20260611000002_rls.sql` (e registre a mudanca de convencao no DECISIONS).
- Free tier do Supabase pausa o projeto apos ~7 dias sem requisicoes; reativar e um clique no painel. Action de keep-alive entra na etapa de operacao.
- Bucket de fotos: conferir o `bucket_id` usado nas policies do 0002 e criar no painel (Private, MIME image/webp e image/jpeg, limite ~5 MB) quando a feature postural chegar. Pode criar agora, opcional.
- Fora do escopo da 3.1: auth UI, MFA, CRUD, protocolos, postural, PDF, CSV, dashboard, PWA/service worker, Actions de keep-alive/backup.

## Ao concluir, atualizar docs/DECISIONS.md

Estado atual: Etapa 3.1 entregue (esqueleto file-first: Vite + React + TS, Tailwind v4, shadcn button/card, react-router, TanStack Query, cliente Supabase tipado com guarda de env, vitest, eslint; migrations 0001/0002 aplicadas via db push; types gerados; deploy automatico no Cloudflare Pages com NODE_VERSION=22; Auth URLs configuradas; chave publishable em uso, legadas saem ate o fim de 2026).
Proximo passo: Etapa 3, parte 2: a definir no chat. Sugestao natural: fluxo de auth (cadastro, confirmacao de e-mail, login, MFA TOTP) + bootstrap de organizacao, ja que todo o resto depende de sessao e org.
