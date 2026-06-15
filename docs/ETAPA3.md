# BodyTrack — Etapa 3, parte 1: setup do projeto

Salvar como `docs/ETAPA3.md`. Gerado em 11/06/2026, comandos verificados contra a documentação atual (Supabase com chaves publishable, shadcn CLI, Tailwind v4 via plugin do Vite).

Escopo desta parte: esqueleto rodando localmente, migrations 0001/0002 aplicadas no Supabase hospedado, types gerados, vitest funcionando, repo no GitHub e deploy vazio no Cloudflare Pages. Nada de CRUD, auth UI, protocolos, postural, PDF ou dashboard.

Tempo estimado: 1h30 a 2h30, incluindo criação de contas e projetos.

Pré-condições:
- Arquivos `0001_schema.sql`, `0002_rls.sql`, `DECISIONS.md` e `ETAPA2.md` da etapa anterior em uma pasta acessível.
- Contas: GitHub (já tem), supabase.com e dash.cloudflare.com (criar se necessário, plano free em ambas).

Regra de terminal: **tudo no CMD, nunca PowerShell.** O motivo concreto está na seção 9 (o redirecionamento `>` do PowerShell gera arquivo UTF-16 quebrado). No VSCode: Terminal → New Terminal; se abrir PowerShell, clique na seta ao lado do `+` → Select Default Profile → Command Prompt → abra um novo terminal.

---

## 1. Pré-requisitos

```cmd
node -v
npm -v
git --version
```

Checkpoint: Node 22.x ou superior (mínimo absoluto 20.19, exigência do Vite 7), npm 10+, git presente.

Se o Node estiver ausente ou abaixo de 20.19:

```cmd
winget install OpenJS.NodeJS.LTS
```

Feche e reabra o terminal depois de instalar. Alternativa: instalador em nodejs.org.

---

## 2. Scaffold Vite + git

Na pasta onde você guarda projetos:

```cmd
npm create vite@latest bodytrack -- --template react-ts
```

Perguntas possíveis (variam com a versão do create-vite):
- "Ok to proceed?" → y
- Algo sobre rolldown-vite (experimental) → No
- "Install with npm and start now?" → No (faremos manualmente)

```cmd
cd bodytrack
npm install
npm run dev
```

Checkpoint: http://localhost:5173 abre a página padrão do Vite. `Ctrl+C` para parar (confirme com `S` se perguntar).

```cmd
git init
git add .
git commit -m "scaffold vite react-ts"
code .
```

Notas:
- Avisos "LF will be replaced by CRLF" são normais no Windows, não são erro.
- Mensagens de commit sem acento: o CMD usa codepage 850 por padrão e pode corromper acentos em argumentos. Se quiser acentos, rode `chcp 65001` antes; mais simples é não usar.
- O `.gitignore` do template já cobre `node_modules`, `dist` e `*.local` (que vai proteger o `.env.local` adiante). Confira que a linha `*.local` existe.

---

## 3. Tailwind v4

```cmd
npm install tailwindcss @tailwindcss/vite
```

Substitua **todo** o conteúdo de `src/index.css` por:

```css
@import "tailwindcss";
```

O Tailwind v4 não usa mais `tailwind.config.js` nem as três diretivas antigas; a configuração vive no CSS e o plugin do Vite faz o resto. O `vite.config.ts` será editado na próxima seção junto com o alias.

---

## 4. Alias TypeScript + shadcn/ui

O shadcn exige o alias `@/` configurado em três lugares antes do init.

### 4.1 tsconfig.json (raiz)

Substitua o conteúdo por:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### 4.2 tsconfig.app.json

Dentro do bloco `compilerOptions` **já existente** (não substitua o arquivo, só acrescente estas duas chaves):

```json
"baseUrl": ".",
"paths": {
  "@/*": ["./src/*"]
}
```

### 4.3 vite.config.ts

```cmd
npm install -D @types/node
```

Substitua o conteúdo de `vite.config.ts` por:

```ts
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

### 4.4 Init do shadcn

```cmd
npx shadcn@latest init
```

Aceite os defaults; na base color, sugestão: Neutral (estético, reversível). O init cria `components.json`, `src/lib/utils.ts` e injeta as variáveis de tema no `index.css` (o `@import "tailwindcss"` continua lá em cima, não remova).

```cmd
npx shadcn@latest add button card
```

Checkpoint: existem `src/components/ui/button.tsx` e `src/components/ui/card.tsx`, e `npm run dev` sobe sem erro (a página ainda é a do template; a prova visual vem na seção 11).

```cmd
git add .
git commit -m "tailwind v4 e shadcn"
```

---

## 5. Dependências do stack (fechado no DECISIONS)

Instalar tudo agora evita surpresa de versão no meio das features; o que não for importado não entra no bundle.

```cmd
npm install @supabase/supabase-js @tanstack/react-query react-router react-hook-form zod @hookform/resolvers recharts papaparse @react-pdf/renderer
npm install -D vitest supabase @types/papaparse
```

Notas:
- `react-router` v7 é o pacote atual (importa-se de `"react-router"` direto; o `react-router-dom` virou re-export).
- `supabase` como dependência de dev é o jeito suportado de ter o CLI no Windows via npm (instalação global por npm não é suportada). Usaremos sempre via `npx supabase`. A primeira execução baixa o binário e demora um pouco.
- Warnings de peer dependencies podem aparecer; warning não é erro.

```cmd
git add .
git commit -m "deps do stack"
```

---

## 6. Projeto Supabase (painel)

1. supabase.com → New project.
2. Nome: `bodytrack`. Database password: clique em Generate e **salve no gerenciador de senhas** — será pedida no `link` e ela não aparece de novo. Region: **South America (São Paulo)**.
3. Aguarde o provisionamento (1-2 min).
4. Settings → API Keys: copie a **Publishable key** (`sb_publishable_...`). Se a aba mostrar só um botão "Create new API keys", clique nele primeiro. Não use a `service_role`/secret em lugar nenhum do front, nunca.
   - Se o seu painel só mostrar as chaves legadas, a `anon` funciona igual, mas as legadas serão descontinuadas até o fim de 2026; prefira a publishable.
5. Settings → General → copie o **Reference ID** (também é o subdomínio na URL do painel).
6. Settings → API (Data API): copie a **Project URL** (`https://SEU_REF.supabase.co`).

---

## 7. CLI: init, login, link

Na raiz do projeto:

```cmd
npx supabase init
```

Se perguntar sobre gerar settings de VS Code para Deno (ou IntelliJ): N. Deno é para edge functions, fora do escopo.

```cmd
npx supabase login
```

Abre o navegador para autorizar; se pedir token manual, gere em supabase.com/dashboard/account/tokens.

```cmd
npx supabase link --project-ref SEU_PROJECT_REF
```

Vai pedir a database password da seção 6. Checkpoint: "Finished supabase link".

Importante: não vamos usar `supabase start` (stack local exige Docker). Todo o fluxo desta etapa é contra o projeto hospedado.

---

## 8. Migrations: copiar e aplicar

```cmd
mkdir supabase\migrations
copy "C:\caminho\para\0001_schema.sql" supabase\migrations\
copy "C:\caminho\para\0002_rls.sql" supabase\migrations\
```

(Se `supabase\migrations` já existir, o mkdir só dá um aviso; ignore.)

```cmd
npx supabase db push
```

O CLI lista 0001 e 0002 e pede confirmação → Y.

Comportamento útil de saber: cada arquivo roda em uma transação. Se 0002 falhar no meio, nada dele fica aplicado pela metade; você corrige o SQL **no próprio arquivo** (pré-deploy permite editar in-place, sem migration de correção) e roda `db push` de novo. O que já foi aplicado (0001) não roda duas vezes.

Se aparecer `Skipping migration ... (file name must match pattern "<timestamp>_name.sql")`: o CLI quer prefixo de timestamp. Renomeie preservando a ordem e rode o push de novo:

```cmd
ren supabase\migrations\0001_schema.sql 20260611000001_schema.sql
ren supabase\migrations\0002_rls.sql 20260611000002_rls.sql
```

(Não deve ser necessário — prefixo numérico costuma ser aceito — mas fica o plano B. Se renomear, atualize a convenção no DECISIONS.)

Checkpoints:

```cmd
npx supabase migration list
```

Local e Remote com as mesmas versões. E no painel: Table Editor mostrando as tabelas, Database → Functions mostrando as funções do schema `app`.

Bucket de fotos (opcional agora, obrigatório antes da feature postural): abra o `0002_rls.sql` e localize o `bucket_id` usado nas policies de storage. No painel, Storage: se as migrations não criaram o bucket, crie com **esse nome exato**, Private, allowed MIME types `image/webp` e `image/jpeg`, limite de tamanho 5 MB (sugestão: o upload já chega comprimido a ~1600 px). Pode adiar sem prejuízo para esta etapa.

```cmd
git add .
git commit -m "supabase: config e migrations"
```

---

## 9. Gerar types

**Confira que o terminal é CMD antes deste comando.** No PowerShell, o `>` grava UTF-16 e o arquivo `.ts` sai ilegível para o tsc.

```cmd
npx supabase gen types typescript --linked > src\lib\database.types.ts
```

Checkpoint: o arquivo abre legível no VSCode e contém `export type Database`. Esse arquivo é commitado (regenera-se a cada mudança de schema com o mesmo comando).

---

## 10. Env + cliente Supabase

### 10.1 .env.local (raiz do projeto, não commitado)

```
VITE_SUPABASE_URL=https://SEU_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
```

### 10.2 .env.example (raiz, commitado, só placeholders)

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

### 10.3 src/vite-env.d.ts

Substitua o conteúdo por:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

### 10.4 src/lib/supabase.ts (novo arquivo)

```ts
import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  // Em dev: conferir .env.local. No deploy: conferir env vars do Pages.
  throw new Error("VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY ausentes")
}

export const supabase = createClient<Database>(url, key)
```

---

## 11. Shell mínimo (router + query + página de status)

```cmd
del src\App.css
```

### 11.1 index.html

Ajuste duas linhas:

```html
<html lang="pt-BR">
...
<title>BodyTrack</title>
```

### 11.2 src/main.tsx (substituir todo o conteúdo)

```tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import App from "./App"
import "./index.css"

const queryClient = new QueryClient()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
```

### 11.3 src/App.tsx (substituir todo o conteúdo)

Página de status provisória; será substituída quando a primeira feature entrar. O smoke test consulta `subjects` sem sessão: com o hardening da Etapa 2, a resposta esperada é bloqueio ou lista vazia — ambos provam que URL, chave e API estão corretos. Se o TypeScript reclamar do nome `subjects`, troque por qualquer tabela listada em `database.types.ts`.

```tsx
import { Route, Routes } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"

async function checarSupabase(): Promise<string> {
  const { error } = await supabase.from("subjects").select("id").limit(1)
  if (!error) return "API ok; select anonimo liberado (lista vazia)"
  if (/api key/i.test(error.message)) {
    throw new Error("Chave invalida: confira VITE_SUPABASE_PUBLISHABLE_KEY")
  }
  // Bloqueio por RLS/grants tambem e sucesso: a API respondeu.
  return `API ok; acesso anonimo bloqueado como esperado (${error.message})`
}

function StatusPage() {
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ["status-supabase"],
    queryFn: checarSupabase,
    retry: false,
  })

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>BodyTrack — setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Vite + React + Tailwind + shadcn/ui: ok (esta página).</p>
          <p>
            Supabase:{" "}
            {isFetching ? "testando..." : error ? `erro: ${error.message}` : data}
          </p>
          <Button onClick={() => refetch()} disabled={isFetching}>
            Testar conexão de novo
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<StatusPage />} />
    </Routes>
  )
}
```

```cmd
npm run dev
```

Checkpoint e interpretação da linha "Supabase:":
- "acesso anônimo bloqueado como esperado (...)" ou "select anônimo liberado" → tudo certo.
- "erro: Chave invalida..." → chave errada no `.env.local`.
- "erro: Failed to fetch" (ou similar de rede) → URL errada no `.env.local`.

Mudou o `.env.local` com o dev server rodando? Pare e suba de novo; env de Vite só é lida no boot.

```cmd
git add .
git commit -m "cliente supabase, env e shell minimo com pagina de status"
```

---

## 12. Vitest

### 12.1 src/lib/sanity.test.ts (novo arquivo, placeholder)

Apagar quando o primeiro teste real (vetores de protocolo) entrar.

```ts
import { describe, expect, it } from "vitest"

describe("sanity", () => {
  it("vitest esta rodando", () => {
    expect(1 + 1).toBe(2)
  })
})
```

### 12.2 Scripts no package.json

No bloco `"scripts"`, acrescente:

```json
"test": "vitest run",
"test:watch": "vitest"
```

```cmd
npm run test
```

Checkpoint: 1 passed. Sem arquivo de config por enquanto; testes de função pura (protocolos) rodam em ambiente node default. jsdom entra só se/quando houver teste de componente.

---

## 13. Build local + docs no repo

```cmd
npm run build
```

Checkpoint: `tsc -b && vite build` verdes, pasta `dist` criada. Opcional: `npm run preview` para ver o build servido.

Traga a documentação do projeto para dentro do repo (fonte de verdade versionada):

```cmd
mkdir docs
copy "C:\caminho\para\DECISIONS.md" docs\
copy "C:\caminho\para\ETAPA2.md" docs\
```

Salve este arquivo como `docs\ETAPA3.md` também.

```cmd
git add .
git commit -m "vitest, scripts de teste e docs"
```

---

## 14. GitHub

1. github.com → New repository → nome `bodytrack` → **Private** → sem README, sem .gitignore, sem license (já temos tudo local).
2. No terminal:

```cmd
git remote add origin https://github.com/SEU_USUARIO/bodytrack.git
git branch -M main
git push -u origin main
```

Na primeira vez o Git Credential Manager abre o navegador para autenticar. Checkpoint: arquivos visíveis no GitHub, `.env.local` **ausente** (confirme).

---

## 15. Cloudflare Pages

1. dash.cloudflare.com → Workers & Pages → Create → aba Pages → Connect to Git.
2. Autorize o GitHub e selecione `bodytrack`. Production branch: `main`.
3. Build settings: Framework preset **Vite** (preenche Build command `npm run build` e Output `dist`).
4. Environment variables (em Production; se a UI oferecer, marque para Preview também):
   - `VITE_SUPABASE_URL` = a URL do projeto
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = a publishable key
   - `NODE_VERSION` = `22`
5. Save and Deploy. Primeiro build leva alguns minutos.

Checkpoint: `https://bodytrack-XXX.pages.dev` abre a página de status e o teste de conexão responde como no local.

Notas:
- A env é de **build**: a chave vai embutida no bundle. Isso é o modelo do Supabase — a publishable key é pública por design; a segurança vem do RLS endurecido na Etapa 2.
- Mudou env var depois? Precisa de novo deploy (Deployments → Retry deployment). Pushes no `main` fazem deploy automático daqui em diante.
- SPA fallback: sem `404.html` no build, o Pages serve `index.html` para qualquer rota; o react-router funciona em deep link sem config extra.

---

## 16. Pós-deploy: URLs de Auth no Supabase

Painel do Supabase → Authentication → URL Configuration:
- Site URL: `https://bodytrack-XXX.pages.dev` (a URL real do passo anterior)
- Redirect URLs: adicionar `http://localhost:5173`

Isso garante que os links de e-mail (confirmação de cadastro etc.) apontem para o lugar certo quando a auth entrar na próxima parte. Confirm email já vem ativado por padrão no provider Email; não mexer no resto agora.

---

## 17. Fora do escopo desta parte (deliberado)

- Auth UI, MFA TOTP, bootstrap de organização.
- CRUD, protocolos, postural, PDF, CSV, dashboard.
- PWA/service worker: fica para etapa própria. Motivo técnico: service worker cacheando durante o desenvolvimento gera bugs fantasma; entra quando o app estabilizar.
- GitHub Actions de keep-alive e backup (etapa de operação). Aviso prático até lá: o free tier do Supabase **pausa o projeto após ~7 dias sem requisições**. Se você ficar uma semana sem mexer e tudo "quebrar", é isso; reativar é um clique no painel.

---

## 18. Problemas comuns

| Sintoma | Causa provável | Ação |
|---|---|---|
| Engine warning ou erro no `npm install` do Vite | Node < 20.19 | Atualizar Node (seção 1), reabrir terminal |
| `npx supabase` demora muito na 1ª vez | Baixando o binário do CLI | Normal, esperar |
| `link`/`push` falha em autenticação de banco | Senha errada | Resetar em Settings → Database → Reset database password |
| `push` com timeout de conexão | CLI antigo / rede | `npm update supabase` e repetir |
| `Skipping migration ...` | Padrão de nome | Renomear com timestamp (seção 8) |
| `push` com erro de SQL | Bug na migration | Corrigir o arquivo in-place e repetir; transação por arquivo, nada fica pela metade |
| `must be owner of table objects` no push | Policy de storage criada por role sem permissão | Me trazer o erro exato; resolvemos via painel ou ajuste na migration |
| `database.types.ts` ilegível / tsc reclama de encoding | Comando rodou no PowerShell | Apagar o arquivo e regenerar no CMD |
| Deploy com tela branca e erro de env no console | Env vars não setadas no Pages | Setar e Retry deployment |
| Tailwind sem efeito | `@import` removido do index.css ou plugin ausente no vite.config | Conferir seções 3 e 4.3 |
| "LF will be replaced by CRLF" | core.autocrlf no Windows | Aviso, não erro; ignorar |

---

## 19. Ao concluir: atualizar o DECISIONS.md

Substituir as seções finais por:

```
## Estado atual
Etapa 3.1 entregue: repo privado bodytrack no GitHub; Vite + React + TS com Tailwind v4 e shadcn (botão/card); deps do stack instaladas; projeto Supabase em sa-east-1 com 0001/0002 aplicadas via supabase db push e historico conferido (migration list); types em src/lib/database.types.ts (gerar via CLI no CMD, nunca PowerShell); cliente tipado em src/lib/supabase.ts com env validada; shell minimo (react-router + TanStack Query + pagina de status com smoke test de conexao); vitest com sanity test e scripts; deploy automatico no Cloudflare Pages (URL *.pages.dev) com VITE_* e NODE_VERSION=22; Auth URL Configuration apontando para o pages.dev + localhost. Chave usada: publishable (sb_publishable_), legadas serao descontinuadas ate fim de 2026.

## Próximo passo
Etapa 3, parte 2: a definir no chat. Sugestão natural: fluxo de auth (cadastro, confirmação de e-mail, login, MFA TOTP) + bootstrap de organização, já que todo o resto depende de sessão e org.
```

Acrescente também à seção Operação, se quiser: "Free tier pausa após ~7 dias sem uso; keep-alive pendente até a etapa de operação."
