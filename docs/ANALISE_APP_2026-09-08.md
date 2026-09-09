# Análise funcional do Avalix — 08/09/2026

**Correções posteriores:** os 24 IDs foram tratados nos arquivos locais e validados em uma entrega posterior, descrita em [CORRECOES_AUDITORIA_2026-09-08.md](CORRECOES_AUDITORIA_2026-09-08.md). Este documento preserva o diagnóstico do commit abaixo; não descreve o estado do código corrigido nem afirma aplicação em produção.

## Resultado e prioridade

A revisão encontrou falhas que podem misturar o titular de um documento ou link, substituir dados mais recentes por uma edição antiga e perder registros de treino. A concentração dos problemas está nas transições: troca de pessoa ou semana, cache seguido de rede, duas abas, salvamento lento e limpeza de dados com requisições ainda pendentes.

**A suíte principal passou, mas não exercitava várias dessas combinações.** As provas desta auditoria reproduzem os comportamentos defeituosos; uma prova aprovada significa que o problema foi observado, não que o comportamento esteja correto.

Base revisada: commit `dbc5ced799cbd883c8d4f1000dcb416e0ea47507`, migrations até `0033`. O estado remoto descrito em `DECISIONS.md` foi usado como contexto; esta auditoria não consultou dados de produção nem aplicou migrations. O código do aplicativo foi preservado.

**Balanço: 20 falhas demonstradas — 6 P1, 12 P2 e 2 P3 — e quatro riscos condicionais/inferências.** Um achado pode reunir variantes da mesma causa; a quantidade de testes não é a quantidade de bugs.

| Prioridade | ID | Falha e consequência principal |
| --- | --- | --- |
| P1 | CLI-03 | Troca direta de perfil pode manter links de treino e anamnese do titular anterior. |
| P1 | CLI-01 | Parecer aberto em aba antiga pode apagar uma restrição médica mais recente. |
| P1 | T04 | Execução profissional orienta a prescrição base, ignorando parte dos ajustes da semana. |
| P1 | T01 | Cache seguido de rede pode impedir a restauração e deixar o treino sem linhas de série. |
| P1 | T02 | Uma aba antiga ganha revisão maior e sobrescreve progresso mais completo. |
| P1 | T03 | Regravar o plano pode orfanar rascunhos de outras divisões ou reabrir sessão concluída. |
| P2 | CLI-02 | URL com IDs cruzados mistura titulares no documento e no cálculo salvo. |
| P2 | CLI-04 | Anotação feita durante o envio fica visível, mas é marcada como salva sem estar no payload. |
| P2 | CLI-05 | Medidas não positivas preenchidas são descartadas antes da validação. |
| P2 | CLI-06 | Ressalvas do motor somem da consulta posterior e não chegam à evolução. |
| P2 | T05 | Conteúdo digitado durante o envio de treino pode ser limpo sem ter sido enviado. |
| P2 | T06 | Erros temporários deixam sessões rejeitadas na fila sem nova tentativa. |
| P2 | T07 | Renomear divisão deixa a sequência apontando para rótulos inexistentes e altera o volume. |
| P2 | R01 | Refetch apaga edição de cadastro; salvar snapshot antigo pode desfazer alterações de outra pessoa. |
| P2 | R02 | Desmontagem antes do debounce perde a alteração pendente do rascunho. |
| P2 | AB-01 | Falha transitória de revalidação da organização desmonta formulários abertos. |
| P2 | AB-02 | Respostas antigas podem voltar a gravar caches depois da purga por revogação. |
| P2 | AB-04 | Recarregar a recuperação de senha volta ao pedido de e-mail e interrompe o fluxo. |
| P3 | AB-05 | Logo WebP aceito pelo app não aparece nos PDFs. |
| P3 | R03 | Dashboard e agenda ficam com data/classificação desatualizada enquanto abertos. |

Os quatro riscos separados são: **T08**, truncamento de ajustes pelo teto de linhas do servidor; **AB-03**, anotações históricas de resguardo fora da exclusão/exportação; **CLI-07**, leitura de versões diferentes numa avaliação; e **I01**, diferença de instante entre dump e cópia de arquivos. T08 e AB-03 foram reproduzidos com a condição necessária instalada no ambiente de teste; sua presença em produção não foi constatada. CLI-07 foi exercitado com respostas intercaladas simuladas; I01 é inferência do workflow.

### Como interpretar a gravidade

- **P1 — corrigir primeiro:** troca de identidade/credencial, alteração silenciosa de informação clínica ou perda importante do treino em andamento.
- **P2 — corrigir em seguida:** perda de uma edição, sincronização que não se recupera, retenção local inesperada ou fluxo funcional bloqueado.
- **P3 — menor impacto:** informação visual desatualizada ou identidade visual ausente sem perda do registro.
- **Condicional/inferência:** existe um mecanismo concreto, mas depende de configuração, volume ou concorrência não observados em produção. Essas condições estão explícitas.

Não há alegação de que esses eventos já aconteceram com usuários reais. A prioridade combina consequência e facilidade de ocorrer; não é uma estimativa estatística de frequência.

## Identidade, avaliações, anamnese e postura

### CLI-01 — P1 — Parecer antigo pode apagar uma restrição registrada em outro aparelho

**Confirmado no código, cliente simulado e PostgreSQL real descartável.**

- Origem: [src/features/anamnesis/api.ts:118](../src/features/anamnesis/api.ts#L118), especialmente o UPDATE somente por ID em `:145–150`; [src/features/anamnesis/LiberacaoMedicaCard.tsx:82](../src/features/anamnesis/LiberacaoMedicaCard.tsx#L82) captura o formulário na abertura e envia sem versão. O guard de banco está em [supabase/migrations/0029_liberacao_medica.sql:129](../supabase/migrations/0029_liberacao_medica.sql#L129).
- Gatilho: abrir “Editar parecer” em duas abas. A aba antiga parte de “Liberado”. Na segunda, registrar “Liberado com restrições”. Voltar à primeira e salvar uma observação do parecer antigo.
- Resultado: o UPDATE antigo é aceito, grava novamente “Liberado” e substitui as restrições. O refetch não corrige o formulário já aberto e não existe predicado `updated_at` na gravação do parecer.
- Prova: `audit-preview.local/avaliacoes/concorrencia.test.tsx`, primeiro teste, executa a API real e demonstra que o único predicado enviado é `id`. `audit-preview.local/avaliacoes/parecer.sql` executa os três estados sob RLS: `liberado` → `liberado_com_restricoes` → `liberado`, todos com `UPDATE 1`; a última gravação substitui a descrição e recebe autor do servidor.
- Impacto: o aviso usado na prescrição passa a refletir um parecer antigo como vigente. Não é uma divergência científica; é perda de uma decisão registrada.
- Correção sugerida: congelar `updated_at` ao abrir a edição/retirada, enviá-lo e incluir o predicado no UPDATE; recusar conflito mantendo o formulário. Aplicar também à retirada para ela não apagar parecer recém-alterado.
- Alternativas descartadas: a proteção da edição de respostas da anamnese já existe, mas não cobre `setLiberacaoMedica`. A 0029 valida forma, autoria e consentimento; não compara a versão-base do editor.

### CLI-02 — P2 — IDs cruzados na URL misturam pessoas no PDF e no cálculo da avaliação

**Confirmado em componentes reais e na RPC de banco. Exige um link profundo com associação errada entre IDs de registros já acessíveis ao profissional. Não demonstra acesso entre organizações.**

- Origem: [src/pages/AvaliacaoDetalhe.tsx:48](../src/pages/AvaliacaoDetalhe.tsx#L48), `:119`; [src/pages/AvaliacaoNova.tsx:75](../src/pages/AvaliacaoNova.tsx#L75), `:283–285`, `:376`, `:478–495`; [src/features/assessment/hooks.ts:74](../src/features/assessment/hooks.ts#L74); [src/features/assessment/api.ts:69](../src/features/assessment/api.ts#L69). Superfície equivalente: [src/pages/AnamneseDetalhe.tsx:26](../src/pages/AnamneseDetalhe.tsx#L26), `:73–85` combina cadastro da rota com respostas do registro sem conferir `subject_id`.
- Gatilho: abrir `/avaliados/A/avaliacoes/AVALIACAO_DE_B`, por exemplo um link profundo montado/copiado com o primeiro ID trocado, sendo A e B acessíveis ao mesmo profissional. As consultas independentes retornam com sucesso e a página trata o par como válido.
- Resultado: o PDF recebe nome e histórico de A com coleta e circunferências de B. Na rota `/editar`, o formulário usa idade e sexo de A para recalcular a avaliação de B. O argumento `subjectId` não move a avaliação: `updateAssessment` envia à RPC o ID da avaliação de B.
- Provas: os dois primeiros testes de `audit-preview.local/avaliacoes/identidade.test.tsx` mostram o PDF misto e o snapshot calculado com `sex: F, ageYears: 36`. `audit-preview.local/avaliacoes/identidade.sql` confirma `save_assessment` com base correta e resultado final `sexo_do_titular=M`, `sexo_gravado_no_snapshot=F`, `titular_preservado=t`.
- Impacto: relatório atribuído à pessoa errada; salvar pode corromper os resultados de B mantendo seus vínculos e suas medidas. No detalhe da anamnese, o prompt pode combinar identificação de A e respostas de B; essa superfície foi confirmada por leitura, sem teste de componente adicional.
- Correção sugerida: conferir o pai de cada registro antes de renderizar, exportar ou salvar; usar o sujeito canônico do registro nas consultas dependentes. Estender o contrato da gravação se necessário. Para avaliação e anamnese, repetir a defesa já presente em `AnamneseNova.tsx`, que compara `subject_id` antes de editar.
- Alternativas descartadas: RLS é autorização, não valida a relação entre dois IDs autorizados da URL. O guard de concorrência não detecta a mistura porque a versão da avaliação de B é atual.

### CLI-03 — P1 — Perfil reutilizado pode compartilhar links de treino e anamnese do aluno anterior

**Confirmado com página, Router, QueryClient e hook de sujeito reais, além de prova isolada do cartão. Depende de navegação que reaproveite a árvore do perfil.**

- Origem: [src/features/workout/WorkoutLinkCard.tsx:41](../src/features/workout/WorkoutLinkCard.tsx#L41); uso sem chave por sujeito em [src/pages/AvaliadoDetalhe.tsx:225](../src/pages/AvaliadoDetalhe.tsx#L225), `:392`. A anamnese repete o problema com `generatedUrl` em [src/pages/AvaliadoDetalhe.tsx:464](../src/pages/AvaliadoDetalhe.tsx#L464), exibido a partir de `:537`. Candidato de treino identificado pelo agente respectivo e reproduzido independentemente nesta revisão.
- Gatilho reproduzido: histórico de navegação Bruno → lista → Alice, com os dois cadastros no cache; emitir link no perfil Alice e voltar diretamente a Bruno escolhendo essa entrada no histórico do navegador (POP de duas posições). O perfil é reaproveitado. Voltar ao índice e só depois abrir outro perfil desmonta a árvore e não reproduz o problema.
- Resultado: `urlRecente` continua contendo o token de Alice, tem precedência sobre `loadWorkoutLinkLocal(subjectId)` e não é vinculado ao sujeito. A mensagem muda para “Bruno, este é o seu treino”, mas o endereço permanece o de Alice. Na anamnese, o campo do link gerado e seu WhatsApp também continuam expondo o intake de Alice dentro do perfil de Bruno.
- Provas: `audit-preview.local/avaliacoes/link-aluno.test.tsx` demonstra o estado do cartão em isolamento; `audit-preview.local/treino/link-route.test.tsx` usa a página e navegação reais para o treino; `audit-preview.local/avaliacoes/anamnese-route.test.tsx` usa a mesma sequência real para a anamnese. O texto de treino contém Bruno com `token-ficticio-alice`, e o perfil de Bruno mantém `token-anamnese-alice` no outro cartão. Não houve abertura nem envio de WhatsApp.
- Impacto: o destinatário pode receber acesso por capability ao treino e aos registros de outra pessoa. No intake, pode responder e consentir no link ligado ao aluno anterior, gerando uma resposta para revisão sob o titular errado. A RLS não impede o uso de um token válido entregue por engano.
- Correção sugerida: associar o estado recém-emitido ao `subjectId` e exibi-lo somente quando ambos coincidirem; preferencialmente remontar componentes de perfil por identidade. Ignorar resposta assíncrona de emissão se o sujeito mudou durante a chamada.
- Limite: a prova reproduz navegação em memória do React Router com os hooks reais e dados fictícios em cache. A condição é saltar diretamente entre perfis preservando a árvore; não ocorre em toda troca pela lista.

### CLI-04 — P2 — Anotar durante o salvamento produz alterações visíveis que ficam marcadas como salvas

**Confirmado em componente real com resposta assíncrona controlada.**

- Origem: [src/pages/PosturaFoto.tsx:94](../src/pages/PosturaFoto.tsx#L94), `:128–134`, `:153–201`; o editor continua alterável enquanto somente o botão Salvar é bloqueado.
- Gatilho: desenhar uma marca, tocar em Salvar e adicionar uma segunda marca enquanto a requisição está pendente.
- Resultado: a requisição contém somente a primeira marca; a segunda permanece na tela. Quando a resposta chega, `setDirty(false)` remove “Não salvo” e desabilita Salvar, embora o documento visível seja diferente do persistido.
- Prova: `audit-preview.local/avaliacoes/postura.test.tsx` usa a página real e um canvas substituto que chama o mesmo `onChange`. Confirma uma marca no payload, duas na tela, badge ausente e botão Salvar desativado ao resolver a Promise. A anotação inserida no teste é fictícia.
- Impacto: sair/recarregar perde a segunda marca sem o bloqueio de alterações pendentes. A detecção assistida concluída durante um save pode atingir a mesma corrida.
- Correção sugerida: comparar a revisão/conteúdo enviado com o estado atual antes de limpar `dirty`, ou bloquear todas as mutações do editor durante a chamada. Conservar a edição posterior e permitir novo save.
- Alternativas descartadas: `useBlocker(dirty)` e `beforeunload` existem, mas são desarmados pelo próprio `setDirty(false)`. A unicidade da folha de anotações não cobre alterações feitas no mesmo aparelho durante uma gravação.

### CLI-05 — P2 — Medidas digitadas como zero/negativas são descartadas antes da validação

**Confirmado em componente real para circunferência negativa; mesma ordem de filtragem nas aferições de dobra confirmada por leitura.**

- Origem: [src/pages/AvaliacaoNova.tsx:431](../src/pages/AvaliacaoNova.tsx#L431), `:447–464`; [src/features/assessment/sites.ts:81](../src/features/assessment/sites.ts#L81) ignora aferições não positivas ao calcular a média.
- Gatilho: preencher as medidas obrigatórias corretamente e digitar `-35` em Panturrilha (D); salvar. Na edição de uma medida já registrada, o mesmo caminho pode removê-la.
- Resultado: o `continue` para `!(v > 0)` ocorre antes da validação da faixa 10–250. O campo preenchido desaparece do payload, e o save ocorre sem mensagem sobre ele. Nas dobras, `.filter(n => n > 0)` ocorre antes do teste 1–99, descartando a aferição inválida e usando apenas as demais.
- Prova: terceiro teste de `audit-preview.local/avaliacoes/identidade.test.tsx` interage com o campo real, confirma a chamada de salvar, ausência de `calf_r` no payload e ausência do erro de faixa. Também verifica que o input não tem `min`, que `checkValidity()` aceita o número negativo e que o campo não está dentro de formulário HTML: o botão chama `handleSave` por `onClick`, sem bloqueio nativo de submit.
- Impacto: o sistema converte entrada inválida em “não coletado” e pode perder uma medida existente, escondendo um erro de digitação do profissional. O servidor recebe apenas o conjunto já filtrado e não consegue rejeitar o valor perdido.
- Correção sugerida: distinguir string vazia de número inválido; validar todo campo preenchido antes de calcular ou montar as leituras. Permitir omissão somente quando o campo realmente está vazio.

### CLI-06 — P2 — Ressalvas calculadas pelo motor desaparecem da consulta posterior e da evolução

**Confirmado no detalhe com snapshot produzido pelo motor real; omissão no contrato de evolução confirmada por leitura.**

- Origem: [src/pages/AvaliacaoDetalhe.tsx:246](../src/pages/AvaliacaoDetalhe.tsx#L246) mostra o resultado, mas não lê `result.warnings`. [src/pages/Evolucao.tsx:100](../src/pages/Evolucao.tsx#L100) transmite ao PDF só valores/protocolo, sem as ressalvas de cada avaliação. O resultado atual da tela também não as exibe. O PDF individual faz a preservação corretamente em [src/features/reports/assessmentPdf.tsx:697](../src/features/reports/assessmentPdf.tsx#L697).
- Gatilho: salvar uma avaliação que o motor aceita com aviso, como JP-Ward com idade 70. Voltar ao detalhe ou consultar a evolução.
- Resultado: o aviso que era visível no formulário deixa de acompanhar o resultado na consulta de rotina. O PDF de evolução não recebe essas ressalvas e não pode reproduzi-las, embora tenha uma nota geral de método.
- Prova: quarto teste de `audit-preview.local/avaliacoes/identidade.test.tsx` chama `buildAssessmentResult` real, exige que existam warnings, renderiza o detalhe e verifica que o percentual aparece mas nenhum texto de warning aparece.
- Impacto: o número reaparece sem a limitação específica que motivou sua aceitação com reserva. Nenhuma validade clínica das equações foi reavaliada aqui; a conclusão trata da perda da advertência que o próprio app já calculou.
- Correção sugerida: exibir as ressalvas do snapshot no detalhe e no estado atual; acrescentar warnings associados à avaliação/data na entrada e na renderização do PDF de evolução, preservando os avisos históricos pertinentes.
- Alternativas descartadas: o dado não foi apagado do JSON nem do PDF individual. Uma nota genérica de não diagnóstico não informa qual entrada está fora da faixa nem substitui o aviso específico.

### CLI-07 — P2, risco inferido — Leitura da avaliação pode combinar cabeçalho e leituras de versões diferentes

**Inferência forte apoiada no fluxo de código e em interleaving controlado do cliente. Não foi reproduzida contra PostgREST/Storage real.**

- Origem: [src/features/assessment/api.ts:207](../src/features/assessment/api.ts#L207) executa três requisições separadas: cabeçalho, dobras e circunferências. Consumidores: detalhe/PDF e comparação.
- Gatilho: a primeira leitura retorna V1; outro aparelho conclui `save_assessment` V2 antes das consultas de leituras. A escrita é atômica, mas as três leituras não compartilham snapshot.
- Resultado previsto: o chamador recebe resultados de V1 com aferições/circunferências de V2 e pode exportar um documento internamente incoerente. Não exige falha de escrita: é justamente uma gravação concorrente bem-sucedida.
- Evidência: segundo teste de `audit-preview.local/avaliacoes/concorrencia.test.tsx` executa `getAssessment` real com uma revisão ocorrendo entre os retornos; o resultado contém input de tríceps 10 no snapshot e leitura 20 na mesma resposta composta. Essa prova demonstra o comportamento do cliente nesse interleaving, não a ocorrência em produção.
- Correção sugerida: buscar cabeçalho e filhas em uma consulta SQL/REST aninhada ou RPC de leitura com snapshot único. Alternativamente, reler a versão ao terminar e repetir a leitura se ela mudou, com limite e erro explícito em vez de entregar uma composição inconsistente.
- Alternativas descartadas: `save_assessment` já grava atomicamente; isso evita estado incoerente persistido, mas não mantém o snapshot entre requisições HTTP independentes. Na edição, o guard tende a recusar o save da versão antiga; na leitura/exportação não existe esse guard.

## Treino, rascunhos e sincronização

### T01 — P1 — Cache seguido da rede pode impedir definitivamente a leitura do rascunho e a criação das linhas

- **Fonte:** [src/pages/TreinoAluno.tsx:745](../src/pages/TreinoAluno.tsx#L745), especialmente 747–748, 751–752 e 783–786; consumidores em 790 e 817.
- **Gatilho:** abrir o treino com pacote salvo em cache; `readDraft()` continua pendente enquanto a rede devolve o mesmo plano/divisões, com arrays recém-desserializados.
- **Causa:** o efeito marca `draftReadKey.current` antes de terminar a leitura. Os arrays novos de `dias`/`pacote.exercises` executam o cleanup, que muda `vivo` para falso. O efeito seguinte retorna pela chave já marcada. Quando o IndexedDB responde, a primeira execução também retorna. Ninguém define `rascunhoLido=true`.
- **Evidência:** `audit-preview.local/treino/student-races.test.tsx`, primeiro teste: pacote do cache, resposta de rede controlada e depois resposta do rascunho; apenas uma chamada a `readDraft`, zero campos de carga após ambas as respostas e botão Salvar progresso habilitado. O React real monta a página; não é uma simulação manual do efeito.
- **Impacto:** tela mostra a prescrição, mas nenhuma linha normal; o autosave permanece desativado. A falha depende de ordem de respostas, por isso tende a aparecer intermitentemente em aparelhos ou redes mais lentos.
- **Variante confirmada:** se houver um rascunho válido, a restauração também sobrescreve semana e observação que o usuário já mudou antes da resposta. Segundo teste: semana 2/“Dor nova” voltam a semana 1/“Nota antiga”. Esses controles não aguardam a restauração.
- **Recomendação:** inicialização com geração/estado concluído, capaz de cancelar e reiniciar; não marcar a chave como lida antes do sucesso. Enquanto houver restauração, bloquear alterações ou preservar explicitamente as alterações já realizadas. Cobrir tanto cache→rede sem mudança de IDs quanto rascunho existente lento.
- **Descartado:** não é o flake de asserção corrigido no CI. A prova resolve todas as Promises e observa que o estado nunca termina, diferentemente de simplesmente consultar o DOM cedo. Também não é o remapeamento do plano: os IDs não mudam no cenário.

### T02 — P1 — Aba desatualizada recebe revisão maior e apaga progresso mais completo

- **Fonte:** [src/features/workout/studentStore.ts:494](../src/features/workout/studentStore.ts#L494), sobretudo 525–530; [src/pages/TreinoAluno.tsx:939](../src/pages/TreinoAluno.tsx#L939); [supabase/migrations/0033_falha_e_correcao_de_sessoes.sql:595](../supabase/migrations/0033_falha_e_correcao_de_sessoes.sql#L595) e chamada à implementação interna em 609.
- **Gatilho:** abrir a mesma sessão em duas abas. Ambas carregam revisão 1 com uma série. A aba A acrescenta a segunda série e salva; depois B, que continua com a primeira série, salva seu snapshot antigo.
- **Causa:** `reserveDraftRevision` lê a revisão mais recente do aparelho, calcula `max(revisão persistida, revisão da aba)+1` e substitui o rascunho pelo payload do chamador. Isso garante números únicos, mas transforma conteúdo antigo em uma revisão nova válida. O servidor só recusa revisão menor e substitui as séries pelo payload da revisão maior.
- **Evidência:** `audit-preview.local/treino/storage-races.test.ts`, primeiro teste, chama a função real de armazenamento com adaptador mínimo de IndexedDB. A tem duas séries e ganha revisão 2; B permanece com uma série, recebe revisão 3 e a segunda série desaparece do armazenamento. Todas as operações são sequenciais, portanto a falha não depende de defeito na serialização das transações. O caminho de substituição no servidor foi conferido estaticamente, sem executar SQL remoto.
- **Impacto:** progresso mais completo pode ser substituído silenciosamente por uma aba antiga; reservar revisão monotônica não implementa controle de concorrência do conteúdo.
- **Recomendação:** distinguir revisão-base conhecida pela aba da revisão reservada para envio. Recusar/conciliar o snapshot se a base mudou; ou impor uma única aba editora e propagar alterações entre abas. A proteção precisa existir antes de elevar a revisão do snapshot antigo.
- **Descartado:** Web Lock e transação IndexedDB já serializam escritas, mas não detectam conteúdo defasado. `corrected_at` só protege correções feitas no histórico; o caso é progresso normal ainda não corrigido.

### T03 — P1 — Remapeamento de plano deixa rascunhos de outras divisões órfãos e pode reabrir sessão já concluída

- **Fonte:** [src/pages/TreinoAluno.tsx:751](../src/pages/TreinoAluno.tsx#L751), 758 e 896; [src/features/workout/studentStore.ts:430](../src/features/workout/studentStore.ts#L430), 457–482 e 565–581; [src/features/workout/studentDraft.ts:83](../src/features/workout/studentDraft.ts#L83).
- **Gatilho A:** existem rascunhos não concluídos em A e B; B foi o último usado. O profissional regrava o plano e todos os IDs filhos mudam. O aluno reabre e depois volta para A.
- **Causa A:** apenas o rascunho `active` é reconciliado. `trocarSessao` procura a outra sessão por `dayId` novo/data exatos e nem usa `reconciliarRascunho`. A continua gravada com o ID antigo e não é encontrada.
- **Gatilho B:** o rascunho ativo remapeado é persistido e depois concluído.
- **Causa B:** `writeDraft` adiciona a chave nova sem remover a chave antiga da mesma sessão. `clearDraftSession` apaga somente a nova. A cópia antiga passa a ser a ativa; na próxima abertura volta a ser reconciliada e mostrada, mesmo depois da conclusão.
- **Evidência:** segundo e terceiro testes de `audit-preview.local/treino/storage-races.test.ts`: depois de remapear B, `readDraft(...,'a-new',data)` retorna null, embora `a-old` ainda exista. Depois de concluir A remapeada, `readDraft(scope,plan)` devolve a cópia antiga com o mesmo clientRef e a série preenchida.
- **Impacto:** registros não enviados parecem perdidos ao trocar de divisão, e uma sessão finalizada pode reaparecer como trabalho pendente. A cópia antiga também pode provocar conflitos de revisão ao reenviar.
- **Recomendação:** migrar o bucket inteiro por identidade estável numa transação, substituir a chave antiga da mesma sessão em vez de duplicá-la e concluir por identidade/clientRef. A troca de sessão deve reconciliar os rascunhos encontrados por identidade estável, não depender apenas dos IDs atuais.
- **Descartado:** não é o bug já corrigido de faltar `extras` no autosave nem a ausência de identidade em rascunho legado. As provas usam `identity` completo e mantêm os mesmos exercícios do catálogo.

### T04 — P1 — Execução do profissional continua orientando a prescrição base mesmo após escolher outra semana

- **Fonte:** [src/pages/Execucao.tsx:555](../src/pages/Execucao.tsx#L555), 562–564, 732, 740–741 e 756–760.
- **Gatilho:** o plano tem ajuste na semana 2 (menos séries, outra faixa de repetições, outro RIR ou exercício marcado para pular) e o profissional seleciona semana 2 no registro da sessão.
- **Causa:** a semana só chega a `effectivePrescription` para o placeholder de descanso. Quantidade de linhas, texto “plano”, placeholders de reps/RIR e sugestão de progressão leem os campos base. `is_skipped` e notas do override nem são consultados nesse desenho.
- **Evidência:** dois testes em `audit-preview.local/treino/trainer-races.test.tsx`: base 3×8–12/RIR 2, override 1×4–6/RIR 4/180 s. A tela continua com 3 linhas, reps 8–12, RIR 2 e só descanso 180. Outro cenário marcado `is_skipped=true` continua com grade de carga e sem aviso de não executar.
- **Impacto:** aluno, PDF e profissional podem ver orientações diferentes para a mesma semana; semana leve ou exercício suspenso aparecem como prescrição normal ao profissional. A sugestão de progressão também usa metas que já não são as vigentes.
- **Recomendação:** derivar texto, linhas, placeholders, estado pulado e sugestões da prescrição efetiva única; preservar séries já digitadas na reconciliação. Permitir registrar o que realmente aconteceu pode continuar existindo, mas a indicação prescrita precisa refletir a semana escolhida.
- **Descartado:** não é confusão entre descanso prescrito e realizado: a prova verifica a orientação e mantém o descanso realizado em branco. A liberdade de registrar avulsos também não explica mostrar uma prescrição incorreta.

### T05 — P2 — Conteúdo digitado durante o envio pode ser limpo sem nunca ter sido enviado

- **Fonte:** profissional em [src/pages/Execucao.tsx:642](../src/pages/Execucao.tsx#L642)–666, campos de registro 691 em diante; aluno em [src/pages/TreinoAluno.tsx:1331](../src/pages/TreinoAluno.tsx#L1331)–1345 e 1013–1047.
- **Gatilho:** clicar em registrar/concluir enquanto o POST demora; continuar preenchendo a tela antes da resposta.
- **Causa:** o payload é um snapshot anterior ao `await`, mas o sucesso limpa o estado corrente. No profissional, campos de séries/data/notas permanecem editáveis durante o POST. No aluno, as séries são bloqueadas, porém o textarea de observações permanece editável.
- **Evidência:** terceiro teste em `audit-preview.local/treino/trainer-races.test.tsx`: enviar primeira série de 40 kg, digitar segunda série de 42 kg com a Promise pendente e resolver. O payload tem só uma série e o segundo campo volta a vazio. Terceiro teste em `audit-preview.local/treino/student-races.test.tsx`: observação de dor digitada durante “Concluindo...” desaparece e o payload enviado tem `notes=null`.
- **Impacto:** informação efetivamente digitada some após mensagem de sucesso; inclui relato de dor/cansaço ou séries adicionais.
- **Recomendação:** congelar todos os controles relevantes durante a gravação ou limpar somente o snapshot que foi confirmado, preservando alterações posteriores. A guarda precisa cobrir também notas, inclusão/remoção de exercícios e navegação de sessão.
- **Descartado:** não depende de erro do servidor, retry ou duas abas; basta um único envio bem-sucedido lento.

### T06 — P2 — Fila transforma falhas temporárias em rejeição definitiva sem nova tentativa

- **Fonte:** [src/features/workout/studentSession.ts:96](../src/features/workout/studentSession.ts#L96)–111, 148 e 163–175; limite temporário explícito em [supabase/migrations/0033_falha_e_correcao_de_sessoes.sql:390](../supabase/migrations/0033_falha_e_correcao_de_sessoes.sql#L390)–392.
- **Gatilho:** sincronizar um treino enquanto o servidor está temporariamente indisponível, a consulta excede seu tempo ou o aluno esgota o limite de gravações por hora.
- **Causa:** `isNetworkFailure` reconhece somente algumas mensagens textuais do fetch. Todo outro erro vira `item.error`, e itens com esse campo são ignorados em todos os flushes seguintes. A UI oferece descartar o aviso, não reenviar o conteúdo retido.
- **Evidência:** três testes em `audit-preview.local/treino/queue-transient.test.ts`: erro temporário de schema cache, timeout SQL e a própria mensagem local `muitas gravacoes; tente de novo mais tarde`. Depois de trocar o mock para sucesso e chamar flush novamente, a RPC continua com uma única tentativa. O caso de limite por hora é produzido literalmente pelo contrato SQL atual.
- **Impacto:** uma indisponibilidade transitória deixa a sessão eternamente fora do histórico; “vai subir sozinho” deixa de se cumprir após a recuperação do serviço. Em sessão concluída offline, o rascunho já foi removido e o único conteúdo remanescente está no item rejeitado.
- **Recomendação:** classificar erros de transporte/HTTP, códigos transitórios e limites temporários de forma explícita, com backoff e opção de tentar novamente. Reservar rejeição definitiva a regras que efetivamente não mudarão com o tempo. Preservar a proteção específica de sessão corrigida/revogada.
- **Descartado:** falha `Failed to fetch` simples já é tratada corretamente e não foi re-reportada. O problema são respostas temporárias reais do serviço, inclusive uma mensagem implementada pelo próprio banco.

### T07 — P2 — Renomear divisão não atualiza a sequência e pode zerar o volume de um treino válido

- **Fonte:** [src/pages/TreinoNovo.tsx:348](../src/pages/TreinoNovo.tsx#L348)–353 e 469–472; [src/features/workout/builder.ts:148](../src/features/workout/builder.ts#L148) e 234; [src/features/workout/volume/engine.ts:121](../src/features/workout/volume/engine.ts#L121).
- **Gatilho:** plano com divisão A e sequência explícita A/A; renomear A para C e salvar sem editar manualmente a sequência.
- **Causa:** `patchDay` altera o rótulo da divisão sem remapear `weeklySchedule`. `baseSchedule` filtra referências inválidas apenas para desenhar a UI. O snapshot e o payload continuam usando o array original. O motor ignora rótulos sem divisão correspondente e os SQLs de criação/edição persistem a sequência sem esse teste de integridade.
- **Evidência:** `audit-preview.local/treino/builder-schedule.test.tsx`, componente real: salvar A→C produz `days[0].label='C'`, `weeklySchedule=['A','A']`, `volume.perWeek[0].totalSets=0`, embora C mantenha quatro séries de supino.
- **Impacto:** volume/calibração do treino ficam incorretos e as superfícies divergem: editor filtra a sequência, contagem de sessões usa seu comprimento, aluno tem fallback para divisões existentes e detalhe/PDF podem conservar rótulos inexistentes. Excluir divisão com sequência explícita deixa referência órfã pelo mesmo padrão de mutação.
- **Recomendação:** remapear referências quando o rótulo muda e removê-las quando a divisão é excluída, preservando repetições e ordem. Validar a sequência efetivamente persistida antes do snapshot e no banco; usar uma fonte comum para a sequência exibida/calculada/salva.
- **Descartado:** não é uma duplicação voluntária de sessões nem uma sequência vazia; o exemplo começa com uma sequência válida e apenas renomeia sua divisão.

### T08 — P2 condicional — Leitura sem paginação de overrides pode amputar o plano ao salvar novamente

- **Fonte:** [src/features/workout/api.ts:165](../src/features/workout/api.ts#L165)–171 e 184; [src/features/workout/builder.ts:312](../src/features/workout/builder.ts#L312); [supabase/migrations/0030_treino_agrupamentos.sql:134](../supabase/migrations/0030_treino_agrupamentos.sql#L134) e 188.
- **Condição necessária:** o plano possuir mais overrides que o teto de linhas configurado no PostgREST. O teto real de produção não foi consultado nesta revisão. O exemplo usa 1.000 como configuração simulada; o defeito vale para qualquer teto finito menor que o resultado.
- **Gatilho:** plano válido com 52 semanas e 21 exercícios com ajustes por semana = 1.092 overrides. Abrir para editar, mudar somente o nome e salvar.
- **Causa:** `getWorkoutPlan` consulta todos os overrides em um SELECT sem paginação nem contagem exata; o editor trata o resultado cortado como completo. A gravação substitui todas as filhas, apagando ajustes que nunca foram carregados.
- **Evidência:** `audit-preview.local/treino/api-cardinality.test.ts` usa os métodos reais `getWorkoutPlan` → `planDetailToEditor` → `editorToSaveInput` → `updateWorkoutPlan`, com servidor simulado que corta SELECT a 1.000. Foram lidos 1.000 de 1.092, numa única chamada; o próximo `save_workout_plan` envia só esses 1.000. O schema permite 52 semanas e não limita a quantidade total de overrides a 1.000.
- **Impacto:** semanas finais perdem ajustes no próprio banco após edição aparentemente inofensiva; antes de salvar, PDF/editor também já usam um subconjunto incompleto.
- **Recomendação:** paginar com ordenação total ou ler o plano completo por uma RPC que forme seu snapshot; conferir cardinalidade antes de qualquer operação de substituição. Auditar também outras leituras sem paginação que alimentam editores destrutivos.
- **Classificação:** confirmado em configuração reproduzida; ocorrência em produção **inferida e dependente do teto real/volume dos planos**. Não houve inspeção ou mudança do banco remoto.
- **Descartado:** não confundir com paginação de histórico, que já usa loops/cursor. Aqui o problema é a coleção de overrides retornada como supostamente completa e reutilizada para substituição.

## Organização, acesso e ciclo de vida dos dados

### AB-01 — P2 — Falha transitória ao revalidar a organização desmonta qualquer formulário aberto

- **Local:** [src/features/organization/OrganizationProvider.tsx:63](../src/features/organization/OrganizationProvider.tsx#L63); consequência em [src/routes/RouteGuard.tsx:39](../src/routes/RouteGuard.tsx#L39).
- **Gatilho:** o usuário mantém um formulário aberto por mais de cinco minutos e volta ao app ou reconecta; a consulta da organização é revalidada e falha, mesmo com uma organização válida já carregada.
- **Causa:** o provider prioriza `query.isError` sobre `query.data.organization`. O TanStack Query conserva os dados anteriores quando um refetch falha, mas o provider declara erro global. O RouteGuard substitui toda a árvore de rotas pela tela de erro.
- **Prova:** `audit-preview.local/auth-banco/organization-refetch.test.tsx` usa OrganizationProvider e RouteGuard reais, com dados prévios no QueryClient e falha na fronteira do Supabase. O teste confirma simultaneamente organização preservada no cache, mensagem global exibida e desmontagem do formulário.
- **Impacto:** interrupção de qualquer fluxo autenticado e perda do estado que existe apenas na tela. O rascunho pode reduzir a perda em algumas telas, mas não preserva todos os formulários nem o que ainda aguarda debounce. O problema independe do reset particular de AvaliadoForm.
- **Recomendação:** distinguir falha no primeiro carregamento de falha de revalidação. Preservar a árvore e oferecer aviso/retry quando o erro for transitório e a identidade/organização previamente validadas continuarem conhecidas; revogação efetiva de acesso deve seguir bloqueando. A RLS permanece sendo a autorização da requisição.
- **Confiança:** reproduzido. Não significa que o refetch de dados idênticos apague campos; o gatilho deste achado é erro da consulta global.

### AB-02 — P2 — Respostas tardias repovoam o armazenamento do aluno após purga por revogação

- **Locais:** [src/pages/TreinoAluno.tsx:1514](../src/pages/TreinoAluno.tsx#L1514) e [src/pages/TreinoAluno.tsx:1525](../src/pages/TreinoAluno.tsx#L1525) (`Historico.carregarMais`); [src/pages/TreinoAluno.tsx:1660](../src/pages/TreinoAluno.tsx#L1660) e [src/pages/TreinoAluno.tsx:1663](../src/pages/TreinoAluno.tsx#L1663) (`Anteriores.abrir`). Persistência sem invalidação própria em [src/features/workout/studentStore.ts:272](../src/features/workout/studentStore.ts#L272) e [src/features/workout/studentStore.ts:286](../src/features/workout/studentStore.ts#L286).
- **Gatilho:** a página solicita mais histórico ou um plano antigo; antes da resposta, a revalidação do acesso detecta revogação, limpa o dispositivo e desmonta o conteúdo. A requisição antiga termina depois.
- **Causa:** esses caminhos não verificam montagem/epoch de acesso após o await. `pedidoAtual` só diferencia pedidos de planos enquanto o componente existe; desmontar Anteriores não o incrementa. Os escritores de cache fazem `idbSet` sem checar se o escopo foi invalidado.
- **Prova:** `audit-preview.local/auth-banco/student-late-cache.test.tsx` reproduz os dois fluxos na página real. O teste aciona `online`, faz a revalidação devolver `null`, espera a tela de link inválido e a purga, libera a Promise antiga e comprova uma chamada posterior a `writeCachedHistory`/`writeCachedPlan`. O código real desses escritores abre uma nova transação de escrita no IndexedDB.
- **Impacto:** histórico/cargas ou prescrição anterior voltam a existir fisicamente no aparelho depois da limpeza prometida. O token **não** é restaurado por esses dois caminhos; não foi demonstrada reabertura automática, leitura por outro token ou contorno da autorização do servidor.
- **Recomendação:** unificar cancelamento/invalidação de todas as escritas do aluno, com epoch/tombstone por escopo conferido também na fronteira de persistência. Incluir testes de resposta tardia após revogação e saída do dispositivo. Apenas guardar `mounted` antes de iniciar uma escrita ainda exige tratar a corrida entre a checagem e a conclusão da escrita.
- **Confiança:** chamadas tardias reproduzidas; consequência persistente decorre diretamente do escritor real. A sugestão inicial veio da revisão de treino e foi validada independentemente aqui.

### AB-03 — P2 condicional — Anotações preservadas pela migration 0023 ficam fora da exportação e da exclusão definitiva

- **Local:** [supabase/migrations/0023_integrity_concurrency.sql:48](../supabase/migrations/0023_integrity_concurrency.sql#L48); exportação em [supabase/migrations/0020_integrity_privacy.sql:1257](../supabase/migrations/0020_integrity_privacy.sql#L1257); exclusão em [supabase/migrations/0020_integrity_privacy.sql:1004](../supabase/migrations/0020_integrity_privacy.sql#L1004).
- **Gatilho necessário:** a deduplicação da 0023 encontrou folhas de anotação duplicadas e moveu alguma para `posture_annotations_shadowed`. Não foi consultado se produção tem linhas nessa condição.
- **Causa:** a tabela de resguardo tem `photo_id` e `org_id` como UUIDs sem foreign keys nem outro vínculo de eliminação. A exportação só percorre `posture_annotations`, e a finalização exclui o titular confiando nos cascades. Nenhuma migration posterior integra a tabela de resguardo a esses dois fluxos.
- **Prova:** `audit-preview.local/auth-banco/shadowed-lifecycle.sql` cria a condição histórica de forma fictícia, chama as RPCs reais e desfaz tudo com ROLLBACK. Saída em `audit-preview.local/auth-banco/shadowed-lifecycle.log`: `export_inclui_resguardo=false`, `titulares_restantes=0`, `fotos_restantes=0`, `anotacoes_resguardo_restantes=1`.
- **Impacto:** um registro de anotação já existente pode ficar retido sem a referência viva à foto após a exclusão definitiva, e não é entregue no arquivo que promete o snapshot completo. A tabela é negada a anon/authenticated, portanto não se trata de exposição pública.
- **Recomendação:** conferir administrativamente a existência do passivo e definir sua recuperação/eliminação vinculada ao titular, incluindo exportação quando houver informação preservada. Corrigir em nova migration, preservando a finalidade original do resguardo; não apagar o passivo indiscriminadamente.
- **Confiança:** comportamento reproduzido no schema completo; impacto em produção depende da existência de duplicatas migradas.

### AB-04 — P2 — Recarregar a recuperação de senha perde o modo de definir nova senha

- **Local:** [src/features/auth/AuthProvider.tsx:24](../src/features/auth/AuthProvider.tsx#L24) e [src/features/auth/AuthProvider.tsx:109](../src/features/auth/AuthProvider.tsx#L109); escolha da tela em [src/pages/RecuperarSenha.tsx:13](../src/pages/RecuperarSenha.tsx#L13).
- **Gatilho:** o usuário abre o link de recuperação, vê Nova senha e recarrega a página antes de concluir, ou o navegador descarta a aba e a restaura.
- **Causa:** `isRecovering` só vive em useState e só se torna verdadeiro no evento PASSWORD_RECOVERY. O SDK limpa o fragmento do link após consumir a sessão. Na restauração, getSession/INITIAL_SESSION recuperam a sessão, mas não recriam esse evento de consumo do link.
- **Prova:** `audit-preview.local/auth-banco/recovery-reload.test.tsx` usa AuthProvider e RecuperarSenha reais. PASSWORD_RECOVERY abre o campo Nova senha; uma nova montagem com a mesma sessão válida volta a mostrar o formulário E-mail para pedir outro link. O SDK instalado confirma o caminho: `node_modules/@supabase/auth-js/src/GoTrueClient.ts:717`, limpeza da URL em `:3960` e INITIAL_SESSION em `:4355`.
- **Impacto:** fluxo de recuperação interrompido; o usuário precisa solicitar outro link embora a sessão de recuperação ainda exista. Não foi demonstrado contorno de MFA ou troca de senha não autorizada.
- **Recomendação:** preservar/restaurar o estado do fluxo de recuperação de forma vinculada à sessão e eliminá-lo após conclusão, logout ou mudança de identidade. Cobrir reload/restauração de aba além do recebimento inicial do evento.
- **Confiança:** reproduzido no cliente, sustentado pelo ciclo de eventos do SDK instalado.

### AB-05 — P3 — Logo WebP aceito em Ajustes não é suportado pelo gerador de PDF

- **Locais:** [src/features/organization/logo.ts:10](../src/features/organization/logo.ts#L10) e [src/features/organization/logo.ts:55](../src/features/organization/logo.ts#L55); consumo em [src/features/reports/pdfTheme.tsx:211](../src/features/reports/pdfTheme.tsx#L211).
- **Gatilho:** enviar um logo WebP válido e gerar avaliação, evolução ou treino em PDF.
- **Causa:** o upload aceita WebP e a preparação do PDF transforma o Blob em data URL mantendo `image/webp`, sem converter. A versão instalada de `@react-pdf/image` aceita JPEG, PNG e SVG, mas recusa WebP antes de decodificar os bytes.
- **Prova:** execução direta do resolvedor instalado com uma data URI WebP devolveu `Base64 image invalid format: webp`. A allowlist está em `node_modules/@react-pdf/image/lib/index.js:199` e a rejeição em `:240`. O layout captura a exceção e registra warning em `node_modules/@react-pdf/layout/lib/index.js:917`, prosseguindo sem a imagem.
- **Impacto:** os três PDFs deixam de apresentar o logo de uma organização cujo formato foi aceito pelo próprio aplicativo; os demais dados continuam sendo gerados.
- **Recomendação:** converter WebP para PNG antes de passá-lo ao PDF, ou uniformizar os formatos aceitos pela configuração e pelo renderer. Validar com logo de cada formato aceito.
- **Confiança:** contrato incompatível comprovado com a dependência instalada; não é inferência sobre suporte futuro da biblioteca.

## Cadastro, rascunhos e passagem do tempo

### R01 — P2 — Atualização do cadastro pode apagar a edição aberta ou sobrescrever outro profissional

**Confirmado por duas provas de componente e leitura do contrato da API.** Fontes: [src/pages/AvaliadoForm.tsx:79](../src/pages/AvaliadoForm.tsx#L79), [src/features/subjects/schema.ts:123](../src/features/subjects/schema.ts#L123) e [src/features/subjects/api.ts:49](../src/features/subjects/api.ts#L49).

O formulário executa `reset(subjectToForm(subjectQuery.data))` sempre que chega um objeto de cadastro alterado. Não distingue a carga inicial de um refetch enquanto a pessoa digita. Se outra pessoa muda a altura e essa alteração chega durante a edição do telefone, o telefone digitado volta ao valor salvo anteriormente.

Existe também o caminho inverso: se o refetch ainda não chegou, salvar apenas o telefone envia o cadastro inteiro da abertura, incluindo altura e observações antigas. `updateSubject` filtra apenas por ID, sem comparar a versão-base. A alteração recente da outra pessoa pode ser substituída silenciosamente.

**Reprodução:** abrir o cadastro com altura 168 e telefone antigo; digitar outro telefone; fazer a query entregar altura 170 e novo `updated_at`. A prova observa o telefone digitado desaparecer. Em outro teste, salvar só o telefone envia altura 168 e observações antigas, sem versão. Um refetch com dados rigorosamente idênticos não basta: a primeira variante exige mudança efetiva no objeto retornado.

**Correção indicada:** inicializar por identidade/versão de abertura, preservar campos alterados e usar controle de concorrência no salvamento, como nos editores longos já protegidos. Enviar somente campos alterados reduz sobrescritas, mas não resolve sozinho dois usuários editando o mesmo campo.

Provas locais: `audit-preview.local/root/cadastro.audit.test.tsx`.

### R02 — P2 — Os últimos 600 ms do rascunho podem sumir ao sair da tela

**Confirmado com o hook real, relógio controlado e localStorage.** Fontes: [src/lib/draft.ts:11](../src/lib/draft.ts#L11), [src/lib/draft.ts:202](../src/lib/draft.ts#L202) e [src/components/UnsavedChanges.tsx:35](../src/components/UnsavedChanges.tsx#L35).

`useFormDraft` agenda a persistência com debounce de 600 ms. O cleanup só cancela o timer; não descarrega o valor pendente. Ao desmontar antes desse intervalo, a versão mais recente não chega ao armazenamento, embora a interface informe que as alterações ficam guardadas no aparelho por 24 horas.

**Reprodução:** persistir um valor inicial, alterar o campo, avançar 100 ms e desmontar. Mesmo após mais um segundo, o armazenamento contém o valor anterior. O controle que espera 650 ms mantém o valor novo. A perda confirmada é a janela pendente, e não necessariamente todo o formulário.

**Impacto:** navegação rápida e desmontagem causada por falha de revalidação podem perder a última frase, colagem ou alteração. O rascunho específico do aluno já tem uma descarga própria; este achado é sobre o hook compartilhado dos formulários.

**Correção indicada:** descarregar o último estado pendente ao sair e tratar explicitamente sucesso, descarte, mudança de identidade e expiração. Um cleanup que sempre grava, sem essas distinções, pode ressuscitar um rascunho concluído ou apagado.

Provas locais: `audit-preview.local/root/draft.audit.test.tsx`.

### R03 — P3 — Dashboard e agenda não acompanham o relógio enquanto permanecem abertos

**Confirmado em duas telas reais com relógio controlado.** Fontes: [src/pages/Dashboard.tsx:46](../src/pages/Dashboard.tsx#L46) e [src/pages/Agenda.tsx:78](../src/pages/Agenda.tsx#L78).

O Dashboard congela `new Date()` em um `useMemo` sem dependências. Ao atravessar a meia-noite, a data apresentada e a janela de consultas continuam sendo as do dia anterior, mesmo que outro estado provoque renderização. A Agenda separa próximos/anteriores em um memo que depende apenas dos dados; a passagem do horário do compromisso não refaz a separação.

**Reprodução:** manter o Dashboard montado de 08/09 para 09/09 e renderizar novamente; ele continua em 08/09. Na Agenda, passar do término de um compromisso e editar outro campo; o compromisso continua em próximos. Um refetch idêntico pode preservar a referência dos dados e não resolver o segundo caso.

**Correção indicada:** fornecer um relógio reativo com granularidade apropriada, renovado também ao retomar a aba. Recalcular a janela diária e as classificações dependentes do horário.

Provas locais: `audit-preview.local/root/tempo.audit.test.tsx`.

## Riscos previstos por inferência

### I01 — Backup de banco e arquivos não representa necessariamente o mesmo instante

**Inferência baseada no fluxo; não foi feito um restore concorrente de produção.** Fontes: [.github/workflows/backup.yml:71](../.github/workflows/backup.yml#L71), [.github/workflows/backup.yml:75](../.github/workflows/backup.yml#L75) e [scripts/backup-storage.mjs:38](../scripts/backup-storage.mjs#L38).

O workflow faz o dump do banco e depois lista/baixa o Storage. Uma foto pode estar referenciada no snapshot do banco e ser excluída antes da listagem dos objetos. Nesse caso, o arquivo não entra no manifesto; conferir hashes de tudo o que foi listado não detecta a referência sem arquivo no dump anterior. Uma exclusão depois da listagem tende a falhar no download, que já é tratado; a janela relevante é antes da listagem.

**Consequência prevista:** um artifact que passa nas verificações atuais pode restaurar metadados apontando para um arquivo ausente. Não significa que os backups existentes estejam corrompidos.

**Validação/correção indicada:** incluir no restore drill uma comparação das referências do dump com o manifesto e cobrir upload/exclusão durante a captura. Definir uma estratégia explícita para a janela entre os dois sistemas, como retenção temporária de objetos excluídos ou uma captura com escritas coordenadas.

## Padrões que podem produzir os próximos problemas

1. **Estado local sem identidade vinculada.** Um componente pode sobreviver à troca dos parâmetros da rota. URL, formulário, erro, confirmação e resposta de mutation precisam continuar associados ao titular/recurso que os originou. Um `useState` isolado não acompanha essa identidade automaticamente.
2. **Serialização confundida com controle de concorrência.** Locks e revisões crescentes ordenam operações; não comprovam que a pessoa editou a versão mais recente. Elevar a revisão de um snapshot antigo pode torná-lo justamente o vencedor.
3. **Sucesso de uma requisição confundido com sucesso do estado atual.** O servidor confirma o payload enviado antes do `await`. Se a tela mudou depois, limpar tudo elimina conteúdo que nunca foi confirmado.
4. **Gravação atômica com leitura fragmentada.** Uma transação correta no banco não transforma várias consultas HTTP em um snapshot único. Cabeçalho e filhas precisam ser lidos de forma coerente ou validados por versão.
5. **Limpeza sem invalidar produtores pendentes.** Apagar cache não basta se uma Promise iniciada antes ainda pode gravar de novo. A identidade/geração deve ser verificada imediatamente antes da escrita persistente.
6. **Coleção parcial tratada como completa.** O risco mais grave da falta de paginação aparece quando uma leitura cortada alimenta uma operação que substitui todas as filhas. Contagens e gráficos errados podem ser o primeiro sinal de uma perda posterior.

Uma cadeia especialmente provável é: conexão instável → revalidação da organização falha → formulário desmonta → debounce pendente é cancelado. Outra é: plano regravado → IDs novos → migração só do rascunho ativo → outra divisão fica inacessível ou uma cópia antiga reaparece. As peças dessas cadeias foram exercitadas separadamente; não foi executado um teste único de toda a cadeia em um navegador real.

## Ordem sugerida de correção

1. Vínculo entre titular, rota e links públicos; concorrência do parecer médico; prescrição efetiva na execução profissional.
2. Inicialização e identidade dos rascunhos de treino; conflito entre abas; migração de todas as divisões; classificação de erros temporários da fila.
3. Preservação da edição durante refetch/envio; descarregamento de rascunhos; coerência das leituras compostas; invalidação de respostas após limpeza.
4. Integridade da sequência do treino e paginação antes de substituição; ciclo de vida das anotações resguardadas; recuperação de senha.
5. Compatibilidade de logo, relógio das telas e verificação referencial dos backups.

Cada correção deve ganhar um teste que reproduza a sequência defeituosa antes de alterar a implementação. Para as falhas de persistência, o critério de sucesso deve incluir o que ficou armazenado e o que foi enviado, além do texto visível na tela.

## Cobertura e evidências

| Frente | O que foi examinado | Tipo de verificação |
| --- | --- | --- |
| Autenticação e organização | Sessão, recuperação, MFA, guarda de rotas, revalidação, escopos privados, logout, membros e último owner | Código, SDK instalado, componentes reais e SQL/RLS nos cenários existentes |
| Cadastro, agenda e dashboard | Criação/edição, consultas, resumos, compromissos, passagem de data, erros e recuperação | Leitura das páginas/APIs/hooks; provas de componente com relógio e refetch controlados |
| Avaliação física e motor | Protocolos, entradas, médias, snapshots, edição, concorrência, histórico e comparação | Testes existentes, resultados calculados pelo motor real e provas de integração do formulário |
| Anamnese e consentimento | Formulário profissional/público, triagem, parecer, intake, aceite/rejeição, termo e exportação | Fluxos cliente, contratos e triggers; provas de componentes e SQL |
| Postura | Upload principal/thumb, rollback, remoção verificada, sessão, imagens assinadas, anotações e detecção | Leitura dos fluxos; corrida de edição reproduzida, guardas de Storage considerados |
| Treino profissional | Builder, divisões, semanas, agrupamentos, sequência, volume, catálogo, publicação e edição de sessão | Leitura integral das páginas centrais, APIs e contratos; provas de componente e serialização |
| Aluno e funcionamento offline | Cache/rede, rascunho, revisão, duas abas, remapeamento, fila, histórico, correção e revogação | Promises controladas, React real, adaptador mínimo de IndexedDB e leitura dos produtores SQL |
| PDFs e exportação | Avaliação, evolução, treino, transporte de identidade/ressalvas, logo, CSV e prompts | Contratos, payloads e dependência instalada; layout Clareza preservado |
| Infraestrutura | Workflows de validação/deploy/backup/retenção, gates de schema/build, PWA e limpeza de arquivos | Leitura de configuração/scripts e validação local; sem deploy, restore remoto ou teste de carga |

### Validação executada

- **`npm run check` aprovado:** lint, **776 testes em 99 arquivos**, build e orçamento de build. Entrada de produção dentro do orçamento: 607.150 bytes, 182.644 bytes gzip; precache 1.916.096 bytes em 121 arquivos.
- **34 provas adicionais em 18 arquivos Vitest**, em configurações isoladas: raiz (6 provas/3 arquivos), treino (15/7), avaliações (9/5) e autenticação/banco (4/3). São cenários que afirmam o defeito atual, incluindo controles e corroboração independente de links.
- **220 verificações pgTAP aprovadas em oito arquivos existentes:** 0020 (39), 0022 (12), 0026 (7), 0027 (24), 0028 (43), 0029 (17), 0032 (24) e 0033 (54).
- **Três cenários SQL adicionais**, com dados fictícios e `ROLLBACK`: parecer sobrescrito, snapshot calculado com dados do titular errado e ciclo de exportação/exclusão de anotações resguardadas.
- Incompatibilidade WebP confirmada por chamada direta ao resolvedor de imagens instalado.

O PostgreSQL 18 foi inicializado em um diretório novo de auditoria, recebeu as migrations 0001–0033 e foi encerrado ao final. Seu bootstrap mínimo de Auth/Storage permitiu exercitar funções, RLS e triggers; não reproduz o serviço completo do Supabase, a API de Storage ou o GoTrue em produção.

### Artefatos locais e reprodução

As provas, relatórios de trabalho e logs estão em `audit-preview.local/`. Essa pasta é ignorada pelo Git e serve como evidência disponível neste workspace; não acompanha uma cópia nova do repositório. O presente documento é o registro durável, com gatilhos, resultados e fontes para reconstruir as provas. Nenhum teste novo foi incluído na suíte normal para aprovar permanentemente um comportamento defeituoso.

Comandos independentes, de uma linha, para o CMD na raiz do projeto:

```cmd
npx vitest run --config audit-preview.local/root/vitest.config.mts
npx vitest run --config audit-preview.local/treino/vitest.config.ts
npx vitest run --config audit-preview.local/avaliacoes/vitest.config.ts
npx vitest run --config audit-preview.local/auth-banco/vitest.audit.config.ts
```

Os scripts SQL de prova exigem recriar um banco descartável com o bootstrap correspondente. Eles não são migrations de correção e não devem ser usados como comandos de produção.

### Hipóteses descartadas e limites da conclusão

- A suposta exclusão de sessão enquanto outra foto já tinha terminado o upload não resistiu à revisão dos triggers da 0020. O teste inicial omitia essa defesa e foi removido. Uma corrida mais estreita de bytes ainda em voo não foi demonstrada.
- Não foram repetidos como bugs atuais o gate de MFA administrativo/catálogo já corrigido, a publicação de treino em duas requisições, a versão-base móvel dos editores longos, a ausência de avulsos no autosave, a paginação de circunferências nem o flake do teste de semana corrigido no commit revisado.
- A hipótese simples de corrida entre conceder e revogar consentimento não foi comprovada depois de considerar os locks e a ordem das instruções SQL. Não integra os achados.
- O teste que simula uma resposta cortada não mede o limite atual de produção. A prova de anotações resguardadas não afirma que a migration encontrou duplicatas no banco remoto.
- Não houve ensaio em aparelho físico, Safari/IndexedDB real, duas abas de navegador real, rede móvel, teste de carga ou varredura externa de segurança. As navegações de links foram exercitadas com React Router e cache reais em jsdom.
- A revisão do motor procurou inconsistências de cálculo e de integração no código; não revalidou literatura clínica nem estabelece validade médica das equações. A perda de ressalvas refere-se aos avisos já produzidos pelo próprio aplicativo.
- Os PDFs não foram redesenhados nesta auditoria. A conferência visual do Clareza consta da entrega anterior; as conclusões novas sobre PDF aqui são de identidade, conteúdo e compatibilidade de imagem.

Ausência de achado em uma área significa que nenhum defeito adicional foi demonstrado neste recorte. A suíte verde e a inspeção não constituem garantia de ausência de bugs ou de vulnerabilidades.
