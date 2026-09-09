# Correções da auditoria — 08/09/2026

As alterações locais tratam os **24 IDs** registrados na [análise funcional](ANALISE_APP_2026-09-08.md): 20 falhas demonstradas e quatro riscos condicionais ou inferidos. O relatório original permanece como registro do diagnóstico; suas provas que afirmavam um comportamento defeituoso não devem ser confundidas com as regressões permanentes que agora exigem o comportamento correto.

**Validação global final aprovada:** `npm run check` executou lint, **884 testes em 115 arquivos**, TypeScript, Vite e orçamento de build, todos verdes. São 108 testes a mais que a base auditada. Entrada: 610.283 bytes, 183.837 bytes gzip; precache: 1.931.292 bytes em 123 arquivos. `git diff --check` não apontou erros.

O trabalho foi realizado no workspace, com testes, fixtures fictícias e PostgreSQL descartável. Não houve escrita de Git, consulta a dados de produção, aplicação remota de migrations, deploy nem restauração de backup remoto. “Implementado” neste documento descreve os arquivos locais; não afirma que a correção já está disponível aos usuários.

## Identidade, avaliações, anamnese e postura

| ID | Correção local | Evidência permanente e comportamento verificado |
| --- | --- | --- |
| CLI-01 | O parecer congela `updated_at` ao abrir edição ou retirada; a API exige essa versão no UPDATE. Conflito preserva os campos. Todo o editor fica bloqueado durante a gravação, inclusive para impedir que o fechamento após sucesso descarte uma digitação posterior. | [API de anamnese](../src/features/anamnesis/api.test.ts) e [cartão de parecer](../src/features/anamnesis/LiberacaoMedicaCard.test.tsx): versão obrigatória, restrição recebida por refetch, edição/retirada antiga recusada, observações preservadas e campos desabilitados durante o envio. |
| CLI-02 | Detalhe e edição de avaliação, além do detalhe de anamnese, conferem `subject_id` antes de renderizar, exportar ou salvar. Formulários são identificados pelo avaliado e pelo registro. | [Integridade de avaliação](../src/pages/AvaliacaoIntegridade.test.tsx): URL com pai A e registro de B não oferece PDF nem gravação; detalhe da anamnese também é bloqueado. A proteção existente da edição de anamnese foi preservada. |
| CLI-03 | A árvore de [AvaliadoDetalhe](../src/pages/AvaliadoDetalhe.tsx) remonta por titular; [WorkoutLinkCard](../src/features/workout/WorkoutLinkCard.tsx) também isola seu estado por `subjectId`. Links emitidos e respostas tardias não acompanham outro perfil. | [Navegação real entre perfis](../src/pages/AvaliadoDetalhe.links.test.tsx), com Router/QueryClient/useSubject, e [cartão de treino](../src/features/workout/WorkoutLinkCard.test.tsx): salto direto no histórico com ambos os cadastros em cache, troca após emissão e emissão antiga concluída depois da troca. |
| CLI-04 | O editor de postura conta revisões das marcações e só limpa “Não salvo” se a revisão confirmada ainda for a exibida. A troca de foto remonta o editor. | [PosturaFoto](../src/pages/PosturaFoto.test.tsx): segunda marca criada durante o primeiro save continua pendente; a segunda gravação envia ambas e só então remove a pendência. |
| CLI-05 | Campos vazios continuam opcionais; medidas preenchidas passam por validação de finitude e faixa antes de montar as leituras. Zero e negativos não desaparecem do payload. Personalizadas exigem nome e medida ou linha inteiramente vazia. | [Integridade de avaliação](../src/pages/AvaliacaoIntegridade.test.tsx): circunferência negativa, dobras 0/-2/100, personalizada inválida/incompleta e linha opcional vazia. A prova confirma que a validação não depende do bloqueio nativo do HTML. |
| CLI-06 | Detalhe e estado atual da evolução mostram as ressalvas gravadas. O PDF de evolução recebe as ressalvas de cada coleta, com data completa e protocolo, preservando o padrão Clareza. | [Evolucao](../src/pages/Evolucao.test.tsx), [integridade](../src/pages/AvaliacaoIntegridade.test.tsx) e [render do PDF](../src/features/reports/assessmentPdf.render.test.tsx): aviso produzido pelo motor real, transporte do histórico e série extensa de 30 ressalvas. |
| CLI-07 | [getAssessment](../src/features/assessment/api.ts) busca cabeçalho, dobras e circunferências em uma única consulta REST aninhada. O contrato entregue aos consumidores permanece igual. | [API de avaliação](../src/features/assessment/api.test.ts): uma única consulta com ambas as relações. O risco original era um interleaving inferido; não foi reproduzido contra PostgREST real. A mudança elimina as três requisições independentes que permitiam misturar versões. |

## Treino, concorrência e funcionamento offline

| ID | Correção local | Evidência permanente e comportamento verificado |
| --- | --- | --- |
| T01 | A restauração do rascunho tem ciclo de leitura próprio e não é cancelada definitivamente quando a rede substitui o cache com os mesmos IDs. Campos dependentes aguardam sua conclusão. | [TreinoAluno](../src/pages/TreinoAluno.test.tsx): cache seguido de rede com leitura pendente; formação das linhas e aplicação da semana com leitura imediata ou atrasada. |
| T02 | [studentStore](../src/features/workout/studentStore.ts) compara a revisão-base da aba com a revisão armazenada dentro da transação. Conteúdo antigo não recebe uma revisão nova apenas porque outra aba avançou. | [Integração do armazenamento](../src/features/workout/studentStore.integration.test.ts): duas escritas da mesma base, falha transacional sem promoção da revisão e recusa de conclusão obsoleta. [TreinoAluno](../src/pages/TreinoAluno.test.tsx) também aguarda a restauração antes de permitir edição. |
| T03 | Rascunhos passam para bucket v3 por plano, preservando `clientRef`. A reconciliação migra todas as sessões, atualiza a identidade estável e não deixa cópias nos IDs antigos. A conclusão registra quais sessões terminaram para recusar escritas atrasadas. | [Integração do armazenamento](../src/features/workout/studentStore.integration.test.ts): migração v1/v2, duas regravações do plano, várias divisões/datas, remoção por `clientRef`, não ressurreição e preservação de mais de 14 sessões. [studentDraft](../src/features/workout/studentDraft.ts) conserva séries preenchidas quando duas origens convergem. |
| T04 | [Execucao](../src/pages/Execucao.tsx) usa a prescrição efetiva da semana para séries, repetições, RIR, descanso, observações e sugestão de progressão. Exercício pulado é indicado explicitamente, sem apagar séries já realizadas. | [Execucao](../src/pages/Execucao.test.tsx): ajustes semanais completos, exercício pulado e distinção entre descanso prescrito e descanso efetivamente registrado. |
| T05 | Os formulários de execução profissional e do aluno bloqueiam campos e ações de troca enquanto o snapshot é gravado. A conclusão só reinicia a sessão depois das etapas duráveis necessárias. | [Execucao](../src/pages/Execucao.test.tsx) e [TreinoAluno](../src/pages/TreinoAluno.test.tsx): séries/notas/avulsos e navegação durante envio; falha ao remover rascunho não produz confirmação de conclusão. |
| T06 | A fila distingue erro temporário de rejeição definitiva, conserva a sessão e agenda nova tentativa com espera progressiva. O retry manual pode antecipar a espera. Respostas antigas só alteram a revisão da fila que enviaram. | [Fila do aluno](../src/features/workout/studentQueue.test.ts), [sincronização](../src/features/workout/studentSession.test.ts) e [armazenamento](../src/features/workout/studentStore.integration.test.ts): indisponibilidade/limite temporário, fila legada e resposta antiga sem remover ou rejeitar conteúdo mais novo. |
| T07 | Renomear uma divisão atualiza todas as ocorrências da sequência; removê-la elimina suas referências e ajustes órfãos. Rótulos duplicados e referências inexistentes são recusados. A migration 0035 verifica a relação no estado final da transação. | [TreinoNovo](../src/pages/TreinoNovo.test.tsx): renomeação repetida na sequência, volume preservado e rótulo duplicado. [SQL 0035](../supabase/tests/0035_workout_schedule_integrity.test.sql): 17 verificações; duas conexões reais também exercitaram alteração de sequência versus remoção de divisão, nos dois sentidos. |
| T08 | [getWorkoutPlan](../src/features/workout/api.ts) pagina dias, exercícios, ajustes e semanas, avançando pela quantidade realmente devolvida. Confere `updated_at` ao final, repete até três vezes em mudança concorrente e retorna erro se não obtiver versão estável. | [Paginação de plano](../src/features/workout/planPagination.test.ts): 1.092 ajustes com tetos simulados de 1.000 e 200 linhas e verificação de revisão. O teto efetivo de produção não foi consultado. |

## Cadastro, organização, acesso e infraestrutura

| ID | Correção local | Evidência permanente e comportamento verificado |
| --- | --- | --- |
| R01 | O cadastro inicializa o formulário uma vez por titular, preserva edição durante refetch e envia a versão de abertura no UPDATE. Conflito mantém o preenchimento. Resposta de uma tela desmontada não redireciona o perfil atual. | [AvaliadoForm](../src/pages/AvaliadoForm.concurrent.test.tsx): telefone preservado após refetch, versão original enviada, erro transitório e conflito. Prova SQL local confirmou UPDATE obsoleto afetando zero linhas. |
| R02 | [useFormDraft](../src/lib/draft.ts) descarrega o último valor ao desmontar, ocultar ou sair do documento. Revisões de limpeza/identidade impedem recriar rascunho concluído ou transferir dados entre escopos. Expiração cancela conteúdo antigo, mas uma edição nova pode voltar a persistir. | [Ciclo de vida](../src/lib/draft.lifecycle.test.tsx) e [armazenamento de rascunhos](../src/lib/draft.test.ts): saída antes de 600 ms, troca de chave, logout, sucesso, StrictMode, pausa superior ao TTL público, retomada e edição pendente antes da limpeza. |
| R03 | [useClock](../src/lib/useClock.ts) atualiza as telas a cada minuto e ao retomar foco/visibilidade. Agenda reclassifica compromissos; Dashboard recalcula o dia e sua janela semanal sem abrir nova janela de consulta a cada minuto. | [Agenda e Dashboard](../src/pages/AgendaDashboard.clock.test.tsx): passagem de dia, compromisso que passa ao histórico sem refetch e estabilidade da janela no mesmo dia. |
| AB-01 | Revalidação transitória da organização com dados já carregados preserva a árvore da rota e mostra aviso/retry. Carregamento inicial, recusa de acesso e membership ausente continuam fechando o acesso. | [OrganizationProvider](../src/features/organization/OrganizationProvider.test.tsx): erro transitório, retry e troca de identidade. Alterações também em [RouteGuard](../src/routes/RouteGuard.tsx). |
| AB-02 | Acesso ao armazenamento do aluno carrega uma geração persistida, além do estado local de vida da tela. Revogação/purga invalida operações em voo; consultas e transações conferem a autorização capturada antes de atualizar cache, rascunho ou fila. | [Integração do armazenamento](../src/features/workout/studentStore.integration.test.ts) e [TreinoAluno](../src/pages/TreinoAluno.test.tsx): outra aba após purga, transação já iniciada, retorno tardio de pacote/histórico/detalhe/correção e troca de credencial. A revisão independente também verificou a saída durante inicialização e a resposta inválida de A que não pode apagar o novo acesso B. |
| AB-03 | A migration 0034 vincula as anotações de resguardo à foto e organização, acompanha sua exclusão em cascata e as inclui na exportação autorizada. Acesso direto continua negado. O snapshot exportado passa a versão 1.1, mantendo as coleções anteriores e um único evento de auditoria. | [SQL 0034](../supabase/tests/0034_anotacoes_resguardo_lifecycle.test.sql): 21 verificações de ciclo de vida, autorização e exportação. A migration aborta diante de resguardo sem foto compatível; não apaga o passivo para conseguir aplicar. |
| AB-04 | Recuperação de senha mantém marcador temporário em sessionStorage, ligado ao usuário e `session_id`, sem copiar tokens. Reload restaura a etapa; logout, troca de sessão/usuário e prazo de uma hora removem o marcador. | [Recovery](../src/features/auth/recovery.test.ts) e [RecoveryFlow](../src/features/auth/RecoveryFlow.test.tsx): restauração, invalidação e limite sem renovação por refresh. O marcador controla somente a interface; a autorização continua no Supabase/MFA. |
| AB-05 | O loader converte WebP em PNG transparente antes de enviar ao renderer de PDF, com limite de 2.048 px e proporção preservada. PNG/JPEG seguem suportados. Falha de assinatura/download/conversão é explícita; `null` representa ausência de logo configurado. | [Logo](../src/features/organization/logo.test.ts): conversão, liberação do bitmap, falhas e ausência de logo. O renderer não recebe WebP como se fosse um formato suportado. |
| I01 | O workflow verifica as referências extraídas do próprio dump contra o manifesto e os bytes copiados antes de empacotar/publicar. Confere presença, tamanho e SHA-256 e exige `reference-check.json` no arquivo final. | [Verificador](../scripts/verify-backup.mjs), [regressões](../src/lib/backupIntegrity.test.ts) e [workflow](../.github/workflows/backup.yml). Fixture gerada por pg_dump real: cinco referências extraídas e cinco arquivos fictícios verificados. Extração parcial, arquivo ausente, hash divergente e caminho inseguro são recusados. |

## Evidências locais e limites da validação

As frentes registraram as execuções dirigidas abaixo. Elas se sobrepõem e **não devem ser somadas** como se fossem a suíte final:

- Avaliações/anamnese/relatórios: 268 testes em 36 arquivos; depois, oito testes do cartão de parecer passaram com o bloqueio adicional durante gravação. ESLint do escopo aprovado.
- Treino/aluno: 359 testes em 32 arquivos na execução dirigida final; revisão independente das transações, revisões, migrações, sessões concluídas e invalidação entre abas concluída, seguida pelo check global aprovado.
- Autenticação/organização: 48 testes em sete arquivos; ESLint dirigido aprovado.
- Banco: 258 verificações pgTAP em dez arquivos após aplicar 0001–0035 no PostgreSQL 18 descartável. Também foram executados os dois interleavings da sequência semanal e a prova de concorrência do cadastro.
- Backup: parser exercitado contra saída real de `pg_restore` de um dump fictício; o artefato local verificou cinco referências, cinco arquivos e 748 bytes. Isso não é restauração de backup real.
- Revisão cruzada de rascunho: quatro cenários adicionais locais confirmaram sucesso/limpeza, retorno à mesma identidade, remoção externa e retomada após TTL.

Foram renderizadas as sete amostras de produção de avaliação, evolução e treino, incluindo versões extensas e avaliação mínima. O PDF longo de evolução foi inspecionado por imagem em suas quatro páginas: as ressalvas permaneceram dentro das folhas, conservando Clareza. Um WebP fictício foi realmente decodificado e convertido no Chrome; o PNG resultante foi inserido em outro PDF e sua presença foi conferida na imagem rasterizada.

As telas reais de avaliação, evolução, parecer, cadastro e treino foram abertas com dados fictícios em harness isolado, sem acesso ao Supabase. Cadastro, execução profissional, aluno e evolução foram capturados em desktop e celular, nos temas claro e escuro, incluindo o bloqueio durante envio e a preservação dos campos em conflito. A inspeção encontrou e corrigiu também o transbordamento horizontal da barra de ações de [AvaliacaoDetalhe](../src/pages/AvaliacaoDetalhe.tsx) em celular. As capturas finais não apresentaram transbordamento nesses estados.

Além da simulação automatizada, duas abas reais do Chrome compartilharam o mesmo IndexedDB: ambas abriram o rascunho, a primeira persistiu uma edição e a segunda tentou salvar sua base antiga. O conflito ficou visível, o texto da segunda aba continuou na tela e o armazenamento conservou o progresso da primeira. Navegador, servidor de visualização e PostgreSQL descartáveis foram encerrados ao final.

Os testes permanentes estão em `src/` e `supabase/tests/`. Relatórios intermediários, fixtures SQL, logs, harnesses e imagens estão em `audit-preview.local/`, ignorada pelo Git; não estarão presentes em uma cópia nova do repositório. Este documento mantém os vínculos duráveis para reconstruir a validação. As antigas provas da auditoria que exigem a falha podem deixar de passar depois das correções e não compõem a suíte normal.

O banco descartável usou bootstrap mínimo de Auth/Storage, suficiente para os contratos SQL exercitados. Não representa GoTrue, PostgREST e Storage completos. O IndexedDB foi exercitado com `fake-indexeddb`, dependência somente de desenvolvimento, e no Chrome real para a concorrência descrita acima; isso não equivale a ensaio em Safari, aparelho físico ou rede móvel. Nenhuma equação ou conclusão clínica nova foi introduzida.

## Aplicação manual das migrations

As únicas migrations desta entrega são [0034_anotacoes_resguardo_lifecycle.sql](../supabase/migrations/0034_anotacoes_resguardo_lifecycle.sql) e [0035_workout_schedule_integrity.sql](../supabase/migrations/0035_workout_schedule_integrity.sql). A aplicação continua sendo responsabilidade do usuário.

1. Antes de aplicar, executar o diagnóstico **somente de leitura** de `audit-preview.local/auth-banco/preflight-0034-0035.sql`, reproduzido abaixo para não depender do artefato ignorado. O ponto de partida esperado é o schema até 0033.
2. Se qualquer consulta retornar linhas, interromper o rollout. Conferir os registros e sua origem com acesso administrativo e backups; decidir o tratamento do passivo antes de reaplicar. Não eliminar anotações nem alterar prescrições automaticamente para satisfazer a migration.
3. Sem pendências identificadas, aplicar **0034 e depois 0035**, por inteiro e nessa ordem. Cada migration repete seu preflight dentro da transação e aborta integralmente se encontrar inconsistência; uma consulta anterior vazia não autoriza ignorar erro posterior.
4. Regenerar os tipos pelo fluxo usual do projeto e validar o schema. O [gate do frontend](../scripts/check-schema-version.mjs) exige `app_schema_version() = '0035'`; não publicar o frontend contornando esse gate.
5. Depois da confirmação do usuário de que aplicou as migrations, conferir remotamente a versão e os fluxos autorizados. Essa verificação ainda não foi executada nesta entrega.

Diagnóstico de resguardo sem foto da mesma organização:

```sql
select a.id, a.photo_id, a.org_id, p.org_id as photo_org_id
  from public.posture_annotations_shadowed a
  left join public.posture_photos p on p.id = a.photo_id
 where p.id is null or p.org_id is distinct from a.org_id;
```

Diagnóstico de sequência semanal referenciando uma divisão inexistente:

```sql
select p.id as plan_id, p.status, p.weekly_schedule,
  (select array_agg(d.label order by d.position)
     from public.workout_days d
    where d.plan_id = p.id) as existing_labels
  from public.workout_plans p
 where exists (
   select 1 from unnest(p.weekly_schedule) desired(label)
    where not exists (
      select 1 from public.workout_days d
       where d.plan_id = p.id and d.label = desired.label
    )
 );
```

O preflight não informa que há passivo remoto: essa condição não foi observada em produção. Na 0034, uma foto já removida pode impedir atribuir com segurança a anotação histórica ao titular; adivinhar essa associação ou apagar o resguardo destruiria informação. Na 0035, a sequência antiga pode exigir interpretação do profissional. Por isso ambas recusam o estado inconsistente em vez de corrigi-lo silenciosamente.

## Limite específico do backup

I01 foi tratado com uma verificação obrigatória antes da publicação. Se uma foto referenciada no dump desaparecer antes de ser copiada, a execução falha e exige nova captura; a ausência não é aceita como backup íntegro. A extração deve conter integralmente as duas tabelas esperadas, e todos os arquivos do manifesto têm tamanho e hash conferidos.

Essa verificação **não cria um snapshot distribuído de banco e Storage no mesmo instante**. Ela comprova as referências do dump e a integridade dos bytes presentes no artefato; não comprova a versão exata de um objeto cujo conteúdo seja substituído no mesmo caminho entre as capturas. Também não substitui um ensaio de restauração, que continua pendente para um backup real. A publicação de uma captura inconsistente foi bloqueada; não foi alegada atomicidade entre os serviços.

## Comandos para concluir a publicação

Depois de aplicar **0034 e 0035** conforme a seção de implantação, executar no **CMD do Windows**, um comando por vez. A geração dos tipos usa o redirecionamento do CMD para manter o encoding correto. Só continuar para os comandos Git se os dois checks terminarem com sucesso.

```cmd
npx supabase gen types typescript --linked > src\lib\database.types.ts
```

```cmd
npm run check:remote-schema
```

```cmd
npm run check
```

```cmd
git add .github/workflows/backup.yml docs/DECISIONS.md docs/ANALISE_APP_2026-09-08.md docs/CORRECOES_AUDITORIA_2026-09-08.md package.json package-lock.json scripts/check-schema-version.mjs scripts/render-pdf-sample.mjs scripts/verify-backup.mjs src supabase/migrations/0034_anotacoes_resguardo_lifecycle.sql supabase/migrations/0035_workout_schedule_integrity.sql supabase/tests/0034_anotacoes_resguardo_lifecycle.test.sql supabase/tests/0035_workout_schedule_integrity.test.sql
```

```cmd
git commit -m "Corrige concorrencia, rascunhos e integridade dos dados" -m "Preserva formularios e treinos entre abas, aplica ajustes semanais e reforca validacao, relatorios e backup."
```

```cmd
git push origin main
```

Esses comandos são entregues para execução pelo usuário; não foram executados nesta implementação. Migrations, geração de tipos e confirmação remota precisam anteceder a publicação do frontend.
