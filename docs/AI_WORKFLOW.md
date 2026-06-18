# BodyTrack — Guia de Trabalho com IA
## 1. Objetivo deste documento

Este arquivo define como a IA deve trabalhar no projeto BodyTrack.

A prioridade é:

1. gerar arquivos prontos para uso;
2. reduzir desperdício de tokens;
3. manter segurança, LGPD e arquitetura coerente;
4. evitar retrabalho;
5. preservar continuidade entre etapas;
6. explicar comandos como se o usuário fosse leigo em setup/devops;
7. entregar cada etapa de forma testável.

A IA deve tratar este documento como regra operacional do projeto.

---

## 2. Fonte de verdade

Antes de propor qualquer coisa, a IA deve considerar, nesta ordem:

1. `docs/DECISIONS.md`;
2. documento da etapa atual, por exemplo `docs/ETAPA3_2.md`;
3. migrations existentes em `supabase/migrations/`;
4. código já existente no repositório;
5. este `docs/AI_WORKFLOW.md`.

Se houver conflito entre documentos:

- `DECISIONS.md` vence para arquitetura/produto;
- migrations aplicadas vencem para schema real;
- o código existente vence para paths, nomes e estrutura já implementada;
- este arquivo vence para formato de entrega.

A IA não deve reinventar stack, nomes, fluxo ou arquitetura sem justificar claramente.

---

## 3. Ambiente do usuário

Assumir sempre:

- Windows;
- VSCode;
- terminal integrado do VSCode;
- perfil do terminal: Command Prompt/CMD;
- evitar PowerShell;
- usuário prefere copiar arquivos, rodar poucos comandos e testar;
- usuário não quer tutorial genérico longo;
- usuário quer explicações práticas, diretas e operacionais.

Quando um comando precisar obrigatoriamente ser CMD, avisar com destaque.

Exemplo:

```cmd
npx supabase gen types typescript --linked > src\lib\database.types.ts
```

Observação: esse comando deve rodar no CMD, pois o `>` do PowerShell pode gerar arquivo UTF-16 e quebrar o TypeScript.

---

## 4. Estilo obrigatório de resposta

A IA deve usar formato **file-first** sempre que estiver implementando algo.

Evitar:

- explicação longa antes dos arquivos;
- teoria desnecessária;
- “aqui está uma ideia” quando o usuário pediu implementação;
- código parcial sem dizer onde colocar;
- mudanças espalhadas sem árvore de arquivos;
- criar múltiplas opções quando uma decisão já foi tomada.

Preferir:

1. resumo curto;
2. árvore de arquivos criados/alterados;
3. arquivos completos;
4. comandos mínimos;
5. checklist de teste;
6. problemas comuns;
7. atualização sugerida do `DECISIONS.md`;
8. documento da próxima etapa, quando fizer sentido.

---

## 5. Formato padrão para cada entrega de etapa

Toda etapa de implementação deve começar assim:

```md
# Etapa X.Y — Nome da etapa

Nesta etapa você vai:
- criar N arquivos;
- substituir M arquivos;
- rodar X comandos;
- testar Y fluxos.

Rode os comandos no terminal integrado do VSCode usando Command Prompt/CMD.
Não use PowerShell quando houver redirecionamento com `>`.
```

Depois seguir esta ordem:

## 5.1 Arquivos criados/alterados

Exemplo:

```txt
Criar:
- src/features/auth/AuthProvider.tsx
- src/features/auth/useAuth.ts
- src/pages/LoginPage.tsx

Substituir:
- src/App.tsx
- src/main.tsx
```

## 5.2 Dependências novas

Se houver:

```cmd
npm install nome-do-pacote
```

Se não houver:

```txt
Não precisa instalar dependências novas nesta etapa.
```

## 5.3 Arquivos completos

Para cada arquivo novo, entregar conteúdo completo.

Exemplo:

```tsx
// src/features/auth/AuthProvider.tsx
...
```

Para arquivos existentes:

- se a mudança for grande, entregar arquivo completo;
- se a mudança for pequena, entregar diff claro;
- nunca dizer apenas “adicione isso em algum lugar” sem especificar exatamente onde.

## 5.4 Comandos mínimos

Ao final dos arquivos, listar apenas comandos necessários.

Exemplo:

```cmd
npm run dev
npm run test
npm run build
git add .
git commit -m "etapa 3.2: auth e onboarding"
git push
```
Nunca adicionar nada ao github, sempre passar os comandos para que eu mesmo faça manualmente

## 5.5 Checklist de teste manual

Toda etapa deve terminar com testes manuais claros.

Exemplo:

```txt
[ ] Abrir http://localhost:5173
[ ] Deslogado deve cair em /login
[ ] Cadastro deve mostrar mensagem de confirmação de e-mail
[ ] Login deve redirecionar para /onboarding se não houver org
[ ] Criar organização deve chamar create_organization
[ ] Dashboard deve mostrar usuário e organização
[ ] npm run test passa
[ ] npm run build passa
```

## 5.6 Problemas comuns

Listar erros prováveis e solução direta.

Exemplo:

```txt
Erro: Missing VITE_SUPABASE_URL
Causa: .env.local ausente ou dev server não reiniciado.
Solução: criar .env.local e rodar npm run dev de novo.
```

---

## 6. Economia de tokens

A IA deve economizar tokens sem sacrificar segurança ou clareza.

Regras:

1. Não repetir contexto que já está em `DECISIONS.md`.
2. Não explicar conceitos básicos se o usuário só precisa executar.
3. Não gerar alternativas longas quando a arquitetura já está decidida.
4. Não listar bibliotecas já decididas, salvo quando forem usadas naquela etapa.
5. Não reescrever arquivos que não mudaram.
6. Não incluir comentários excessivos no código.
7. Não gerar “documentação bonita” no lugar de arquivos executáveis.
8. Não usar texto motivacional.
9. Não pedir confirmação a cada microdecisão se a etapa já está definida.
10. Quando houver incerteza real, perguntar ou propor a menor decisão segura.

Ao mesmo tempo, nunca economizar tokens em:

- segurança;
- RLS;
- LGPD;
- fluxo de consentimento;
- manipulação de dados sensíveis;
- comandos que podem apagar dados;
- migrations;
- autenticação;
- storage privado;
- env vars;
- deploy.

---

## 7. Segurança obrigatória

A IA nunca deve:

- usar `service_role` no frontend;
- colocar secrets em arquivo commitado;
- sugerir desabilitar RLS para “facilitar”;
- confiar só no frontend para autorização;
- criar acesso público a fotos;
- salvar fotos sensíveis em bucket público;
- ignorar consentimento;
- gerar SQL sem considerar RLS;
- permitir path arbitrário de storage;
- expor dados de outra organização;
- usar `any` sem necessidade;
- usar `dangerouslySetInnerHTML` sem sanitização e justificativa;
- criar migrations destrutivas sem aviso claro.

A IA sempre deve:

- manter RLS como camada de segurança;
- tratar fotos e avaliações como dados sensíveis;
- usar buckets privados;
- usar URL assinada para arquivos privados;
- validar org/membership;
- respeitar `create_organization`;
- usar a publishable key no frontend, nunca secret/service key;
- documentar comandos de Supabase com cuidado.

---

## 8. LGPD

O BodyTrack trata dados corporais, medidas, fotos posturais e histórico de evolução.

A IA deve considerar por padrão:

- dados como sensíveis ou altamente sensíveis;
- consentimento como requisito operacional;
- revogação como bloqueio de nova coleta;
- exclusão definitiva como fluxo separado;
- exportação de dados como direito do titular;
- mínimo necessário como princípio;
- logs sem payload sensível;
- profissional/academia como controlador;
- BodyTrack como operador.

Quando implementar features ligadas a dados pessoais, sempre perguntar:

1. há consentimento ativo?
2. quem pode ver?
3. quem pode alterar?
4. isso aparece no PDF/CSV/exportação?
5. isso vai para storage?
6. como apaga definitivamente?
7. como audita?

---

## 9. Migrations e banco

Regras:

1. Antes do primeiro deploy real, migrations podem ser revisadas in-place.
2. Depois que houver dados reais, não editar migration antiga; criar nova migration.
3. Toda mudança em schema deve vir com:
   - migration;
   - impacto em `database.types.ts`;
   - comandos para aplicar;
   - teste manual ou SQL.
4. Não criar tabela nova se uma estrutura existente resolve.
5. Não usar fórmula antropométrica como string no banco.
6. Protocolos ficam em TypeScript testado, conforme `DECISIONS.md`.

Comando de types:

```cmd
npx supabase gen types typescript --linked > src\lib\database.types.ts
```

Rodar no CMD, não PowerShell.

---

## 10. Storage e fotos

Regras:

1. Fotos são privadas.
2. Paths são canônicos.
3. Cliente não inventa path.
4. Upload deve seguir o fluxo definido no `DECISIONS.md`.
5. Acesso a foto deve respeitar visibilidade por organização e avaliador.
6. Thumbnails devem ser usados em listas/grades.
7. Foto original comprimida deve manter qualidade útil para relatório.
8. EXIF/GPS deve ser removido no processo de compressão.
9. Migração futura para R2 deve passar por `src/lib/storage.ts`.

---

## 11. Protocolos antropométricos

Protocolos só entram se tiverem:

- fonte confiável;
- fórmula conferida;
- público-alvo;
- sexo aplicável;
- faixa etária;
- campos exigidos;
- testes com vetor conhecido/publicado ou cálculo verificável.

A IA não deve inventar fórmula, constante ou protocolo.

Se não conseguir confirmar, deve marcar como pendente e não incluir na UI.

---

## 12. Etapas do projeto

A IA deve trabalhar por etapas, sem pular marcos.

## Etapa 1 — Produto e arquitetura

Objetivo:
- definir escopo;
- stack;
- arquitetura;
- riscos;
- segurança;
- custo.

Status:
- concluída.

## Etapa 2 — Schema, RLS e hardening

Objetivo:
- migrations;
- RLS;
- consentimento;
- storage;
- triggers;
- integridade;
- auditoria.

Status:
- concluída na Etapa 2.1.

## Etapa 3.1 — Setup do projeto

Objetivo:
- Vite + React + TS;
- Tailwind/shadcn;
- Supabase linkado;
- migrations aplicadas;
- types gerados;
- página de status;
- GitHub;
- Cloudflare Pages.

Status:
- concluída ou em conclusão.

## Etapa 3.2 — Auth e onboarding

Objetivo:
- cadastro;
- login;
- logout;
- sessão;
- rotas protegidas;
- onboarding de organização;
- dashboard placeholder;
- shell mínimo.

Status:
- próxima etapa natural após 3.1.

## Etapa 3.3 — Base autenticada e configurações

Possível objetivo:
- configurações de conta;
- MFA TOTP, se não entrar em 3.2;
- configurações da organização;
- logo;
- termo exibido;
- melhorias de shell.

## Etapa 3.4 — Avaliados e consentimento

Objetivo:
- CRUD de avaliados;
- responsável legal;
- consentimento eletrônico;
- revogação;
- bloqueios de fluxo;
- perfil do avaliado.

## Etapa 3.5 — Engine de protocolos

Objetivo:
- registry de protocolos;
- fórmulas;
- testes;
- validação;
- resultados calculados.

## Etapa 3.6 — Avaliação física

Objetivo:
- wizard;
- peso/altura;
- circunferências;
- dobras;
- snapshot de resultados;
- comparação.

## Etapa 3.7 — Gráficos e dashboard real

Objetivo:
- cards;
- gráficos;
- evolução;
- comparação entre avaliações.

## Etapa 3.8 — Exportações

Objetivo:
- PDF;
- CSV;
- resumo para IA;
- logs de exportação.

## Etapa 3.9 — Postural V1

Objetivo:
- captura/upload;
- compressão;
- categorias;
- thumbnails;
- comparação lado a lado/grade/overlay.
- sem IA.
- anotações manuais completas podem ficar para v1.1, conforme decisão atual.

## Etapa 3.10 — Operação e beta

Objetivo:
- backup;
- keep-alive;
- checklist de RLS;
- teste com avaliadora;
- ajustes de UX;
- preparação de beta.

A ordem pode mudar se houver motivo forte, mas a IA deve avisar.

---

## 13. Regra de continuidade entre etapas

Ao concluir uma etapa, a IA deve sempre entregar ou sugerir:

1. atualização do `docs/DECISIONS.md`;
2. atualização do status da etapa;
3. commit sugerido;
4. próximo passo recomendado;
5. documento da próxima etapa, quando fizer sentido.

Exemplo:

```md
## Estado atual
Etapa 3.2 concluída: auth, sessão, rotas protegidas, onboarding e dashboard placeholder funcionando.

## Próximo passo
Etapa 3.3: configurações de conta/organização e MFA TOTP.
```

Se a próxima etapa for grande, a IA deve gerar um arquivo novo em `docs/`.

Exemplo:

```txt
docs/ETAPA3_3.md
```

Esse arquivo deve conter:

- objetivo;
- escopo;
- fora de escopo;
- entregáveis;
- checklist;
- prompt pronto para pedir a implementação.

---

## 14. Prompt padrão para nova etapa

Quando o usuário pedir a próxima etapa, usar este modelo:

```md
Use `docs/DECISIONS.md`, `docs/AI_WORKFLOW.md` e o estado atual do projeto como fonte de verdade.

Quero a Etapa X.Y: [nome].

Entregue em formato file-first:
1. árvore de arquivos criados/alterados;
2. arquivos completos;
3. comandos mínimos;
4. checklist de teste;
5. erros comuns;
6. atualização sugerida do DECISIONS.md;
7. documento da próxima etapa, se fizer sentido.

Ambiente:
- Windows;
- VSCode;
- terminal integrado;
- Command Prompt/CMD;
- evitar PowerShell.

Não avance além do escopo desta etapa.
Não use service_role no frontend.
Não desative RLS.
Não implemente features fora de escopo.
```

---

## 15. Quando pedir perguntas ao usuário

Evitar perguntas quando:

- a decisão já está no `DECISIONS.md`;
- existe opção segura e óbvia;
- a pergunta atrasaria uma etapa simples;
- o usuário já respondeu antes.

Perguntar quando:

- há risco de perda de dados;
- há decisão de produto com impacto grande;
- a implementação depende de chave/URL que só o usuário tem;
- há conflito entre documentos;
- há ambiguidade de schema real.

Perguntas devem ser poucas e objetivas.

---

## 16. Como lidar com erros

Quando o usuário colar erro, a IA deve responder assim:

1. identificar o erro provável;
2. pedir, se necessário, só o mínimo faltante;
3. dar comandos exatos para diagnosticar;
4. dar correção exata;
5. explicar como confirmar que resolveu.

Não pedir arquivo inteiro se o erro é localizado.

Formato preferido:

```txt
Comando que deu erro:
...

Causa provável:
...

Faça:
...

Resultado esperado:
...
```

---

## 17. Commits

Commits devem ser curtos, em pt-BR, sem emoji.

Exemplos:

```cmd
git commit -m "etapa 3.2: auth e onboarding"
git commit -m "corrige redirect de login"
git commit -m "adiciona fluxo de consentimento"
```

Antes de commitar:

```cmd
npm run test
npm run build
```

Se build/test falhar, não commitar como etapa concluída.

---

## 18. Regra de finalização de etapa

Uma etapa só é considerada concluída se:

1. `npm run test` passa;
2. `npm run build` passa;
3. fluxo manual principal funciona;
4. não há uso de secret indevido;
5. `git status` está limpo ou mudanças foram commitadas;
6. `DECISIONS.md` foi atualizado quando necessário;
7. próximo passo está claro.

---

## 19. Mensagem curta para colar em chats novos

Use esta mensagem junto com `DECISIONS.md`:

```md
Use `docs/DECISIONS.md` e `docs/AI_WORKFLOW.md` como fonte de verdade do BodyTrack. Responda em formato file-first, com economia de tokens, mas sem sacrificar segurança, LGPD, RLS, storage privado ou clareza operacional. Estou no Windows, VSCode, terminal integrado com Command Prompt/CMD. Gere arquivos completos quando possível, comandos mínimos, checklist de teste e atualização sugerida do DECISIONS.md. Não avance além da etapa pedida.
```

---

## 20. Regra final

O BodyTrack deve evoluir como produto sério.

A IA deve preferir:

- segurança a velocidade;
- simplicidade a arquitetura bonita demais;
- código testável a código mágico;
- arquivos claros a explicações longas;
- etapas pequenas a entregas caóticas;
- decisões registradas a memória solta de chat.

Se algo parecer inseguro, caro, frágil ou desnecessariamente complexo, a IA deve dizer isso claramente.
