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
- Deploy: push na `main` → build automático do Cloudflare Pages
  (domínio avalixfit.com.br). Quem dá o push é o usuário.
- PDFs gerados (`@react-pdf/renderer`): renderizar e **olhar a imagem**
  (`pdftoppm` está instalado) — nunca iterar dataviz de PDF às cegas.
