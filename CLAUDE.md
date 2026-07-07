# Instruções para a IA — Avalix

As regras globais de `~/.claude/CLAUDE.md` valem integralmente aqui
(nunca commitar — hook bloqueia; comandos de 1 linha em sintaxe cmd;
pt-BR; commits sem cara de IA).

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
- Deploy: `git push` → build automático do Cloudflare Pages
  (domínio avalixfit.com.br).
- PDFs gerados (`@react-pdf/renderer`): inspecionar com o Read (pdftoppm
  está instalado) — nunca iterar dataviz de PDF às cegas.
