# Correções da auditoria de 06/10/2026

O relatório da auditoria ([ANALISE_APP_2026-10-06.md](ANALISE_APP_2026-10-06.md)) apontou 12 defeitos sobre a base `5a50933`. Antes de corrigir, cada um foi conferido no código e as provas do relatório foram rodadas de novo: **os 12 se confirmam**. A gravidade de vários estava acima do que o cenário justifica (tabela abaixo). O relatório fica como registro do diagnóstico; as provas dele afirmam o defeito, e as regressões permanentes listadas aqui exigem o comportamento correto. Cada teste novo também foi rodado contra o código anterior, para confirmar que falha nele.

Exige a migration **0045** (A01 e A10). O gate de deploy passa a esperar `0045`: aplicar no dashboard **antes** do push. Nenhuma assinatura de função mudou, então não é preciso regenerar `database.types`.

**Validação:** lint, **1133 testes em 135 arquivos**, build e orçamento verdes. **438 verificações pgTAP em 20 suítes** com 0001–0045 num PostgreSQL 18 descartável; a suíte da 0045 rodou também sobre as funções da 0044 e reprovou exatamente as 6 verificações dos defeitos, com as de controle passando. PDFs: as nove amostras (39 páginas) sem texto fora da área útil, sem sobreposição e sem título ou cabeçalho de tabela sozinho no pé da folha.

## Gravidade revista

| Código | Relatório | Revista | Por quê |
| --- | --- | --- | --- |
| A01 | Crítica | Alta | Falha de autorização e de autoria, mas só pelo portador do link, sobre o treino dele, com chamada montada à mão. O app nunca faz isso. |
| A02 | Crítica | Alta | O treino digitado se perde, mas só quando o profissional revoga ou reemite o link com a tela do aluno aberta. |
| A03 | Crítica | Alta | Perde a sessão em andamento num caso plausível: editar o plano em outra aba no meio do atendimento. |
| A04 | Crítica | Média | Exige relógio adiantado e link no fim da validade (180 dias). No vencimento de verdade, o rascunho também se perdia sem cópia; corrigido junto. |
| A05 | Crítica | Baixa | Só se perde o que é digitado durante o segundo do envio. |
| A06 | Alta | Alta | Mantida: percentual de gordura errado no laudo de todo homem avaliado pelo US Navy. |
| A07 | Alta | Média | Exige resposta perdida e tela reaberta antes da nova tentativa. |
| A08 | Alta | Alta | Mantida, e mais comum do que o relatório diz: acontecia também com internet. |
| A09 | Alta | Média | Exige resposta perdida num "salvar e continuar depois". |
| A10 | Alta | Média | Data um dia adiante só na anamnese enviada entre 21h e meia-noite. |
| A11 | Média | Média | Raro (30 envios por hora pelo mesmo link), mas a sessão nunca mais subia. |
| A12 | Baixa | Baixa | Só leitura do PDF. |

## O que mudou

| Código | Correção | Prova permanente |
| --- | --- | --- |
| A01 | Migration 0045: `submit_workout_session` recusa, antes de qualquer escrita, a sessão que não é do aluno (`registro de treino indisponivel`); `get_workout_for_link` só mostra a referência (`client_ref`) das sessões do aluno, que é o que a tela usa para não contar duas vezes. A chave continua no pacote, nula nas do profissional. | [SQL 0045](../supabase/tests/0045_auditoria_2026_10_06.test.sql): referência fora do pacote, envio recusado inclusive com revisão maior, séries, observação e autoria do profissional intactas; a sessão do aluno segue idempotente e com a referência no pacote. |
| A02 | Na recusa por link inválido, a sessão não sai mais da fila antes da limpeza, e o envio recusado vai direto para o resgate (`invalidarAcesso(true, recusados)`), mesmo com o aparelho sem fila. A tela mostra "Copiar dados" antes de apagar. | [Continuidade do aluno](../src/pages/TreinoAluno.continuidade.test.tsx): página, fila e IndexedDB reais; a cópia traz a carga digitada, e depois o aparelho fica limpo. |
| A03 | Na Execução, quando o plano é regravado com a tela aberta (ids novos), o que está preenchido é remapeado pela mesma identidade da restauração do rascunho (rótulo da divisão e exercício do catálogo), ainda na renderização: a tela e o rascunho vazios nunca chegam a existir. Aviso "O plano foi alterado em outra tela ou aparelho", com as séries que ficaram de fora, se houver. | [Execução](../src/pages/Execucao.test.tsx), "continuidade da sessão": a carga continua na tela depois da releitura do plano e volta ao reabrir. |
| A04 | O relógio do aparelho deixou de decidir sozinho. Ao abrir com o pacote vencido pelo relógio, o treino guardado não aparece e quem decide é o servidor; sem rede, vale a validade guardada. Pacote entregue pelo servidor com o relógio dizendo "vencido" marca o relógio como adiantado, e daí em diante só o servidor diz quando venceu. O alarme da validade revalida em vez de apagar. O resgate antes da purga passou a incluir os rascunhos (marcados "não concluído"). | [Continuidade do aluno](../src/pages/TreinoAluno.continuidade.test.tsx): relógio dois minutos adiantado abre o treino com o rascunho; sem rede, a limpeza oferece copiar o rascunho. [TreinoAluno](../src/pages/TreinoAluno.test.tsx) ajustado: cache vencido consulta o servidor. |
| A05 | O formulário inteiro da anamnese fica travado durante o envio (`fieldset disabled`), como o cartão de parecer médico já fazia. | [Envio da anamnese](../src/pages/AnamneseNova.envio.test.tsx): campos, data e confirmações travados até a resposta. |
| A06 | US Navy com o sítio de cada sexo (Hodgdon & Beckett, 1984): homem, abdômen na altura do umbigo; mulher, cintura no ponto mais estreito e quadril (`circumferenceSitesFor`). Motor 1.2.0; laudos antigos mantêm o snapshot. O formulário diz onde medir e, ao editar uma avaliação masculina antiga calculada com a cintura, avisa que é preciso informar o abdômen e que o percentual será recalculado. | [Registry](../src/features/assessment/protocols/registry.test.ts), [domínio](../src/features/assessment/protocols/domain.test.ts) e [formulário](../src/pages/AvaliacaoNova.navy.test.tsx): 85 cm de cintura e 95 cm de abdômen dão 23,2% (antes 16,1%); mudar só a cintura não muda o resultado do homem, nem o abdômen o da mulher. |
| A07 | A referência da tentativa de gravar (0043) vai para o rascunho da Execução, com a divisão pelo rótulo, que sobrevive à regravação do plano. Reabrir a tela depois de uma resposta perdida reencontra a mesma sessão. | [Execução](../src/pages/Execucao.test.tsx): a segunda tentativa, depois de fechar e reabrir, usa a mesma referência. |
| A08 | As conclusões que o pacote ainda não conhece passaram a morar na página (sobrevivem à troca de seção) e somam as que estão na fila do aparelho (sobrevivem a recarregar sem internet). A fila é lida antes de mostrar o treino guardado. O pacote é rebuscado ao concluir com internet e quando a fila sobe. | [Continuidade do aluno](../src/pages/TreinoAluno.continuidade.test.tsx): semana mantida depois do Histórico, com e sem internet; segunda sessão gravada na semana 2; recarga sem internet; sessão no pacote e na fila contada uma vez. |
| A09 | Conflito de versão ao salvar a sessão continuada abre um aviso com duas saídas: "Salvar o que está nesta tela" (lê a versão atual do servidor e grava por cima) e "Abrir a versão salva". Antes a mensagem mandava reabrir, e reabrir trazia a mesma versão velha do rascunho. | [Execução](../src/pages/Execucao.test.tsx): resposta perdida, conflito, e as duas saídas. |
| A10 | Migration 0045: `accept_anamnese_intake` grava a data civil de São Paulo (`submitted_at at time zone 'America/Sao_Paulo'`), não o cast pelo fuso da sessão do banco (UTC). | [SQL 0045](../supabase/tests/0045_auditoria_2026_10_06.test.sql): envio às 22h30 de 05/10, sessão do banco em UTC, anamnese de 05/10. |
| A11 | "muitas gravacoes" (a cota de 30 envios por hora do link, 0039) passou a ser erro passageiro: a sessão fica na fila e sobe depois da janela. A sessão que a versão anterior marcou como recusada volta a subir sozinha, e a tela a mostra como "aguardando", não como "não foi enviado". | [Continuidade do aluno](../src/pages/TreinoAluno.continuidade.test.tsx): cota, nova tentativa depois de duas horas, item antigo e o aviso na tela. |
| A12 | No PDF de treino, a divisão que parte tem o título fora do contêiner da tabela, e a janela do título cobre o cabeçalho e o primeiro bloco que não se parte. Um marcador de altura zero no começo da seção cobre a primeira divisão. | [Paginação do plano](../src/features/reports/workoutPdf.paginacao.test.ts): sete alturas diferentes do treino A, conferindo pelo texto de cada página que o título nunca fica sem o primeiro exercício e o cabeçalho nunca fica sozinho. |

## Achados no caminho

- **A08 também com internet.** Concluir com internet, abrir o Histórico e voltar fazia a semana e a divisão sugeridas voltarem até o pacote ser rebuscado. Reproduzido contra o código anterior (semana 1 no lugar de 2).
- **Por que o título do PDF ficava sozinho.** Os PDFs usam o paginador antigo do react-pdf (o novo é opcional). Nele, o `minPresenceAhead` não vale para o primeiro filho de um contêiner, e o elemento que quebra leva junto para a página de cima os irmãos fixos. A primeira tentativa de correção (um marcador dentro do cartão) moveu o título, mas deixou o cabeçalho da tabela, que é fixo, sozinho no pé da folha; a conferência por coordenada pegou. Os comentários do PDF de avaliação que explicavam a regra de outro jeito foram corrigidos.
- **Lint local.** O ESLint passou a ignorar as pastas `*.local` (amostras de PDF, provas de auditoria), que ficam fora do git: o lint local reprovava nas provas da auditoria, e o CI nunca as vê.
- O exemplo do gerador de migration de vídeos sugeria 0045; agora sugere 0046.

## Fica com o usuário

1. **Aplicar a 0045** no SQL Editor do Supabase e só depois fazer o push. Ela troca o corpo de três funções e o carimbo; não mexe em tabela, policy ou dado.
2. **Anamneses já aceitas com a data do dia seguinte** (A10) não foram corrigidas: a 0045 não altera dado existente. Consulta só de leitura para saber se há alguma:
   `select a.id, a.assessed_at, (i.submitted_at at time zone 'America/Sao_Paulo')::date as data_correta from public.anamneses a join public.anamnese_intakes i on i.resulting_anamnese_id = a.id where a.assessed_at <> (i.submitted_at at time zone 'America/Sao_Paulo')::date;`
3. **Avaliações US Navy masculinas calculadas com a cintura** (A06) mantêm o laudo como foi emitido. Consulta só de leitura:
   `select a.id, s.full_name, a.assessed_at from public.assessments a join public.subjects s on s.id = a.subject_id where a.protocol_id = 'usNavy' and s.sex = 'M' and a.results->'inputs'->'circumferencesCm' ? 'waist' and not (a.results->'inputs'->'circumferencesCm' ? 'abdomen');`
   Para recalcular, é preciso medir o abdômen na altura do umbigo; a cintura antiga não deve ser reinterpretada como abdômen.

## Limites

- As duas suspeitas do relatório (S01, transação do IndexedDB sem resposta no Safari; S02, troca de token durante uma purga já iniciada) continuam sem reprodução e não foram tratadas.
- As provas da tela do aluno rodam em jsdom com fake-indexeddb, não em iPhone ou Android.
- O banco descartável usa stubs de Auth e Storage; o Supabase completo roda no CI.
