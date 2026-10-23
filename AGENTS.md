# Instruções para a IA — Avalix

As regras globais de `~/.codex/AGENTS.md` valem integralmente aqui
(nunca operar git de escrita; comandos de 1 linha em sintaxe cmd;
pt-BR; commits sem cara de IA; acentuação e pontuação corretas).

## Ler antes de começar (fonte de verdade, nesta ordem)

1. [`docs/DECISIONS.md`](docs/DECISIONS.md) — decisões acumuladas do projeto.
2. Documento da etapa atual em `docs/` (ex.: `ETAPA3-2.md`, specs de anamnese).
3. `supabase/migrations/` — migrations existentes (numeradas).
4. Código existente — **absorver as convenções, não reinventar**.
5. [`docs/AI_WORKFLOW.md`](docs/AI_WORKFLOW.md) — regras operacionais da IA.

## Fluxo de trabalho

- Validação padrão de toda entrega: `npm run lint` → `npm run test`
  (vitest) → `npm run build` (tsc + vite). Tudo verde antes de entregar.
- Supabase: a IA escreve a migration numerada; **o usuário aplica no
  dashboard e regenera `database.types`**. O estado do banco em produção
  não é visível daqui.
- Deploy: push na `main` → GitHub Actions (`.github/workflows/deploy.yml`)
  roda lint e testes, confere o carimbo do banco (`check:remote-schema`,
  `EXPECTED_SCHEMA_VERSION` em `scripts/check-schema-version.mjs`), faz o
  build e publica no Cloudflare Pages com o wrangler (domínio
  avalixfit.com.br), seguido do smoke HTTP. Migration nova que sobe o
  carimbo precisa estar aplicada ANTES do push, senão o deploy para no gate.
  Quem dá o push é o usuário.
- Rota nova no `App.tsx` precisa entrar em `public/_redirects` (sem isso
  responde 404 para quem chega sem o service worker) E em `public/_headers`
  com `no-store` (sem isso o smoke do deploy reprova). O
  `pagesConfig.test.ts` cruza as rotas com os dois arquivos.
- Auditoria completa: seguir a skill `.claude/skills/auditoria-completa`
  (registro da última rodada em `docs/AUDITORIA_2026-10-23.md`).
- PDFs gerados (`@react-pdf/renderer`): renderizar e **olhar a imagem**
  (`pdftoppm` está instalado) — nunca iterar dataviz de PDF às cegas.
