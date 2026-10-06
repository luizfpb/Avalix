# Auditoria técnica do Avalix — 06/10/2026

Auditoria iniciada em 05/10 e consolidada em 06/10/2026, no fuso America/Sao_Paulo. Base: `5a50933` — “Limpa o visual dos PDFs e corrige letras perdidas ao gerar relatorios em sequencia”, migrations `0001`–`0044` e árvore de trabalho inicialmente limpa.

Foram encontrados **12 defeitos confirmados: 5 críticos, 5 altos, 1 médio e 1 baixo**. Nenhuma correção foi aplicada. Código do aplicativo, `package.json` e migrations permaneceram intactos; este relatório é o único arquivo novo fora de `audit-preview.local/`. Não houve login, consulta ou escrita no Supabase de produção, deploy ou operação Git de escrita.

## Resumo e ordem de correção

| Código | Gravidade | Defeito |
| --- | --- | --- |
| A01 | Crítica | Link do aluno sobrescreve sessão do profissional e conserva a autoria errada |
| A02 | Crítica | Revogação descoberta ao concluir elimina o treino antes do resgate |
| A03 | Crítica | Revalidação de plano regravado apaga séries e substitui o rascunho por vazio |
| A04 | Crítica | Relógio adiantado provoca purga de rascunho de link ainda válido |
| A05 | Crítica | Edição durante o envio da anamnese desaparece ao chegar a resposta |
| A06 | Alta | US Navy masculino usa a cintura e ignora o abdômen coletado |
| A07 | Alta | Reabrir após perder a resposta duplica o treino do profissional |
| A08 | Alta | Trocar de seção após concluir offline faz a semana regredir |
| A09 | Alta | Resposta perdida ao atualizar sessão parcial deixa a continuação presa em conflito |
| A10 | Alta | Aceite da anamnese converte a coleta noturna para o dia seguinte em banco UTC |
| A11 | Média | Quota temporária real da RPC bloqueia definitivamente o reenvio da fila |
| A12 | Baixa | PDF longo deixa o título de divisão sem exercícios na mesma página |

**Corrigir primeiro: A01, A02, A03, A04 e A05, nessa ordem.** A01 permite alteração não autorizada pelo portador do link. A02–A05 eliminam trabalho local que ainda não chegou ao servidor. A classificação “Crítica” segue a régua pedida, que inclui perda de dado; o alcance demonstrado em cada item está descrito abaixo e não equivale a perda do banco inteiro.

`npm run check` passou: lint, suíte Vitest, TypeScript/build e orçamento. O pré-cache ficou em **1.960.733 bytes, 126 arquivos**; entrada em **610.234 bytes, 183.828 gzip**. A primeira execução parou por restrição do sandbox ao esbuild; a repetição fora dessa restrição passou. Isso foi uma limitação do ambiente, sem evidência de defeito no projeto.

Também passaram **424 verificações pgTAP em 19 suítes**, sobre PostgreSQL 18 descartável com todas as migrations aplicadas em ordem. As provas adicionais têm **12 testes de interface/armazenamento e 14 verificações SQL**. Nelas, “passou” significa que o comportamento defeituoso ou a contraprova foi reproduzido conforme descrito; não significa que o defeito foi corrigido.

As evidências estão em [`audit-preview.local/auditoria-2026-10-05/`](../audit-preview.local/auditoria-2026-10-05/), pasta ignorada pelo Git. Ela mantém a data de início da auditoria.

## Achados confirmados

### A01 — Crítica — Aluno sobrescreve uma sessão do profissional mantendo a autoria

**Área:** autorização, integridade e auditoria do treino.

**Onde:** `supabase/migrations/0039_sessao_em_andamento.sql:121`, `:124`, `:436`, `:327`, `:338` e `:347`; `supabase/migrations/0043_auditoria_aparelho_real.sql:473`.

**Como reproduzir:** em banco descartável, criar aluno, plano ativo e link; registrar pelo profissional uma sessão de 40 kg com `client_ref`, como faz o frontend atual. Sob papel `anon`, ler o pacote do próprio link: `plan_week_log` revela a referência dessa sessão. Enviar pela RPC pública `submit_workout_session` essa referência, revisão 1 e série de 99 kg.

**O que acontece:** o wrapper e a função interna procuram por `(plan_id, client_ref)` sem exigir `source = 'student'`. A chamada é aceita, apaga a série de 40 kg, grava 99 kg e troca a observação. A linha continua com `source = 'trainer'`. A RPC específica de correção pública, por sua vez, recusa a mesma sessão porque confere a origem. O envio comum contorna essa fronteira.

**O que deveria acontecer:** um link de aluno não deve reescrever sessão atribuída ao profissional. A prova alcança sessões do próprio aluno, sem correção explícita posterior; não demonstrou acesso a outro aluno ou organização. O identificador necessário é obtido na resposta pública normal, sem adivinhação. A exposição de referências de sessões do profissional passou a ser relevante com a idempotência adicionada na 0043.

**Prova:** [`seguranca/trainer-token-boundary.sql`](../audit-preview.local/auditoria-2026-10-05/seguranca/trainer-token-boundary.sql), verificações 1–6; resultado em [`trainer-token-boundary.log`](../audit-preview.local/auditoria-2026-10-05/seguranca/trainer-token-boundary.log). O controle usa o ID real da sessão na RPC de correção. Fixtures fictícias e `ROLLBACK` ao final.

**Correção sugerida:** rejeitar a colisão com sessão de origem profissional antes de qualquer alteração, tanto no wrapper quanto na função interna de envio. Retornar referências de deduplicação apenas das sessões do aluno e testar a matriz autor da sessão × canal de escrita; ocultar a referência, sozinho, não substitui a autorização.

### A02 — Crítica — Revogação no envio apaga o treino antes de oferecer cópia

**Área:** aluno, fila offline e recuperação de trabalho.

**Onde:** `src/pages/TreinoAluno.tsx:1553`, `:1606`, `:291` e `:304`; `src/features/workout/studentStore.ts:256`.

**Como reproduzir:** abrir um link válido, preencher 42 kg e deixar a tela aberta. Revogar ou reemitir o link pelo profissional. Antes de outra revalidação da página, tocar em **Concluir treino**; a RPC responde `link invalido ou expirado`.

**O que acontece:** a sessão entra na fila durável, mas o tratamento da recusa a remove antes de chamar `invalidarAcesso`. O resgate consulta a fila já vazia e a purga apaga também o rascunho. A tela mostra link inválido sem **Copiar dados**. A série não está no servidor nem no armazenamento local.

**O que deveria acontecer:** capturar o snapshot recusado em memória e oferecer sua cópia antes da limpeza. A purga por revogação é decisão intencional e foi preservada na análise; o defeito é eliminar previamente a única fonte do resgate prometido na entrega da 0043. A contraprova confirma que revogação ao abrir com fila preexistente ainda oferece a cópia.

**Prova:** [`aluno/continuity.test.tsx`](../audit-preview.local/auditoria-2026-10-05/aluno/continuity.test.tsx), testes de revogação durante a sessão e revogação com fila existente; [`aluno/resultados.json`](../audit-preview.local/auditoria-2026-10-05/aluno/resultados.json). Página, fila e store reais; somente RPC/telemetria simuladas e IndexedDB em `fake-indexeddb`.

**Correção sugerida:** tratar credencial inválida antes de desenfileirar ou passar diretamente o snapshot ao resgate. Fazer a purga depois de capturar os dados necessários à cópia.

### A03 — Crítica — Plano regravado faz a Execução apagar o rascunho preenchido

**Área:** execução pelo profissional e revalidação de consultas.

**Onde:** `src/pages/Execucao.tsx:664`, `:730`, `:748`, `:752` e `:808`; `src/features/workout/hooks.ts:97`; `supabase/migrations/0030_treino_agrupamentos.sql:134` e `:138`.

**Como reproduzir:** preencher 40 kg na divisão A da Execução, sem registrar. Em outra aba/aparelho, salvar o mesmo plano. O salvamento recria dias/exercícios com IDs novos, mesmo preservando rótulo e exercício do catálogo. Deixar a consulta do plano revalidar na primeira tela, por foco ou reconexão.

**O que acontece:** o formulário mantém o `dayKey` antigo, mas passa a procurar exercícios nos dias novos. A lista fica vazia. A montagem do rascunho passa a incluir apenas as fontes visíveis, também vazias, e substitui o rascunho anterior. Fechar e reabrir já não restaura os 40 kg.

**O que deveria acontecer:** preservar e remapear o preenchimento pela identidade estável quando o plano muda durante a montagem da tela. O reconciliador atual é usado na restauração do rascunho, não nessa transição ao vivo. Não é repetição do remapeamento do aluno corrigido anteriormente.

**Prova:** [`root/execucao.test.tsx`](../audit-preview.local/auditoria-2026-10-05/root/execucao.test.tsx), teste `PLANO REGRAVADO`; [`root/resultados.json`](../audit-preview.local/auditoria-2026-10-05/root/resultados.json). A notificação do hook troca os dados sem navegar ou desmontar o formulário; a prova depois reabre a tela e encontra o campo vazio.

**Correção sugerida:** reconciliar o estado antes de adotar os IDs novos, ou congelar o plano usado pelo preenchimento e oferecer atualização segura. Impedir que uma revalidação substitua por vazio um rascunho ainda não remapeado.

### A04 — Crítica — Relógio adiantado apaga rascunho de link válido

**Área:** aluno, validade do token e relógio do aparelho.

**Onde:** `src/pages/TreinoAluno.tsx:371`, `:390`, `:454`, `:464`, `:291` e `:304`; `src/features/workout/studentSession.ts:178`.

**Como reproduzir:** link expira em `10/10/2026 12:00Z`; hora real `11:59Z`, com série de 42 kg somente no rascunho. Adiantar o relógio do aparelho dois minutos, para `12:01Z`, e abrir `/t` com cache.

**O que acontece:** a página considera o link expirado e purga token, cache e rascunho antes de consultar o servidor. Não oferece cópia porque o resgate cobre apenas a fila. Corrigir o relógio depois não recupera o trabalho. O mesmo teste com relógio correto preserva 42 kg e consulta a RPC.

**O que deveria acontecer:** um relógio local incorreto não deve autorizar a eliminação irreversível do rascunho. Se a leitura offline precisar ser bloqueada por validade incerta, isso deve ser separado da confirmação de revogação/expiração pelo servidor.

**Prova:** [`aluno/continuity.test.tsx`](../audit-preview.local/auditoria-2026-10-05/aluno/continuity.test.tsx), prova do relógio e seu controle. Confere ausência de chamada à RPC e releitura do IndexedDB vazio após a purga. É distinto da emissão de validade corrigida na 0036: a falha está na decisão destrutiva ao abrir.

**Correção sugerida:** usar confirmação do servidor para a purga definitiva e preservar trabalho pendente enquanto a validade depender apenas do relógio local. Incluir o rascunho no resgate dos casos que realmente exigem limpeza.

### A05 — Crítica — Edição durante o envio da anamnese desaparece

**Área:** anamnese pelo profissional e perda de alterações locais.

**Onde:** `src/pages/AnamneseNova.tsx:159`, `:164`, `:171`, `:173`, `:227`, `:254` e `:270`.

**Como reproduzir:** editar uma anamnese, mudar ocupação de “Professora” para “Professora corrigida” e clicar em **Salvar alterações**. Com a requisição ainda pendente, digitar “Informação nova durante envio” no campo, que continua habilitado. Deixar a primeira requisição terminar.

**O que acontece:** só o botão Salvar fica desabilitado. O payload já capturado contém o primeiro valor; a resposta libera a saída e navega para o detalhe, descartando a edição posterior sem aviso nem segunda gravação. A prova demonstra perda de alteração local, não de uma anamnese já salva. O mesmo estado editável contém as respostas de saúde.

**O que deveria acontecer:** impedir a edição durante o envio ou manter as alterações feitas depois da captura do payload e não sair automaticamente. A proteção já aplicada ao cartão de parecer médico não abrange este formulário.

**Prova:** [`calculos-anamnese/anamnese-save.audit.test.tsx`](../audit-preview.local/auditoria-2026-10-05/calculos-anamnese/anamnese-save.audit.test.tsx); [`calculos-anamnese/resultados.json`](../audit-preview.local/auditoria-2026-10-05/calculos-anamnese/resultados.json). Usa página, Router e guarda reais, com Promise controlada na persistência; comprova campo habilitado, valor novo na tela e apenas o valor antigo no único envio.

**Correção sugerida:** bloquear todo o formulário enquanto salva ou comparar o estado atual com o snapshot enviado antes de limpar/navegar. Aplicar a mesma regra a data, respostas e confirmações.

### A06 — Alta — US Navy masculino usa cintura no lugar do abdômen

**Área:** cálculo da composição corporal e dados do laudo.

**Onde:** `src/features/assessment/sites.ts:31` e `:32`; `src/features/assessment/protocols/registry.ts:138` e `:144`; `src/pages/AvaliacaoNova.tsx:364` e `:389`; `src/features/assessment/result.ts:48`.

**Como reproduzir:** homem de 30 anos, 180 cm, 80 kg, protocolo US Navy, pescoço 38 cm, Cintura 85 cm e Abdômen 95 cm. Salvar a avaliação. Depois repetir alterando somente Abdômen para 110 cm.

**O que acontece:** o formulário grava as duas medidas, mas o motor usa `waist = 85` e ignora `abdomen`. O snapshot retorna **16,1066% e 12,8853 kg de gordura**. Alimentando a mesma equação com o sítio masculino correto, 95 cm, retorna **23,2283% e 18,5827 kg**: diferença de **7,1217 pontos percentuais e 5,6974 kg**. Alterar só Abdômen não muda o cálculo salvo.

**O que deveria acontecer:** no método clássico Hodgdon–Beckett, usar abdômen ao nível do umbigo para homens e cintura natural para mulheres. Esses sítios distintos são descritos no estudo original de [Potter et al. (2022), seção Methods / Study Design](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2022.868627/full). O defeito provado é a ligação do campo ao sítio; o resultado esperado acima usa a equação já implementada e não representa uma medição clínica de referência.

**Prova:** [`calculos-anamnese/navy.audit.test.tsx`](../audit-preview.local/auditoria-2026-10-05/calculos-anamnese/navy.audit.test.tsx), dois testes com formulário e motor reais; valores registrados em [`RESULTADO.txt`](../audit-preview.local/auditoria-2026-10-05/calculos-anamnese/RESULTADO.txt).

**Correção sugerida:** selecionar e explicar o sítio obrigatório por sexo, usando `abdomen` no masculino e `waist` no feminino. Versionar essa mudança no motor/snapshot e preservar o significado dos dados históricos, sem reinterpretar cintura antiga como abdômen.

### A07 — Alta — Reabrir após perder a resposta duplica o treino do profissional

**Área:** idempotência e retomada da Execução.

**Onde:** `src/pages/Execucao.tsx:692`, `:693`, `:748` e `:1131`; `src/features/workout/execucaoDraft.ts:30`; `supabase/migrations/0043_auditoria_aparelho_real.sql:461` e `:473`.

**Como reproduzir:** registrar uma série de 40 kg; o servidor grava, mas a resposta se perde. Fechar/reabrir a tela, recuperar o rascunho e tocar em **Registrar treino** novamente.

**O que acontece:** o conteúdo do rascunho sobrevive, mas a referência da tentativa está só em `useRef`. A nova montagem gera outro `client_ref`, e o banco cria outra sessão idêntica. O teste da mesma tentativa sem desmontagem continua passando; a proteção da 0043 ficou limitada à instância aberta.

**O que deveria acontecer:** o rascunho deve conservar a identidade do envio com resultado incerto. Repetir a tentativa após reabrir precisa alcançar a mesma sessão, evitando contagem duplicada de execução, adesão e progressão.

**Prova:** [`root/execucao.test.tsx`](../audit-preview.local/auditoria-2026-10-05/root/execucao.test.tsx), teste `RESPOSTA PERDIDA + REABERTURA`, mostra duas referências para o conteúdo restaurado. [`seguranca/trainer-token-boundary.sql`](../audit-preview.local/auditoria-2026-10-05/seguranca/trainer-token-boundary.sql), verificações 7–8, confirma em PostgreSQL que referências distintas criam duas linhas, e repetir a mesma não cria uma terceira.

**Correção sugerida:** persistir o `client_ref` da tentativa junto ao rascunho antes do primeiro envio e só renová-lo após confirmação ou decisão explícita de iniciar outra sessão. Na retomada, reconciliar a tentativa com o servidor antes de considerar o preenchimento um treino novo.

### A08 — Alta — Conclusão offline perde a semana ao visitar o Histórico

**Área:** aluno, mesociclo e prescrição efetiva.

**Onde:** `src/pages/TreinoAluno.tsx:663`, `:985`, `:1003`, `:1047` e `:1641`.

**Como reproduzir:** plano de oito semanas com sequência `['A']` e nenhum treino no pacote. Abrir pelo cache sem internet, preencher 40 kg e concluir. A tela sugere semana 2. Tocar **Histórico**, voltar a **Treino**, preencher 45 kg e concluir outra sessão.

**O que acontece:** a semana volta para 1 após a troca de seção. A fila conserva corretamente duas sessões com referências distintas, mas ambas são gravadas com `weekNumber: 1`. As conclusões locais usadas na sugestão ficam apenas no estado do componente desmontado; não são reconstruídas da fila durável. A semana também seleciona os overrides mostrados ao aluno.

**O que deveria acontecer:** a sessão concluída no aparelho deve contar para a sugestão mesmo antes de sincronizar, com deduplicação por referência quando aparecer no servidor. É o inverso da contagem dupla corrigida na 0039: aqui uma sessão existente é omitida.

**Prova:** [`aluno/continuity.test.tsx`](../audit-preview.local/auditoria-2026-10-05/aluno/continuity.test.tsx), teste de Histórico e retorno. Confere semana 2 antes, semana 1 depois e semanas `[1, 1]` nos dois itens reais da fila.

**Correção sugerida:** unir conclusões persistidas na fila às do servidor por `client_ref`, preservando a contagem nas trocas de seção e remontagens. Atualizar essa união após sincronização.

### A09 — Alta — Atualização parcial sem resposta prende a sessão em conflito

**Área:** sessão do profissional salva para continuar depois.

**Onde:** `src/pages/Execucao.tsx:803`, `:843`, `:1068` e `:1079`; `supabase/migrations/0043_auditoria_aparelho_real.sql:592` e `:595`.

**Como reproduzir:** salvar progresso e receber versão V1; acrescentar outra série e salvar novamente. O banco aceita e passa a V2, mas a resposta se perde. Acrescentar uma terceira série e tentar salvar, inclusive depois de fechar/reabrir a tela e de o histórico já informar V2.

**O que acontece:** a continuação local permanece em V1 e todas as novas tentativas recebem conflito `40001`. O rascunho restaura V1. **Continuar esse treino** não é oferecido porque a sessão pendente tem o mesmo ID da continuação e há conteúdo local. A mensagem manda reabrir, mas reabrir recupera a mesma versão obsoleta. As séries anteriores estão no banco; a terceira permanece local e não consegue ser salva por esse caminho.

**O que deveria acontecer:** manter o controle de concorrência, mas permitir recuperar a confirmação perdida ou reconciliar a versão atual com o trabalho local. O problema não é recusar a versão velha; é não haver saída segura da recusa na interface.

**Prova:** [`root/execucao.test.tsx`](../audit-preview.local/auditoria-2026-10-05/root/execucao.test.tsx), teste `SALVAR PROGRESSO`, incluindo histórico atualizado e remontagem. [`seguranca/trainer-token-boundary.sql`](../audit-preview.local/auditoria-2026-10-05/seguranca/trainer-token-boundary.sql), verificações 9–11, confirma que o commit existe e o reenvio com a versão anterior é recusado.

**Correção sugerida:** dar identidade idempotente também às atualizações ou consultar o resultado de uma tentativa incerta antes de tratá-la como conflito externo. Oferecer reconciliação/reabertura preservando as alterações locais.

### A10 — Alta — Anamnese enviada à noite recebe o dia seguinte no aceite em UTC

**Área:** datas, anamnese pública e registro oficial da coleta.

**Onde:** `supabase/migrations/0028_stabilization_and_security.sql:726`; comparação com `src/pages/AnamneseRevisar.tsx:229`.

**Como reproduzir:** usar sessão PostgreSQL em UTC e intake com `submitted_at = '2026-10-05 22:30:00-03'`. O aceite vigente usa `coalesce(v_intake.submitted_at::date, current_date)` ao inserir a anamnese.

**O que acontece:** o cast devolve **06/10/2026**. No fuso da coleta, São Paulo, o dia é **05/10/2026**. A revisão no cliente já usa a data local, de modo que o resumo e o registro aceito podem discordar.

**O que deveria acontecer:** derivar a data civil no fuso definido para a coleta/organização. A reprodução confirma a conversão SQL e verifica que o corpo instalado da RPC ainda a contém; não simulou todo o aceite, nem consultou o timezone de produção. O achado é condicionado ao banco/sessão em UTC, não uma afirmação sobre a configuração remota atual.

**Prova:** [`seguranca/intake-date.sql`](../audit-preview.local/auditoria-2026-10-05/seguranca/intake-date.sql) e [`intake-date.log`](../audit-preview.local/auditoria-2026-10-05/seguranca/intake-date.log): três verificações, com comparação explícita a `America/Sao_Paulo`.

**Correção sugerida:** guardar a data civil da coleta ou converter o timestamp no fuso de produto/organização antes do cast. Não depender do timezone implícito da conexão PostgreSQL.

### A11 — Média — Quota temporária da RPC vira rejeição permanente da fila

**Área:** sincronização offline; lacuna residual da correção do T06 anterior.

**Onde:** `supabase/migrations/0039_sessao_em_andamento.sql:247` e `:248`; `src/features/workout/studentSession.ts:157`, `:163`, `:205` e `:235`.

**Como reproduzir:** sincronizar um item e receber a exceção efetiva da quota de 30 gravações por hora: `P0001`, mensagem `muitas gravacoes; tente de novo mais tarde`. Depois de duas horas, disponibilizar o servidor e forçar nova sincronização.

**O que acontece:** o classificador não reconhece essa mensagem como temporária e marca `error`. Tentativas posteriores, inclusive forçadas, pulam o item. A sessão permanece recuperável por cópia, mas não volta a sincronizar. Os testes permanentes cobrem HTTP 429, enquanto essa quota é uma exceção de negócio com outra mensagem.

**O que deveria acontecer:** preservar a pendência e tentar novamente após a janela. O T06 de 08/09 foi declarado corrigido incluindo limites temporários; este item entra porque a prova atual demonstra um caso real do SQL que ficou fora da correção, não porque o relatório antigo foi simplesmente repetido.

**Prova:** [`aluno/continuity.test.tsx`](../audit-preview.local/auditoria-2026-10-05/aluno/continuity.test.tsx), teste `T06 residual`. Usa classificador, fila e `flushQueue` reais, avança duas horas e verifica que só houve uma chamada à RPC. A resposta de quota é simulada a partir do contrato SQL, sem ensaio HTTP/PostgREST.

**Correção sugerida:** dar à quota um código estável e classificá-lo como temporário, cobrindo a resposta realmente emitida pela RPC. Reclassificar os itens antigos que ficaram presos com esse erro.

### A12 — Baixa — PDF longo separa título de divisão e primeiro exercício

**Área:** paginação do plano de treino em PDF.

**Onde:** `src/features/reports/workoutPdf.tsx:291`, `:292`, `:309` e `:373`.

**Como reproduzir:** gerar as amostras com `scripts/render-pdf-sample.mjs` e abrir `treino-longo.pdf`. A divisão B aparece no fim da página 5, mas o primeiro exercício só na 6. A divisão C aparece no fim da 7, com o primeiro exercício na 8.

**O que acontece:** `minPresenceAhead` não mantém o título junto da primeira linha/bloco que efetivamente será paginado. Fica um cabeçalho de tabela sem exercícios naquela folha. Não houve perda de texto ou prescrição demonstrada; o impacto é de leitura.

**O que deveria acontecer:** título e primeiro conteúdo identificável da divisão devem permanecer juntos.

**Prova:** [`pdfs/treino-longo.pdf`](../audit-preview.local/auditoria-2026-10-05/pdfs/treino-longo.pdf), imagens [`página 5`](../audit-preview.local/auditoria-2026-10-05/pdfs/treino-longo-05.png) e [`página 7`](../audit-preview.local/auditoria-2026-10-05/pdfs/treino-longo-07.png), inspecionadas visualmente; [`root/pdf-pagination.py`](../audit-preview.local/auditoria-2026-10-05/root/pdf-pagination.py) confirma a distribuição no texto extraído.

**Correção sugerida:** agrupar título, cabeçalho e primeira linha/segmento num bloco indivisível de tamanho limitado. Conferir novamente as divisões com circuitos extensos e observações longas.

## Suspeitas não confirmadas

**S01 — Transação IndexedDB sem evento de término.** A abertura tem prazo, mas as transações posteriores aguardam `success/error/abort` sem um prazo próprio. Falta demonstrar, em WebKit real após suspensão, uma transação que não entregue nenhum desses eventos e verificar se o fluxo fica preso; `fake-indexeddb` não comprova essa condição. Referência: `src/features/workout/studentStore.ts` e sua gestão de transações. Não foi contabilizado como achado.

**S02 — Novo token aberto em outra aba enquanto a purga antiga já está em andamento.** `src/pages/TreinoAluno.tsx:291` faz leituras assíncronas antes da purga em `:304`. O controle permanente cobre resposta inválida recebida depois da troca; falta reproduzir a troca durante os awaits de uma purga já iniciada e provar eventual remoção do armazenamento novo. Não foi demonstrada perda ou quebra de isolamento nessa ordem específica.

## Cobertura e verificações sem novo problema

### Banco, autorização e ciclo de vida

As 44 migrations foram aplicadas em ordem em PostgreSQL 18 descartável, restrito a `127.0.0.1:55485`. O harness usa stubs locais de `auth` e `storage`, com a mesma função das auditorias anteriores, e pgTAP. Foi necessário completar o stub com `auth.users.email`, acesso ao schema `extensions` e `search_path` de testes; essas adaptações estão na pasta de prova e não alteram migrations do produto.

O catálogo reconstruído mostrou **29 tabelas públicas com RLS** e **72 funções SECURITY DEFINER com `search_path` vazio**. Policies e grants foram inventariados em [`seguranca/catalog.log`](../audit-preview.local/auditoria-2026-10-05/seguranca/catalog.log). Essas condições estruturais não impedem a falha A01, que está dentro da autorização da RPC.

As 19 suítes existentes passaram. Entre os cenários exercitados: recusa de correção pelo token de outro aluno da mesma organização, revogação do link, MFA na RPC profissional, isolamento dos erros entre organizações, restrição de autoria por REST autenticado, termo canônico e nome do assinante, supersessão/revogação do consentimento, aceite atômico, exportação com auditoria, exclusão/cascatas e anotações legadas. Resultado completo em [`pgtap-summary.json`](../audit-preview.local/auditoria-2026-10-05/seguranca/pgtap-summary.json).

Não foi demonstrado vazamento entre organizações. Não houve ensaio de entrega real de JWT, autenticação TOTP, serviço Storage, backup ou restauração de produção. Parte das verificações pgTAP é estrutural ou usa fixtures como superusuário; a prova A01 executa as chamadas relevantes explicitamente como `authenticated` e `anon`.

### Aluno e profissional

Foram inspecionados abertura/cache/rede, deadlines, reserva de revisão, mutações transacionais da fila, conclusão direta, invalidação, histórico, rascunhos e remapeamento. A suíte existente continua aprovando reabertura da conexão IndexedDB, falha de abertura, modo efêmero online, revisão entre abas e proteção contra respostas antigas após invalidação. Não foi encontrada duplicação do aluno por simples retry com a mesma referência nas verificações realizadas.

Foram preservadas as decisões de purgar por revogação, não persistir o cronômetro do aluno, exigir nova colagem do link no armazenamento separado do PWA e distinguir sessão em andamento de concluída. A02/A04 apontam danos em caminhos específicos, não contestam genericamente essas decisões.

Em `TreinoNovo`, `TreinoDetalhe` e módulos compartilhados, foram conferidos bloqueio de identidade divergente, versão-base congelada, montagem de sequência semanal, publicação atômica, paginação de overrides, histórico e última carga. As regressões anteriores cobertas pela suíte passaram; A03/A07/A09 são falhas adicionais de continuidade na Execução.

### Cálculos e anamnese

Foram revistos JP7 por sexo, JP3 masculino, JP-Ward feminino, Durnin–Womersley, conversões Siri/Brozek, domínio das medidas, soma de massas, IMC e idade na data da coleta. Fora A06, não foi confirmado outro erro aritmético nos caminhos examinados. A ausência de classificação adulta abaixo dos 18 anos está preservada.

A conferência documental incluiu os coeficientes masculinos de [Jackson & Pollock (1978), tabela 4](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/S0007114578000689) e as faixas adultas de [Durnin & Womersley (1974), tabela 5](https://doi.org/10.1079/BJN19740060). A consulta não obteve o texto integral original de Jackson, Pollock & Ward de 1980; não se afirma revalidação primária completa de todos os coeficientes femininos. Notas de fontes e limites em [`calculos-anamnese/NOTAS.md`](../audit-preview.local/auditoria-2026-10-05/calculos-anamnese/NOTAS.md).

Também foram examinados Epley/Brzycki, limites de repetições, progressão por faixa e RIR, incrementos de carga leve, volume por músculos principais/adicionais/secundários, sequência com divisões repetidas, deload e overrides. Os casos testados não demonstraram falha nova. Não houve estudo clínico ou validação empírica dos protocolos em pessoas reais.

Na anamnese foram conferidos completude PAR-Q, confirmação de doenças/sintomas e medicamentos, matriz de triagem, nomes dos sinais de alerta, precedência/vencimento do parecer, concorrência e bloqueio durante envio no cartão de liberação. O defeito A05 é da página completa; o bloqueio do cartão continua coberto. Nenhuma suspeita clínica sem reprodução foi promovida a achado.

### PWA e interface

Foi aberto o build local em Chrome headless, com perfil exclusivo e viewport de **390 × 844**. Chamadas externas da página foram interceptadas antes da navegação e substituídas por dados fictícios ou bloqueadas; não houve login. A tela `/t` foi inspecionada por captura online e offline, com `scrollWidth = 390`, sem transbordamento horizontal ou exceção JavaScript.

O servidor local simulou o redirecionamento 308 de `/index.html`. Passaram: abertura após remoção somente dessa entrada do precache; recuperação offline com shell/pacote guardados; leitura de chunk antigo pelo worker ativo após sua remoção do servidor; instalação de worker novo que permanece esperando durante a sessão aberta. Não houve regressão de `ERR_FAILED` nesses cenários. Prova e resultados: [`root/browser.mjs`](../audit-preview.local/auditoria-2026-10-05/root/browser.mjs) e [`browser/resultados.json`](../audit-preview.local/auditoria-2026-10-05/browser/resultados.json).

A conferência visual desta rodada se limitou à tela do aluno e aos PDFs. As demais interfaces foram examinadas no código e em testes de componentes. Não foram medidos todos os contrastes, testados leitores de tela ou todos os percursos de foco. Não houve teste em iPhone/Safari ou Android físico, suspensão real do sistema, cota física de armazenamento ou duas abas reais com dados em edição; esses limites não devem ser confundidos com aprovação desses ambientes.

### PDFs e datas

Foram geradas em sequência as **nove amostras, total de 39 páginas**, incluindo documentos longos, avaliação mínima e menores de idade. Todas as páginas foram renderizadas por `pdftoppm` e inspecionadas em imagens de contato; uma página de evolução também foi aberta individualmente. `pdffonts` confirmou fontes embutidas nas nove amostras, e o texto extraído manteve “Última” e as letras da sequência gerada. Não foi reproduzida a perda de glifos corrigida recentemente. A exceção de paginação encontrada está em A12.

Artefatos: [`pdfs/verificacao.json`](../audit-preview.local/auditoria-2026-10-05/pdfs/verificacao.json), PDFs, textos extraídos e `contato-1.png` a `contato-4.png`. O teste de paginação distingue título separado de conteúdo efetivamente perdido.

Foram conferidos uso de data civil na revisão do intake e atualização da data das sessões, semana do mesociclo e relógio no dashboard/agenda por testes existentes. O desvio SQL noturno está em A10; a autoridade destrutiva do relógio local está em A04. Não foi realizada validação de todos os fusos nem de transições históricas de horário de verão.

## Reprodução das provas locais

No CMD do Windows, a partir da raiz do projeto, um comando por vez. Os testes importam o código atual e usam dados fictícios. Os SQLs abaixo são enviados exclusivamente ao cluster descartável pelo script, cujo host e porta estão fixados em `127.0.0.1:55485`; ele não lê `.env.local` nem usa o projeto Supabase vinculado.

```cmd
npx vitest run --config audit-preview.local/auditoria-2026-10-05/aluno/vitest.config.ts
```

```cmd
npx vitest run --config audit-preview.local/auditoria-2026-10-05/root/vitest.config.ts
```

```cmd
npx vitest run --config audit-preview.local/auditoria-2026-10-05/calculos-anamnese/vitest.config.ts
```

O cluster da auditoria foi encerrado ao concluir. Para repetir as provas SQL no cluster local já preparado:

```cmd
python audit-preview.local/auditoria-2026-10-05/seguranca/run_database.py start
```

```cmd
python audit-preview.local/auditoria-2026-10-05/seguranca/run_database.py audit-preview.local/auditoria-2026-10-05/seguranca/trainer-token-boundary.sql
```

```cmd
python audit-preview.local/auditoria-2026-10-05/seguranca/run_database.py audit-preview.local/auditoria-2026-10-05/seguranca/intake-date.sql
```

```cmd
python audit-preview.local/auditoria-2026-10-05/seguranca/run_database.py test
```

```cmd
python audit-preview.local/auditoria-2026-10-05/seguranca/run_database.py stop
```

Para recriar as amostras de PDF e verificar a paginação:

```cmd
npx vite-node scripts/render-pdf-sample.mjs audit-preview.local/auditoria-2026-10-05/pdfs
```

```cmd
python audit-preview.local/auditoria-2026-10-05/root/pdf-check.py
```

```cmd
python audit-preview.local/auditoria-2026-10-05/root/pdf-pagination.py
```

Para repetir a conferência de PWA/390 px, com `dist` já gerado por `npm run check`:

```cmd
node audit-preview.local/auditoria-2026-10-05/root/browser.mjs
```

O script visual usa o Chrome instalado e portas locais 5189/9239. O render de imagens requer Poppler e Pillow, já disponíveis nesta máquina. As pastas de evidência são locais e ignoradas: não acompanharão automaticamente o relatório ao publicar o repositório.
