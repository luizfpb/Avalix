# Relatório de correções de segurança — estabilização 0028

Data: 26/08/2026  
Scan de origem: `6612b5f4-db7d-4990-b341-9598f3bb9825`  
Escopo: aplicação web, RPCs públicas, RLS, Storage, persistência offline e exportação CSV.

## Resultado

Os oito achados originais foram corrigidos no código e cobertos por validações estáticas ou testes automatizados. A revisão adversarial independente encontrou dois caminhos adicionais — retenção local após revogação e replay idempotente em plano `draft` — que também foram corrigidos. Não restou achado conhecido de severidade alta ou crítica.

As migrations 0001–0028 foram executadas em sequência num PostgreSQL 18.3 local descartável, com stubs mínimos dos schemas Supabase `auth` e `storage`. O preflight terminou com sete consultas vazias e as três suítes somaram 106/106 asserções (0020: 39; 0027: 24; 0028: 43) num harness equivalente, pois a extensão pgTAP não estava disponível localmente. A aplicação remota da 0028 e o workflow oficial no runtime Supabase continuam sendo gates obrigatórios antes do deploy.

## Invariantes fixados

1. Auditoria e erros administrativos só podem ser lidos/administrados com MFA satisfeito.
2. Novos logos só podem usar `{org_id}/logo.png`, `.jpg` ou `.webp`; escrita exige papel administrativo e MFA.
3. Escrita REST autenticada de sessão sempre nasce como `trainer`; autoria `student` só existe pela RPC com token.
4. Criação concorrente de organizações pelo mesmo ator é serializada antes da contagem do limite.
5. Anamnese 1.3 é validada e tem o gate recalculado no servidor; spec antiga nunca é promovida silenciosamente.
6. Cabeçalho e leituras de uma avaliação são criados na mesma transação.
7. Sessão pública de treino só grava em plano `active` ou `archived`; `draft` é recusado em INSERT e replay.
8. Fórmulas de planilha em exportações CSV são neutralizadas antes da serialização.
9. Token de treino revogado/expirado invalida estado, fila e caches; respostas em voo não podem ressuscitá-los.
10. Revisões de sessão são reservadas atomicamente entre abas e monotônicas no banco; replay antigo não substitui séries novas.
11. A data de uma sessão é imutável por `(plan_id, client_ref)`, mantendo estável o cursor do histórico durante revisões concorrentes.

## Correções e evidências

| Fronteira | Correção | Evidência principal | Estado |
|---|---|---|---|
| Auditoria e erros | Policies com `app.mfa_satisfied()` | pgTAP 0028 + testes de UI | Corrigido |
| Logos | Helper de chave canônica, policies estreitas e limpeza de variantes | pgTAP 0028 + testes de `logo.ts` | Corrigido |
| Autoria do treino | Policy REST exige `source = 'trainer'` | pgTAP 0028 | Corrigido |
| Limite de organizações | Lock da linha de `profiles` antes de contar | pgTAP 0028 | Corrigido |
| Anamnese | Validação integral, gate server-side, bloqueio de spec antiga | testes TS + pgTAP 0020/0028 | Corrigido |
| Avaliação | RPC `create_assessment` transacional | testes TS + rollback pgTAP 0028 | Corrigido |
| Link público de treino | Propagação de `NULL`, purge central, epoch de acesso, bloqueio de `draft` | testes de `TreinoAluno` + pgTAP 0028 | Corrigido |
| Offline e concorrência | Outbox atômico, Web Lock/mutex, `client_revision` e data imutável | testes TS + pgTAP 0028 | Corrigido |
| Exportação CSV | Escape de `=`, `+`, `-`, `@`, tab e CR | teste unitário de exportação | Corrigido |

## Hardening aplicado além dos achados

- `EXECUTE` foi removido de `PUBLIC`, `anon` e `authenticated` nos helpers `SECURITY DEFINER` internos de treino.
- O cursor de histórico usa `(performed_at, created_at, id)`, possui cobertura para sessões na mesma data e não pode ser atravessado por reenvio que tente mudar `performed_at`.
- A fila IndexedDB usa read-modify-write numa única transação, evitando perda de atualização entre abas.
- O cache de plano anterior é removido quando o servidor deixa de disponibilizá-lo.
- A migration falha antes de criar a restrição única se houver exercício duplicado na mesma divisão; o preflight lista o passivo sem alterar dados.

## Gates antes de produção

1. Executar `scripts/0028-stabilization-preflight.sql` no projeto Supabase e resolver todo bloqueador.
2. Aplicar `supabase/migrations/0028_stabilization_and_security.sql`.
3. Regenerar `src/lib/database.types.ts` a partir do schema remoto.
4. Executar o workflow de banco com todos os pgTAP, inclusive 0020, 0027 e 0028.
5. Só então publicar o frontend e executar o smoke de produção.
