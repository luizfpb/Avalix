# Rollout seguro da v2.2

Este procedimento preserva o banco que ja esta em uso. Ele nao usa reset,
rollback destrutivo, seed ou reaplicacao de migrations antigas.

## Estado confirmado em 13/07/2026

- o schema remoto contem as mudancas de `0001` a `0019`;
- o historico remoto do CLI registra apenas `0001` e `0002`;
- a migration `0020` ainda nao esta aplicada;
- o backup gerado em 13/07/2026 foi descriptografado e restaurado com sucesso
  em PostgreSQL descartavel; banco, FKs, RLS, gatilhos e Storage foram
  validados, incluindo 6 objetos/136.200 bytes com SHA-256;
- a auditoria remota contou 7 avaliados, 5 avaliacoes, 4 anamneses,
  6 consentimentos, 19 intakes (3 aceitos e 16 cancelados), 4 planos com
  7 dias/35 exercicios, 60 circunferencias e 35 dobras;
- nao havia consentimento ativo duplicado, menor sem responsavel, objeto de foto
  orfao nem intake terminal com evidencia sujeita a anonimizacao no rollout.

Essas contagens sao uma linha de base, nao substituem um backup restauravel.

## Comandos proibidos no projeto em uso

Nao execute nenhum destes comandos com `--linked` ou `--db-url`:

```text
supabase db reset
supabase migration down
supabase db push --include-all
supabase db push --include-seed
```

Se um comando de leitura ou `--dry-run` mostrar algo diferente do esperado,
pare. Nao use `migration repair` para "tentar resolver" sem conferir o schema.

## 1. Preparar a release sem publicar

1. Crie uma branch de release, confirme que nenhum segredo entrou no diff e
   envie essa branch ao GitHub. Nao faça merge em `main` ainda.
2. Aguarde os workflows `quality` e `database`. O `db reset --local` existente
   no workflow `database` roda somente no container descartavel do GitHub; ele
   nao se conecta ao projeto em uso.
3. Na maquina local, execute:

```powershell
npm ci
npm run check
```

O resultado de referencia desta revisao e 262 testes aprovados, build aprovado,
budgets aprovados e zero vulnerabilidades no audit offline.

O MFA TOTP permanece opcional por decisao do produto. Quem optar por usa-lo pode
ativar e validar o fator em **Configuracoes > Conta e seguranca**; contas sem
fator continuam autenticadas normalmente por e-mail e senha. O preflight
contabiliza a adesao ao MFA apenas como informacao operacional, sem bloquear o
rollout.

## 2. Gerar e provar o backup

1. Confirme no GitHub os secrets `SUPABASE_DB_URL`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` e `BACKUP_PASSPHRASE`.
2. Em **Actions > backup > Run workflow**, selecione a branch da release. A
   versao nova do workflow inclui o dump custom do Postgres, os bytes dos
   buckets `photos` e `logos`, manifesto com SHA-256 e criptografia AES-256.
3. Baixe o artifact `avalix-backup-*` e siga
   [BACKUP_RESTORE.md](./BACKUP_RESTORE.md). No minimo, prove que ele
   descriptografa, que `pg_restore --list` le `db.dump` e que o manifesto do
   Storage existe.
4. Para a garantia forte, restaure em ambiente descartavel e confira login,
   contagens, RLS e abertura dos registros. Nunca teste restore no projeto em
   uso.

Nao prossiga se o artifact estiver ausente, vazio, indecifravel ou sem a senha
guardada fora do GitHub.

## 3. Fazer o preflight remoto, somente leitura

Reserve uma janela curta e garanta que ninguem esteja salvando consentimentos,
intakes, avaliacoes, equipe ou exclusoes. Na raiz do repo, rode:

```powershell
npx supabase migration list --linked
npx supabase db query --linked --file scripts\remote-schema-preflight.sql --output table
npx supabase db query --linked --file scripts\remote-data-preflight.sql --output table
```

Antes da reconciliacao, o esperado e:

- `migration list`: Local mostra `0001` a `0020`; Remote mostra somente `0001`
  e `0002`;
- schema preflight: `present=true` para `0003` a `0019`,
  `recorded_in_history=false` para elas e `present=false` para `0020`;
- data preflight: investigue qualquer diferenca em relacao a linha de base e
  exija zero nos indicadores de integridade. Como o app segue em uso, a
  comparacao decisiva e entre as contagens imediatamente antes e depois da
  migration. As metricas de MFA sao informativas e nao sao indicadores de
  integridade. Guarde ambas as saidas no registro da release.

Qualquer diferenca exige parar e investigar. Nao avance por aproximacao.

## 4. Reconciliar apenas o historico

Este comando nao executa o SQL antigo; ele registra que o schema ja existente
corresponde a essas migrations:

```powershell
npx supabase migration repair --linked --status applied 0003 0004 0005 0006 0007 0008 0009 0010 0011 0012 0013 0014 0015 0016 0017 0018 0019
npx supabase migration list --linked
```

O segundo comando deve mostrar `0001` a `0019` alinhadas em Local e Remote e
somente `0020` pendente. Se nao mostrar exatamente isso, pare.

## 5. Simular e aplicar somente a 0020

Primeiro faça o dry-run:

```powershell
npx supabase db push --linked --dry-run
```

A saida deve listar exclusivamente `0020_integrity_privacy.sql`. Se mencionar
qualquer migration de `0001` a `0019`, seed ou outro arquivo, nao confirme.

Com o backup validado, a janela sem gravacoes ativa e o dry-run correto:

```powershell
npx supabase db push --linked
```

A `0020` possui `BEGIN/COMMIT`: se uma instrucao falhar, a migration inteira e
revertida. Nao tente corrigir parcialmente no SQL Editor.

## 6. Verificar antes de publicar o frontend

Rode novamente os diagnosticos:

```powershell
npx supabase migration list --linked
npx supabase db query --linked --file scripts\remote-schema-preflight.sql --output table
npx supabase db query --linked --file scripts\remote-data-preflight.sql --output table
```

Agora `0001` a `0020` devem estar alinhadas, `0020` deve ter `present=true` e
as contagens de dados de negocio devem ser iguais as do preflight. Mudancas
esperadas ficam restritas a metadados de integridade/retencao previamente
contabilizados.

Regere os types em UTF-8 pelo CMD, confira o diff e valide o app:

```powershell
cmd /d /c "npx supabase gen types --linked --lang typescript --schema public > src\lib\database.types.ts"
git diff -- src\lib\database.types.ts
npm run check
```

O gate `check:remote-schema` do deploy tambem exige que a RPC reporte `0020`;
assim, um merge prematuro falha antes de publicar a versao incompatível.

## 7. Publicar e testar

1. Envie o diff final dos types para a branch e aguarde os checks verdes.
2. Faça merge em `main`; o workflow de deploy so publica depois de confirmar o
   schema `0020` e repetir lint, testes, build e budgets.
3. Faça smoke test em producao:
   - login e MFA/AAL2;
   - abrir um avaliado, avaliacao, anamnese e plano ja existentes;
   - criar e revogar um consentimento de teste;
   - gerar, enviar, aceitar, rejeitar e cancelar convites de teste;
   - gerar PDF/CSV/ZIP e confirmar a trilha de auditoria;
   - testar exclusao somente com um registro descartavel criado para isso;
   - recarregar uma rota interna e atualizar o PWA.
4. Confirme o primeiro workflow `retention` verde e acompanhe
   `client_errors`/Auditoria. So entao encerre a janela.

## Se algo falhar

- antes do `db push`: pare; nada foi alterado no schema;
- durante a `0020`: preserve a mensagem completa; a transacao deve voltar ao
  estado anterior;
- depois da `0020`, antes do deploy: mantenha a janela sem gravacoes e corrija
  com uma nova migration, nunca editando uma migration ja aplicada;
- perda ou divergencia de dados: nao continue escrevendo; preserve logs e use o
  backup validado conforme o runbook de restauracao.
