#!/usr/bin/env node
// BodyTrack - Etapa 3.1: gera/atualiza os arquivos base do esqueleto.
//
// Uso (na raiz do projeto, terminal CMD):
//   node scripts\write-etapa3-files.mjs
//
// Comportamento:
// - Sobrescreve os arquivos base listados em "files" (re-rodar = restaurar a base).
// - NUNCA toca em: supabase/migrations/*.sql, docs/DECISIONS.md, docs/ETAPA2.md, .env.local.
// - supabase/config.toml: criado apenas se nao existir.
// - Sem secrets: chaves vao no .env.local (ver .env.example), nunca aqui.
// - Conteudos JSON-escapados (uma linha por arquivo); a fonte legivel e o proprio
//   projeto depois de rodar o script.
//
// Gerado e validado em 2026-06-11: npm install (350 pacotes), tsc, vite build,
// vitest e eslint verdes em Node 22.

import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

const files = {
  "package.json":
    "{\n  \"name\": \"bodytrack\",\n  \"private\": true,\n  \"version\": \"0.1.0\",\n  \"type\": \"module\",\n  \"scripts\": {\n    \"dev\": \"vite\",\n    \"build\": \"tsc -b && vite build\",\n    \"preview\": \"vite preview\",\n    \"lint\": \"eslint .\",\n    \"test\": \"vitest run\",\n    \"test:watch\": \"vitest\"\n  },\n  \"dependencies\": {\n    \"@hookform/resolvers\": \"^5.0.0\",\n    \"@radix-ui/react-slot\": \"^1.2.0\",\n    \"@react-pdf/renderer\": \"^4.0.0\",\n    \"@supabase/supabase-js\": \"^2.49.0\",\n    \"@tanstack/react-query\": \"^5.66.0\",\n    \"class-variance-authority\": \"^0.7.1\",\n    \"clsx\": \"^2.1.1\",\n    \"lucide-react\": \"^0.475.0\",\n    \"papaparse\": \"^5.5.0\",\n    \"react\": \"^19.1.0\",\n    \"react-dom\": \"^19.1.0\",\n    \"react-hook-form\": \"^7.54.0\",\n    \"react-router\": \"^7.6.0\",\n    \"recharts\": \"^3.0.0\",\n    \"tailwind-merge\": \"^3.0.0\",\n    \"tw-animate-css\": \"^1.0.0\",\n    \"zod\": \"^4.0.0\"\n  },\n  \"devDependencies\": {\n    \"@eslint/js\": \"^9.25.0\",\n    \"@tailwindcss/vite\": \"^4.1.0\",\n    \"@types/node\": \"^22.0.0\",\n    \"@types/papaparse\": \"^5.3.0\",\n    \"@types/react\": \"^19.1.0\",\n    \"@types/react-dom\": \"^19.1.0\",\n    \"@vitejs/plugin-react\": \"^4.6.0\",\n    \"eslint\": \"^9.25.0\",\n    \"eslint-plugin-react-hooks\": \"^5.2.0\",\n    \"eslint-plugin-react-refresh\": \"^0.4.19\",\n    \"globals\": \"^16.0.0\",\n    \"supabase\": \"^2.0.0\",\n    \"tailwindcss\": \"^4.1.0\",\n    \"typescript\": \"^5.8.0\",\n    \"typescript-eslint\": \"^8.30.0\",\n    \"vite\": \"^7.0.0\",\n    \"vitest\": \"^3.2.0\"\n  }\n}\n",
  ".gitignore":
    "# Dependencias e build\nnode_modules\ndist\ndist-ssr\n\n# Logs\nlogs\n*.log\nnpm-debug.log*\n\n# Env: nunca commitar chaves\n*.local\n.env\n\n# Editor / SO\n.DS_Store\n*.suo\n*.sw?\n\n# Testes\ncoverage\n",
  ".env.example":
    "# Copie este arquivo para .env.local e preencha (o .env.local nao e commitado).\n# Valores no painel do Supabase:\n#   VITE_SUPABASE_URL ................ Settings -> API (Project URL)\n#   VITE_SUPABASE_PUBLISHABLE_KEY .... Settings -> API Keys (Publishable key, sb_publishable_...)\nVITE_SUPABASE_URL=\nVITE_SUPABASE_PUBLISHABLE_KEY=\n",
  "index.html":
    "<!doctype html>\n<html lang=\"pt-BR\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <link rel=\"icon\" type=\"image/svg+xml\" href=\"/favicon.svg\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>BodyTrack</title>\n  </head>\n  <body>\n    <div id=\"root\"></div>\n    <script type=\"module\" src=\"/src/main.tsx\"></script>\n  </body>\n</html>\n",
  "vite.config.ts":
    "import path from \"node:path\"\nimport tailwindcss from \"@tailwindcss/vite\"\nimport react from \"@vitejs/plugin-react\"\nimport { defineConfig } from \"vite\"\n\nexport default defineConfig({\n  plugins: [react(), tailwindcss()],\n  resolve: {\n    alias: {\n      \"@\": path.resolve(__dirname, \"./src\"),\n    },\n  },\n})\n",
  "tsconfig.json":
    "{\n  \"files\": [],\n  \"references\": [\n    { \"path\": \"./tsconfig.app.json\" },\n    { \"path\": \"./tsconfig.node.json\" }\n  ],\n  \"compilerOptions\": {\n    \"baseUrl\": \".\",\n    \"paths\": {\n      \"@/*\": [\"./src/*\"]\n    }\n  }\n}\n",
  "tsconfig.app.json":
    "{\n  \"compilerOptions\": {\n    \"tsBuildInfoFile\": \"./node_modules/.tmp/tsconfig.app.tsbuildinfo\",\n    \"target\": \"ES2022\",\n    \"useDefineForClassFields\": true,\n    \"lib\": [\"ES2022\", \"DOM\", \"DOM.Iterable\"],\n    \"module\": \"ESNext\",\n    \"skipLibCheck\": true,\n\n    \"moduleResolution\": \"bundler\",\n    \"allowImportingTsExtensions\": true,\n    \"verbatimModuleSyntax\": true,\n    \"moduleDetection\": \"force\",\n    \"noEmit\": true,\n    \"jsx\": \"react-jsx\",\n\n    \"strict\": true,\n    \"noUnusedLocals\": true,\n    \"noUnusedParameters\": true,\n    \"erasableSyntaxOnly\": true,\n    \"noFallthroughCasesInSwitch\": true,\n    \"noUncheckedSideEffectImports\": true,\n\n    \"baseUrl\": \".\",\n    \"paths\": {\n      \"@/*\": [\"./src/*\"]\n    }\n  },\n  \"include\": [\"src\"]\n}\n",
  "tsconfig.node.json":
    "{\n  \"compilerOptions\": {\n    \"tsBuildInfoFile\": \"./node_modules/.tmp/tsconfig.node.tsbuildinfo\",\n    \"target\": \"ES2023\",\n    \"lib\": [\"ES2023\"],\n    \"module\": \"ESNext\",\n    \"skipLibCheck\": true,\n\n    \"moduleResolution\": \"bundler\",\n    \"allowImportingTsExtensions\": true,\n    \"verbatimModuleSyntax\": true,\n    \"moduleDetection\": \"force\",\n    \"noEmit\": true,\n\n    \"strict\": true,\n    \"noUnusedLocals\": true,\n    \"noUnusedParameters\": true,\n    \"erasableSyntaxOnly\": true,\n    \"noFallthroughCasesInSwitch\": true,\n    \"noUncheckedSideEffectImports\": true\n  },\n  \"include\": [\"vite.config.ts\"]\n}\n",
  "eslint.config.js":
    "import js from \"@eslint/js\"\nimport { defineConfig, globalIgnores } from \"eslint/config\"\nimport reactHooks from \"eslint-plugin-react-hooks\"\nimport reactRefresh from \"eslint-plugin-react-refresh\"\nimport globals from \"globals\"\nimport tseslint from \"typescript-eslint\"\n\nexport default defineConfig([\n  globalIgnores([\"dist\", \"scripts\"]),\n  {\n    files: [\"**/*.{ts,tsx}\"],\n    extends: [\n      js.configs.recommended,\n      tseslint.configs.recommended,\n      reactHooks.configs[\"recommended-latest\"],\n      reactRefresh.configs.vite,\n    ],\n    languageOptions: {\n      ecmaVersion: 2022,\n      globals: globals.browser,\n    },\n  },\n  {\n    // Componentes shadcn exportam variants junto do componente; a regra do\n    // react-refresh nao se aplica a essa pasta.\n    files: [\"src/components/ui/**/*.tsx\"],\n    rules: {\n      \"react-refresh/only-export-components\": \"off\",\n    },\n  },\n])\n",
  "components.json":
    "{\n  \"$schema\": \"https://ui.shadcn.com/schema.json\",\n  \"style\": \"new-york\",\n  \"rsc\": false,\n  \"tsx\": true,\n  \"tailwind\": {\n    \"config\": \"\",\n    \"css\": \"src/index.css\",\n    \"baseColor\": \"neutral\",\n    \"cssVariables\": true,\n    \"prefix\": \"\"\n  },\n  \"aliases\": {\n    \"components\": \"@/components\",\n    \"utils\": \"@/lib/utils\",\n    \"ui\": \"@/components/ui\",\n    \"lib\": \"@/lib\",\n    \"hooks\": \"@/hooks\"\n  },\n  \"iconLibrary\": \"lucide\"\n}\n",
  "public/favicon.svg":
    "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\">\n  <rect width=\"32\" height=\"32\" rx=\"6\" fill=\"#171717\"/>\n  <text x=\"16\" y=\"22\" font-family=\"Arial, Helvetica, sans-serif\" font-size=\"16\" font-weight=\"bold\" fill=\"#fafafa\" text-anchor=\"middle\">B</text>\n</svg>\n",
  "src/main.tsx":
    "import { StrictMode } from \"react\"\nimport { createRoot } from \"react-dom/client\"\nimport { QueryClient, QueryClientProvider } from \"@tanstack/react-query\"\nimport { BrowserRouter } from \"react-router\"\nimport App from \"./App\"\nimport \"./index.css\"\n\nconst queryClient = new QueryClient()\n\ncreateRoot(document.getElementById(\"root\")!).render(\n  <StrictMode>\n    <QueryClientProvider client={queryClient}>\n      <BrowserRouter>\n        <App />\n      </BrowserRouter>\n    </QueryClientProvider>\n  </StrictMode>,\n)\n",
  "src/App.tsx":
    "import { useQuery } from \"@tanstack/react-query\"\nimport { Route, Routes } from \"react-router\"\nimport { Button } from \"@/components/ui/button\"\nimport { Card, CardContent, CardHeader, CardTitle } from \"@/components/ui/card\"\nimport { supabase, supabaseEnvOk } from \"@/lib/supabase\"\n\n// Smoke test provisorio da Etapa 3.1: qualquer resposta HTTP da API prova URL e chave.\n// \"subjects\" vem do schema da Etapa 2; se o gen types acusar outro nome, ajuste aqui.\nasync function checarSupabase(): Promise<string> {\n  const { error } = await supabase.from(\"subjects\").select(\"id\").limit(1)\n  if (!error) return \"API ok; select anonimo liberado (lista vazia esperada)\"\n  const msg = error.message\n  if (/api key|invalid key/i.test(msg)) {\n    throw new Error(\"chave invalida; confira VITE_SUPABASE_PUBLISHABLE_KEY no .env.local\")\n  }\n  if (/failed to fetch|fetch failed|networkerror|load failed/i.test(msg)) {\n    throw new Error(\"rede: URL do Supabase inacessivel; confira VITE_SUPABASE_URL no .env.local\")\n  }\n  // Bloqueio por RLS/grants sem sessao tambem e sucesso: a API respondeu.\n  return \"API ok; acesso anonimo bloqueado como esperado (\" + msg + \")\"\n}\n\nfunction StatusPage() {\n  const { data, error, isFetching, refetch } = useQuery({\n    queryKey: [\"status-supabase\"],\n    queryFn: checarSupabase,\n    enabled: supabaseEnvOk,\n    retry: false,\n  })\n\n  const linhaSupabase = !supabaseEnvOk\n    ? \"aguardando .env.local\"\n    : isFetching\n      ? \"testando...\"\n      : error\n        ? \"erro: \" + error.message\n        : (data ?? \"...\")\n\n  return (\n    <main className=\"mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-4 p-6\">\n      <Card>\n        <CardHeader>\n          <CardTitle>BodyTrack: setup (Etapa 3.1)</CardTitle>\n        </CardHeader>\n        <CardContent className=\"space-y-3 text-sm\">\n          <p>Vite + React + Tailwind + shadcn/ui: ok (esta pagina renderizou).</p>\n          <p>\n            Env:{\" \"}\n            {supabaseEnvOk\n              ? \"ok (VITE_SUPABASE_* carregadas)\"\n              : \"ausente; crie .env.local a partir do .env.example e reinicie o npm run dev\"}\n          </p>\n          <p>Supabase: {linhaSupabase}</p>\n          <Button onClick={() => refetch()} disabled={!supabaseEnvOk || isFetching}>\n            Testar conexao de novo\n          </Button>\n        </CardContent>\n      </Card>\n    </main>\n  )\n}\n\nexport default function App() {\n  return (\n    <Routes>\n      <Route path=\"/\" element={<StatusPage />} />\n    </Routes>\n  )\n}\n",
  "src/index.css":
    "@import \"tailwindcss\";\n@import \"tw-animate-css\";\n\n@custom-variant dark (&:is(.dark *));\n\n:root {\n  --radius: 0.625rem;\n  --background: oklch(1 0 0);\n  --foreground: oklch(0.145 0 0);\n  --card: oklch(1 0 0);\n  --card-foreground: oklch(0.145 0 0);\n  --popover: oklch(1 0 0);\n  --popover-foreground: oklch(0.145 0 0);\n  --primary: oklch(0.205 0 0);\n  --primary-foreground: oklch(0.985 0 0);\n  --secondary: oklch(0.97 0 0);\n  --secondary-foreground: oklch(0.205 0 0);\n  --muted: oklch(0.97 0 0);\n  --muted-foreground: oklch(0.556 0 0);\n  --accent: oklch(0.97 0 0);\n  --accent-foreground: oklch(0.205 0 0);\n  --destructive: oklch(0.577 0.245 27.325);\n  --border: oklch(0.922 0 0);\n  --input: oklch(0.922 0 0);\n  --ring: oklch(0.708 0 0);\n  --chart-1: oklch(0.646 0.222 41.116);\n  --chart-2: oklch(0.6 0.118 184.704);\n  --chart-3: oklch(0.398 0.07 227.392);\n  --chart-4: oklch(0.828 0.189 84.429);\n  --chart-5: oklch(0.769 0.188 70.08);\n  --sidebar: oklch(0.985 0 0);\n  --sidebar-foreground: oklch(0.145 0 0);\n  --sidebar-primary: oklch(0.205 0 0);\n  --sidebar-primary-foreground: oklch(0.985 0 0);\n  --sidebar-accent: oklch(0.97 0 0);\n  --sidebar-accent-foreground: oklch(0.205 0 0);\n  --sidebar-border: oklch(0.922 0 0);\n  --sidebar-ring: oklch(0.708 0 0);\n}\n\n.dark {\n  --background: oklch(0.145 0 0);\n  --foreground: oklch(0.985 0 0);\n  --card: oklch(0.205 0 0);\n  --card-foreground: oklch(0.985 0 0);\n  --popover: oklch(0.205 0 0);\n  --popover-foreground: oklch(0.985 0 0);\n  --primary: oklch(0.922 0 0);\n  --primary-foreground: oklch(0.205 0 0);\n  --secondary: oklch(0.269 0 0);\n  --secondary-foreground: oklch(0.985 0 0);\n  --muted: oklch(0.269 0 0);\n  --muted-foreground: oklch(0.708 0 0);\n  --accent: oklch(0.269 0 0);\n  --accent-foreground: oklch(0.985 0 0);\n  --destructive: oklch(0.704 0.191 22.216);\n  --border: oklch(1 0 0 / 10%);\n  --input: oklch(1 0 0 / 15%);\n  --ring: oklch(0.556 0 0);\n  --chart-1: oklch(0.488 0.243 264.376);\n  --chart-2: oklch(0.696 0.17 162.48);\n  --chart-3: oklch(0.769 0.188 70.08);\n  --chart-4: oklch(0.627 0.265 303.9);\n  --chart-5: oklch(0.645 0.246 16.439);\n  --sidebar: oklch(0.205 0 0);\n  --sidebar-foreground: oklch(0.985 0 0);\n  --sidebar-primary: oklch(0.488 0.243 264.376);\n  --sidebar-primary-foreground: oklch(0.985 0 0);\n  --sidebar-accent: oklch(0.269 0 0);\n  --sidebar-accent-foreground: oklch(0.985 0 0);\n  --sidebar-border: oklch(1 0 0 / 10%);\n  --sidebar-ring: oklch(0.556 0 0);\n}\n\n@theme inline {\n  --radius-sm: calc(var(--radius) - 4px);\n  --radius-md: calc(var(--radius) - 2px);\n  --radius-lg: var(--radius);\n  --radius-xl: calc(var(--radius) + 4px);\n  --color-background: var(--background);\n  --color-foreground: var(--foreground);\n  --color-card: var(--card);\n  --color-card-foreground: var(--card-foreground);\n  --color-popover: var(--popover);\n  --color-popover-foreground: var(--popover-foreground);\n  --color-primary: var(--primary);\n  --color-primary-foreground: var(--primary-foreground);\n  --color-secondary: var(--secondary);\n  --color-secondary-foreground: var(--secondary-foreground);\n  --color-muted: var(--muted);\n  --color-muted-foreground: var(--muted-foreground);\n  --color-accent: var(--accent);\n  --color-accent-foreground: var(--accent-foreground);\n  --color-destructive: var(--destructive);\n  --color-border: var(--border);\n  --color-input: var(--input);\n  --color-ring: var(--ring);\n  --color-chart-1: var(--chart-1);\n  --color-chart-2: var(--chart-2);\n  --color-chart-3: var(--chart-3);\n  --color-chart-4: var(--chart-4);\n  --color-chart-5: var(--chart-5);\n  --color-sidebar: var(--sidebar);\n  --color-sidebar-foreground: var(--sidebar-foreground);\n  --color-sidebar-primary: var(--sidebar-primary);\n  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);\n  --color-sidebar-accent: var(--sidebar-accent);\n  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);\n  --color-sidebar-border: var(--sidebar-border);\n  --color-sidebar-ring: var(--sidebar-ring);\n}\n\n@layer base {\n  * {\n    @apply border-border outline-ring/50;\n  }\n  body {\n    @apply bg-background text-foreground;\n  }\n}\n",
  "src/vite-env.d.ts":
    "/// <reference types=\"vite/client\" />\n\ninterface ImportMetaEnv {\n  readonly VITE_SUPABASE_URL: string\n  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string\n}\n\ninterface ImportMeta {\n  readonly env: ImportMetaEnv\n}\n",
  "src/lib/supabase.ts":
    "import { createClient, type SupabaseClient } from \"@supabase/supabase-js\"\nimport type { Database } from \"./database.types\"\n\nconst url = import.meta.env.VITE_SUPABASE_URL\nconst key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY\n\n// false enquanto o .env.local nao existir; a pagina de status explica o que fazer.\nexport const supabaseEnvOk = Boolean(url && key)\n\n// Client unico da aplicacao. Sem env, qualquer uso lanca erro claro\n// em vez de uma chamada silenciosa para lugar nenhum.\nexport const supabase: SupabaseClient<Database> = supabaseEnvOk\n  ? createClient<Database>(url, key)\n  : (new Proxy(\n      {},\n      {\n        get() {\n          throw new Error(\n            \"Supabase sem configuracao: crie .env.local a partir do .env.example e reinicie o dev server\",\n          )\n        },\n      },\n    ) as SupabaseClient<Database>)\n",
  "src/lib/utils.ts":
    "import { clsx, type ClassValue } from \"clsx\"\nimport { twMerge } from \"tailwind-merge\"\n\nexport function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs))\n}\n",
  "src/lib/database.types.ts":
    "// PLACEHOLDER: substituido pelo comando (terminal CMD, nunca PowerShell):\n//   npx supabase gen types typescript --linked > src\\lib\\database.types.ts\n// Existe so para o projeto compilar antes do schema real ser gerado.\n/* eslint-disable @typescript-eslint/no-explicit-any */\nexport type Json =\n  | string\n  | number\n  | boolean\n  | null\n  | { [key: string]: Json | undefined }\n  | Json[]\n\nexport type Database = any\n",
  "src/lib/sanity.test.ts":
    "// Placeholder ate o primeiro teste real (vetores publicados dos protocolos).\nimport { describe, expect, it } from \"vitest\"\n\ndescribe(\"sanity\", () => {\n  it(\"vitest esta rodando\", () => {\n    expect(1 + 1).toBe(2)\n  })\n})\n",
  "src/components/ui/button.tsx":
    "import * as React from \"react\"\nimport { Slot } from \"@radix-ui/react-slot\"\nimport { cva, type VariantProps } from \"class-variance-authority\"\n\nimport { cn } from \"@/lib/utils\"\n\nconst buttonVariants = cva(\n  \"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive\",\n  {\n    variants: {\n      variant: {\n        default:\n          \"bg-primary text-primary-foreground shadow-xs hover:bg-primary/90\",\n        destructive:\n          \"bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60\",\n        outline:\n          \"border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50\",\n        secondary:\n          \"bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80\",\n        ghost:\n          \"hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50\",\n        link: \"text-primary underline-offset-4 hover:underline\",\n      },\n      size: {\n        default: \"h-9 px-4 py-2 has-[>svg]:px-3\",\n        sm: \"h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5\",\n        lg: \"h-10 rounded-md px-6 has-[>svg]:px-4\",\n        icon: \"size-9\",\n      },\n    },\n    defaultVariants: {\n      variant: \"default\",\n      size: \"default\",\n    },\n  },\n)\n\nfunction Button({\n  className,\n  variant,\n  size,\n  asChild = false,\n  ...props\n}: React.ComponentProps<\"button\"> &\n  VariantProps<typeof buttonVariants> & {\n    asChild?: boolean\n  }) {\n  const Comp = asChild ? Slot : \"button\"\n\n  return (\n    <Comp\n      data-slot=\"button\"\n      className={cn(buttonVariants({ variant, size, className }))}\n      {...props}\n    />\n  )\n}\n\nexport { Button, buttonVariants }\n",
  "src/components/ui/card.tsx":
    "import * as React from \"react\"\n\nimport { cn } from \"@/lib/utils\"\n\nfunction Card({ className, ...props }: React.ComponentProps<\"div\">) {\n  return (\n    <div\n      data-slot=\"card\"\n      className={cn(\n        \"bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm\",\n        className,\n      )}\n      {...props}\n    />\n  )\n}\n\nfunction CardHeader({ className, ...props }: React.ComponentProps<\"div\">) {\n  return (\n    <div\n      data-slot=\"card-header\"\n      className={cn(\n        \"@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6\",\n        className,\n      )}\n      {...props}\n    />\n  )\n}\n\nfunction CardTitle({ className, ...props }: React.ComponentProps<\"div\">) {\n  return (\n    <div\n      data-slot=\"card-title\"\n      className={cn(\"leading-none font-semibold\", className)}\n      {...props}\n    />\n  )\n}\n\nfunction CardDescription({ className, ...props }: React.ComponentProps<\"div\">) {\n  return (\n    <div\n      data-slot=\"card-description\"\n      className={cn(\"text-muted-foreground text-sm\", className)}\n      {...props}\n    />\n  )\n}\n\nfunction CardAction({ className, ...props }: React.ComponentProps<\"div\">) {\n  return (\n    <div\n      data-slot=\"card-action\"\n      className={cn(\n        \"col-start-2 row-span-2 row-start-1 self-start justify-self-end\",\n        className,\n      )}\n      {...props}\n    />\n  )\n}\n\nfunction CardContent({ className, ...props }: React.ComponentProps<\"div\">) {\n  return (\n    <div\n      data-slot=\"card-content\"\n      className={cn(\"px-6\", className)}\n      {...props}\n    />\n  )\n}\n\nfunction CardFooter({ className, ...props }: React.ComponentProps<\"div\">) {\n  return (\n    <div\n      data-slot=\"card-footer\"\n      className={cn(\"flex items-center px-6 [.border-t]:pt-6\", className)}\n      {...props}\n    />\n  )\n}\n\nexport {\n  Card,\n  CardHeader,\n  CardFooter,\n  CardTitle,\n  CardAction,\n  CardDescription,\n  CardContent,\n}\n",
  "supabase/.gitignore":
    ".branches\n.temp\n",
  "docs/ETAPA3.md":
    "# BodyTrack - Etapa 3.1 (file-first)\n\nArquivos base gerados por `scripts/write-etapa3-files.mjs`. Re-rodar o script restaura/atualiza os arquivos base. Ele NUNCA toca em: `supabase/migrations/*.sql`, `docs/DECISIONS.md`, `docs/ETAPA2.md`, `.env.local`. O `supabase/config.toml` so e criado se nao existir.\n\n## Sequencia minima (terminal integrado do VSCode, perfil Command Prompt)\n\n1. `node scripts\\write-etapa3-files.mjs`\n2. `npm install`\n3. Manual: copiar `0001_schema.sql` e `0002_rls.sql` para `supabase\\migrations\\`; copiar `DECISIONS.md` e `ETAPA2.md` para `docs\\` (pode ser pelo Explorer do Windows ou pelo VSCode).\n4. Manual: criar projeto no Supabase (regiao South America - Sao Paulo; salvar a database password no gerenciador de senhas). Copiar: Project URL (Settings -> API), Publishable key (Settings -> API Keys; se so houver o botao \"Create new API keys\", clique nele) e Reference ID (Settings -> General).\n5. Manual: criar `.env.local` na raiz copiando o `.env.example` e preenchendo.\n6. `npm run dev` -> checkpoint A\n7. `npx supabase login`\n8. `npx supabase link --project-ref SEU_REF` (pede a database password)\n9. `npx supabase db push` -> confirmar com Y\n10. `npx supabase gen types typescript --linked > src\\lib\\database.types.ts`\n    Terminal CMD obrigatorio neste comando: o `>` do PowerShell grava UTF-16 e quebra o arquivo.\n11. `npm run test` e `npm run build`\n12. `git init`, `git add .`, `git commit -m \"etapa 3.1: esqueleto\"`, criar repo privado `bodytrack` no GitHub (sem README), `git remote add origin ...`, `git branch -M main`, `git push -u origin main`\n13. Manual: Cloudflare Pages -> Workers & Pages -> Create -> Pages -> Connect to Git -> repo `bodytrack`. Preset: Vite (build `npm run build`, output `dist`). Env vars de producao: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `NODE_VERSION=22`. Save and Deploy.\n14. Manual: Supabase -> Authentication -> URL Configuration: Site URL = `https://SEU-PROJETO.pages.dev`; adicionar `http://localhost:5173` em Redirect URLs.\n\n## Checkpoints\n\n- A. `npm run dev` sem `.env.local`: a pagina abre e acusa env ausente. Com `.env.local` + restart do dev server: \"API ok; acesso anonimo bloqueado como esperado (...)\" ou \"select anonimo liberado (lista vazia)\". \"chave invalida\" = key errada; \"rede: URL ... inacessivel\" = URL errada.\n- B. `db push` aplica 0001 e 0002. Cada arquivo roda em transacao: se falhar, nada fica pela metade; corrija o SQL in-place (pre-deploy permite) e repita. Conferir com `npx supabase migration list` e no Table Editor do painel.\n- C. Depois do gen types: `database.types.ts` legivel, contendo `export type Database`, e `npm run dev` segue ok. Se o TypeScript reclamar de `subjects` no `App.tsx`, troque pelo nome real de alguma tabela do schema public.\n- D. `npm run test` = 1 passed; `npm run build` verde.\n- E. A URL `*.pages.dev` mostra a mesma pagina com conexao ok. Mudou env var no Pages = Retry deployment (env e de build).\n\n## Notas\n\n- `src/lib/database.types.ts` e placeholder; o passo 10 o substitui. A chave publishable e publica por design (vai no bundle); a seguranca vem do RLS da Etapa 2.\n- Se `link`/`push` reclamarem de configuracao, rode `npx supabase init` (o config.toml gerado e preservado pelo script).\n- Se o push pular migration com \"file name must match pattern\", renomeie com prefixo timestamp preservando a ordem: `20260611000001_schema.sql`, `20260611000002_rls.sql` (e registre a mudanca de convencao no DECISIONS).\n- Free tier do Supabase pausa o projeto apos ~7 dias sem requisicoes; reativar e um clique no painel. Action de keep-alive entra na etapa de operacao.\n- Bucket de fotos: conferir o `bucket_id` usado nas policies do 0002 e criar no painel (Private, MIME image/webp e image/jpeg, limite ~5 MB) quando a feature postural chegar. Pode criar agora, opcional.\n- Fora do escopo da 3.1: auth UI, MFA, CRUD, protocolos, postural, PDF, CSV, dashboard, PWA/service worker, Actions de keep-alive/backup.\n\n## Ao concluir, atualizar docs/DECISIONS.md\n\nEstado atual: Etapa 3.1 entregue (esqueleto file-first: Vite + React + TS, Tailwind v4, shadcn button/card, react-router, TanStack Query, cliente Supabase tipado com guarda de env, vitest, eslint; migrations 0001/0002 aplicadas via db push; types gerados; deploy automatico no Cloudflare Pages com NODE_VERSION=22; Auth URLs configuradas; chave publishable em uso, legadas saem ate o fim de 2026).\nProximo passo: Etapa 3, parte 2: a definir no chat. Sugestao natural: fluxo de auth (cadastro, confirmacao de e-mail, login, MFA TOTP) + bootstrap de organizacao, ja que todo o resto depende de sessao e org.\n",
}

const filesIfMissing = {
  "supabase/config.toml":
    "# Config minima para o fluxo remoto do CLI (link, db push, gen types).\n# Se algum comando pedir mais configuracao, rode: npx supabase init\n# (o script write-etapa3-files.mjs nao sobrescreve este arquivo).\nproject_id = \"bodytrack\"\n",
}

const root = process.cwd()
console.log("Raiz do projeto: " + root + "\n")

let criados = 0
let atualizados = 0
let iguais = 0

async function gravar(rel, conteudo, soSeFaltar) {
  const abs = join(root, rel)
  await mkdir(dirname(abs), { recursive: true })
  let anterior = null
  try {
    anterior = await readFile(abs, "utf8")
  } catch {
    // arquivo ainda nao existe
  }
  if (anterior !== null && soSeFaltar) {
    console.log("=  " + rel + " (existente, mantido)")
    iguais++
    return
  }
  if (anterior === conteudo) {
    console.log("=  " + rel)
    iguais++
    return
  }
  await writeFile(abs, conteudo, "utf8")
  if (anterior === null) {
    console.log("+  " + rel)
    criados++
  } else {
    console.log("~  " + rel)
    atualizados++
  }
}

for (const [rel, conteudo] of Object.entries(files)) {
  await gravar(rel, conteudo, false)
}
for (const [rel, conteudo] of Object.entries(filesIfMissing)) {
  await gravar(rel, conteudo, true)
}

await mkdir(join(root, "supabase", "migrations"), { recursive: true })

console.log(
  "\n" + criados + " criado(s), " + atualizados + " atualizado(s), " + iguais + " sem mudanca.",
)

const manuais = [
  "supabase/migrations/0001_schema.sql",
  "supabase/migrations/0002_rls.sql",
  "docs/DECISIONS.md",
  "docs/ETAPA2.md",
  ".env.local",
]
let faltando = false
for (const rel of manuais) {
  try {
    await access(join(root, rel))
  } catch {
    console.log("FALTA (manual): " + rel)
    faltando = true
  }
}
if (!faltando) {
  console.log("Arquivos manuais todos presentes.")
}
