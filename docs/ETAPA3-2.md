# BodyTrack — Etapa 3.2: autenticação, sessão e onboarding

Salvar como `docs/ETAPA3_2.md`.

## Contexto

A Etapa 3.1 foi concluída. O projeto já deve estar rodando localmente e no Cloudflare Pages, com:

- Vite + React + TypeScript;
- Tailwind + shadcn/ui;
- Supabase linkado;
- migrations `0001_schema.sql` e `0002_rls.sql` aplicadas;
- `database.types.ts` gerado;
- GitHub conectado ao Cloudflare Pages;
- página de status funcionando.

Esta etapa implementa a primeira parte real do sistema: autenticação, sessão, rotas protegidas, onboarding de organização e dashboard placeholder.

## Fonte de verdade

Use o `docs/DECISIONS.md` como fonte de verdade do projeto.

Não contradizer decisões já fechadas sem justificar claramente.

## Estilo de entrega obrigatório

A resposta deve ser **file-first**, não tutorial genérico.

Explique como se o desenvolvedor fosse totalmente leigo em setup/devops e estivesse trabalhando no VSCode.

Sempre separar claramente:

1. O que está sendo criado/alterado.
2. Quais arquivos precisam ser criados.
3. Quais arquivos precisam ser substituídos.
4. Qual conteúdo exato colocar em cada arquivo.
5. Quais comandos precisam ser rodados.
6. Onde rodar os comandos.
7. Qual resultado esperado.
8. O que fazer se der erro.

Ambiente:

- Windows;
- VSCode;
- terminal integrado do VSCode;
- perfil do terminal: Command Prompt/CMD;
- evitar PowerShell;
- quando um comando precisar obrigatoriamente ser CMD, avisar com destaque.

Não presumir conhecimento prévio sobre Supabase, env vars, rotas, redirects, migrations, hooks, contextos, layouts ou deploy.

## Importante sobre tamanho

Mesmo que a etapa fique grande, **não dividir em 3.2a e 3.2b**.

Entregar a **Etapa 3.2 completa** em uma única resposta.

Pode ser longa, desde que esteja organizada e executável.

## Fora do escopo desta etapa

Não implementar ainda:

- CRUD real de avaliados;
- avaliação física;
- protocolos antropométricos;
- avaliação postural;
- upload de fotos;
- PDF;
- CSV;
- resumo para IA;
- dashboard real com dados;
- UI de equipe/convites;
- pagamento;
- PWA/service worker;
- Cloudflare Workers;
- backend próprio.

Não mexer nas migrations `0001_schema.sql` e `0002_rls.sql` sem necessidade real.

Não usar `service_role` no frontend em hipótese nenhuma.

---

# Escopo obrigatório da Etapa 3.2

## 1. Autenticação Supabase

Implementar telas/fluxos para:

- cadastro;
- login;
- logout;
- recuperação de senha, se for simples e segura;
- mensagem clara para confirmação de e-mail;
- tratamento de erros em pt-BR.

A UI deve ser simples, limpa, profissional, responsiva e coerente com o BodyTrack.

## 2. Sessão

Criar estrutura para lidar com sessão do Supabase:

- contexto ou provider de auth;
- hook tipo `useAuth`;
- loading state enquanto verifica sessão;
- escutar mudanças de autenticação com Supabase;
- armazenar usuário atual;
- logout limpando estado;
- evitar flicker/redirecionamento errado durante carregamento.

## 3. Organizações

O app usa organização/workspace como base.

Implementar:

- carregar organização/membership do usuário logado;
- detectar se o usuário logado ainda não tem organização;
- se não tiver organização, mandar para onboarding;
- se tiver organização, mandar para dashboard;
- usar a RPC `create_organization` para criar organização;
- não criar organização com insert direto no frontend, salvo se houver justificativa de que a RPC não existe ou tem outro nome no schema.

## 4. Onboarding de organização

Criar tela de onboarding para o primeiro acesso após login.

Campos:

- nome da organização/profissional;
- termo exibido para avaliados:
  - aluno;
  - cliente;
  - paciente;
  - atleta;
  - avaliado.

Ao enviar:

- chamar a RPC `create_organization`;
- exibir loading;
- tratar erros;
- redirecionar para dashboard se der certo.

## 5. Rotas

Implementar rotas públicas e protegidas.

Rotas públicas:

- `/login`
- `/cadastro`
- `/recuperar-senha`

Rotas protegidas:

- `/`
- `/dashboard`
- `/avaliados`
- `/configuracoes`
- `/onboarding`

Comportamento esperado:

- usuário deslogado tentando rota protegida vai para `/login`;
- usuário logado tentando `/login` ou `/cadastro` vai para dashboard ou onboarding;
- usuário logado sem organização vai para `/onboarding`;
- usuário logado com organização vai para `/dashboard`;
- `/` pode redirecionar automaticamente conforme estado.

## 6. Dashboard placeholder

Substituir a página de status atual por dashboard placeholder autenticado.

Deve mostrar:

- nome/e-mail do usuário;
- organização atual;
- papel do usuário na organização, se disponível;
- botão de logout;
- links/cards placeholder para:
  - Avaliados;
  - Nova avaliação;
  - Postural;
  - Relatórios;
  - Configurações.

Ainda não precisa puxar dados reais de avaliações.

## 7. App shell

Criar layout mínimo para área autenticada:

- header/topbar;
- navegação;
- responsivo;
- visual limpo;
- nada exagerado;
- bom no celular e no desktop.

Pode usar shadcn/ui já instalado.

## 8. Páginas placeholder

Criar páginas placeholder para:

- Avaliados;
- Configurações.

Elas só precisam mostrar título, texto curto e navegação funcionando.

## 9. MFA TOTP

Avaliar se vale implementar MFA TOTP já nesta etapa.

Preferência:

- se for simples e seguro, implementar uma tela básica em Configurações da conta;
- se for bagunçar muito a etapa, deixar preparado para 3.3 e explicar exatamente por quê.

Se implementar, explicar o fluxo com muito cuidado.

## 10. Tipagem

Usar `database.types.ts` gerado pelo Supabase.

Evitar `any` quando possível.

Se precisar criar tipos derivados para organização/membership, colocar em arquivo adequado.

## 11. Testes

Adicionar pelo menos testes simples onde fizer sentido, por exemplo:

- helpers de rota;
- normalização de erro;
- algo que rode no Vitest sem depender de navegador real.

Não precisa testar componente visual complexo agora.

---

# Entregáveis obrigatórios

A resposta da Etapa 3.2 deve conter:

1. Árvore de arquivos criados/alterados.
2. Conteúdo completo dos arquivos novos.
3. Conteúdo completo dos arquivos que devem ser substituídos.
4. Diffs claros quando for alteração pequena.
5. Comandos mínimos para rodar.
6. Checklist de teste manual.
7. Lista de problemas comuns e como resolver.

## Formato preferido

Começar com um resumo curto:

- “Nesta etapa você vai criar X arquivos e substituir Y arquivos.”
- “Rode os comandos no terminal integrado do VSCode usando Command Prompt.”
- “Não use PowerShell.”

Depois entregar os arquivos.

Depois os comandos.

Depois os testes manuais.

## Comandos

Se precisar instalar dependências novas, listar antes dos arquivos.

Se não precisar, dizer claramente:

> Não precisa instalar dependências novas.

Depois dos arquivos, listar comandos como:

```cmd
npm run dev
npm run test
npm run build
git add .
git commit -m "etapa 3.2: auth e onboarding"
git push
```

Explicar onde rodar cada comando.

---

# Checklist manual esperado

Ao final da Etapa 3.2, deve ser possível testar:

1. Abrir o app local.
2. Ir para `/login` quando deslogado.
3. Criar conta em `/cadastro`.
4. Ver mensagem pedindo confirmação de e-mail.
5. Confirmar e-mail pelo link.
6. Fazer login.
7. Ser redirecionado para `/onboarding` se não tiver organização.
8. Criar organização via RPC `create_organization`.
9. Ser redirecionado para `/dashboard`.
10. Ver e-mail do usuário e dados da organização no dashboard.
11. Navegar para `/avaliados` e `/configuracoes`.
12. Fazer logout.
13. Tentar acessar `/dashboard` deslogado e voltar para `/login`.
14. Rodar `npm run test`.
15. Rodar `npm run build`.

---

# Atenção

Se algum detalhe do schema/RPC estiver incerto, não inventar.

Explicar como verificar no `database.types.ts` ou no painel do Supabase, e escrever o código de forma fácil de ajustar.

Não avançar para features de avaliação física ainda.

---

# Mensagem pronta para enviar ao Claude

```text
Concluí a Etapa 3.1 do BodyTrack. O projeto já está rodando localmente e no Cloudflare Pages, com Supabase linkado, migrations aplicadas, types gerados, GitHub conectado e página de status funcionando.

Agora quero a Etapa 3.2 completa, conforme o arquivo docs/ETAPA3_2.md.

Use o DECISIONS.md como fonte de verdade.

Não divida em 3.2a/3.2b.

Entregue no formato file-first, com arquivos completos, comandos mínimos, checkpoints e explicação para leigo usando VSCode + terminal integrado Command Prompt/CMD.
```
