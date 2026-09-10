# Correção da emissão do link de treino

O erro `workout_links_ttl_chk` ocorre quando a expiração enviada pelo aparelho ultrapassa os 180 dias medidos pelo relógio do banco. O cenário foi reproduzido em PostgreSQL 18 descartável com apenas um segundo de diferença. O desvio do aparelho da ocorrência real não foi medido.

A [migration 0036](../supabase/migrations/0036_workout_link_server_expiry.sql) centraliza o cálculo no servidor e aceita o frontend anterior, limitando ao teto os prazos que ele envia acima de 180 dias. Mantém prazos futuros menores, a revogação transacional e as permissões existentes. Nenhum link ou treino existente é alterado pela aplicação da migration.

Validação local do aplicativo: `npm run check` aprovado, incluindo lint, **889 testes em 116 arquivos**, TypeScript, Vite e orçamento do build. Os testes novos falharam com o envio antigo da expiração e passaram com o cálculo delegado ao banco. Revisão independente sem problemas encontrados.

No PostgreSQL 18 descartável, a nova suíte passou com **31 verificações pgTAP**, cobrindo prazo padrão, excesso de um segundo/uma hora, prazo menor, pedidos vencidos, rollback da reemissão, RLS, MFA e recusa de acesso anônimo. O ambiente tem bootstrap mínimo de Auth/Storage e não substitui o Supabase completo do CI.

Também passaram as regressões das migrations 0027, 0028, 0033 e 0035: **169 verificações SQL no total**. Fixtures revertidas e servidor descartável encerrado.

## Aplicação confirmada e publicação

Em 10/09/2026, o usuário aplicou a **0036** e confirmou que o link foi emitido normalmente. A consulta remota posterior retornou `schema gate ok: 0036`. A migration já está aplicada; falta publicar os arquivos do projeto.

No **CMD do Windows**, executar cada comando abaixo separadamente. O redirecionamento da geração de tipos deve ser feito no CMD para preservar o encoding.

```cmd
npx supabase gen types typescript --linked > src\lib\database.types.ts
```

```cmd
npm run check:remote-schema
```

O resultado esperado é `schema gate ok: 0036`.

```cmd
npm run check
```

Depois dos checks verdes, os comandos para publicar também o ajuste do frontend são:

```cmd
git add docs/DECISIONS.md docs/treino_link_aluno_spec.md docs/CORRECAO_LINK_TREINO_2026-09-10.md scripts/check-schema-version.mjs src/features/workout/link.ts src/features/workout/link.test.ts src/lib/database.types.ts supabase/migrations/0036_workout_link_server_expiry.sql supabase/tests/0036_workout_link_server_expiry.test.sql
```

```cmd
git commit -m "Corrige validade na emissao de links de treino"
```

```cmd
git push origin main
```

Geração de tipos, commit e push ficam para execução pelo usuário. A consulta do carimbo remoto foi somente de leitura.
