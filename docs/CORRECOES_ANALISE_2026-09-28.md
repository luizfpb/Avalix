# Correções da análise de 28/09/2026

Correção dos 14 itens da revisão feita em 28/09/2026 sobre a base `6d4b433`. Dois
defeitos da tela do aluno (itens 2 e 3) foram reproduzidos por teste antes da
correção; os demais foram confirmados lendo o código e o SQL.

Exige a migration **0039**. O gate de deploy passa a esperar `0039`.

## O que mudou

### Prioridade alta

1. **Execução do profissional com rascunho e aviso de saída.** A sessão ficava
   só na memória: tocar em "Início" na barra do celular, o Android descartar a
   aba ou tocar em "Atualizar" no aviso de versão nova apagava tudo sem
   perguntar. Agora o formulário usa o mesmo rascunho dos outros formulários
   longos (24 horas, escopo usuário + organização, apagado no logout), inclusive
   o instante do cronômetro, e pergunta antes de sair. Se o plano for regravado
   nesse intervalo, as séries são remapeadas pela divisão e pelo exercício do
   catálogo, e as que não têm para onde ir são contadas no aviso
   (`features/workout/execucaoDraft.ts`).
2. **Aluno: a mesma sessão não é mais contada duas vezes.** Concluir a sessão que
   tinha sido salva com "continuar depois", ou concluir depois de o pacote ser
   rebuscado, somava a sessão de novo: a tela anunciava a semana fechada e a
   divisão seguinte um treino antes da hora. As conclusões locais agora carregam
   o `client_ref`, e o pacote da 0039 traz o `client_ref` de cada sessão: a que
   já aparece no servidor deixa de ser contada no aparelho.
3. **Aluno: a sensação volta com o rascunho.** Reabrir a página perdia a carinha
   escolhida, e o autosave gravava `feel: null` por cima dela.
4. **Menores de idade sem faixa de adulto.** IMC (OMS) e gordura corporal (ACE)
   deixam de ser classificados abaixo de 18 anos, na tela, na evolução, no laudo
   PDF, no cartão de origem do treino e no resumo para IA. O laudo explica que a
   referência é a curva por idade (IMC-para-idade). A idade é a da data da coleta.
   Regra e justificativa em `features/assessment/adultReference.ts`.

### Prioridade média

5. **Data da sessão acompanha o dia.** Nas duas telas, a data de uma sessão nova
   ficava presa no dia em que a tela abriu. Agora segue o relógio até alguém
   escolher outra data; sessão em andamento (rascunho) não muda.
6. **Sessão em andamento separada da concluída (0039).** "Parar por aqui e
   continuar depois" continua gravando no servidor, mas com
   `workout_logs.in_progress = true`: não conta na adesão, não fecha a semana do
   mesociclo e não avança a divisão. O profissional vê a marca "não concluído" na
   lista de sessões; o aluno, no histórico.
7. **Semana validada.** A Execução recusa semana fora de 1..N (e decimal) antes de
   enviar; a 0039 acrescenta um trigger que vale para qualquer caminho de escrita
   e só dispara quando a semana é gravada.
8. **Motor de progressão v2 (`progression-engine@2`).** Incremento pela faixa de
   carga (1 kg abaixo de 10 kg, 2 kg até 20 kg, 2,5 kg acima), sem arredondar a
   sugestão para a grade de 2,5 kg; nunca sugere 0 kg; "manter" quando o topo da
   faixa veio com RIR abaixo do alvo.

### Prioridade baixa

9. **Cronômetro.** Remover o avulso ou trocar de divisão cancela a contagem, e o
   descanso só é gravado numa série que ainda está na tela. O tique de 1 s mora
   na faixa do cronômetro, sem re-renderizar o formulário inteiro.
10. **Rota × registro.** Detalhe e edição de treino, Execução, sessão postural e
    foto postural recusam o registro de outro avaliado
    (`components/RecordMismatch.tsx`), como anamnese e avaliação já faziam.
11. **Mesma ordem nas duas telas.** O profissional desempata sessões da mesma data
    pela criação, como o pacote do aluno.
12. **Adesão na mesma régua.** O numerador passa a contar só as sessões das
    semanas fechadas (e dentro do mesociclo), como o denominador. A 0039 expõe
    `recent_dates` no resumo da carteira para isso.
13. **Treino recusado recuperável.** Na fila do aluno, a sessão recusada em
    definitivo ganha "Copiar dados" (texto pronto para mandar ao treinador, que
    registra na data certa) e o descarte pede confirmação.
14. **Segurança e manutenção.** A CSP libera do jsdelivr só o pacote do MediaPipe
    na versão fixada, e do Google Storage só `mediapipe-models/`; a versão fica
    exata no `package.json` e um teste reprova divergência entre dependência,
    carregador e CSP. O filtro do log de erros remove também o token de `/t#`. A
    reconciliação do rascunho do aluno conta a série marcada como feita.

## A migration 0039

[`0039_sessao_em_andamento.sql`](../supabase/migrations/0039_sessao_em_andamento.sql)
não altera RLS, policies nem dado existente:

- `workout_logs.in_progress boolean not null default false` — registros antigos e
  do profissional continuam concluídos;
- trigger `workout_logs_b2_week` (semana ≤ tamanho do plano, só quando a semana é
  gravada: registros antigos não são reinterpretados);
- `workout_log_summary`: `log_count` conta só concluídas; `recent_dates` no fim;
- `get_workout_for_link`: `current_plan_sessions` e `plan_week_log` só com
  concluídas, e `plan_week_log` traz `client_ref`;
- `submit_workout_session` ganha `p_in_progress` (default false). Como na 0038, as
  duas funções de envio são derrubadas e recriadas para não criar sobrecarga, com
  os grants reemitidos. O frontend publicado antes da 0039 continua enviando
  normalmente (o argumento tem default);
- correção e histórico do aluno devolvem `in_progress`.

O cliente trata todos os campos novos como opcionais, no padrão do projeto:
`database.types.ts` não foi editado à mão.

## Validação feita aqui

- `npm run check`: lint, **989 testes em 117 arquivos**, TypeScript, Vite e
  orçamento do build. São 54 testes a mais que a base, incluindo as duas
  reproduções (sensação perdida; sessão contada duas vezes).
- **340 verificações pgTAP em 14 suítes** num PostgreSQL 18 descartável, com as
  migrations 0001–0039 aplicadas sobre o bootstrap mínimo de Auth/Storage; a da
  0039 tem 24. O cluster foi encerrado.
- Suítes antigas ajustadas para continuar válidas no schema atual: 0027, 0032,
  0033 e 0038 verificavam a assinatura exata da função de envio (que a 0038 e a
  0039 recriam) e passaram a procurá-la pelo nome. A 0038 também tinha dois
  defeitos próprios, nunca vistos porque ela não tinha sido executada: criava o
  avaliado sem usuário autenticado e escolhia a "sessão mais recente" entre
  sessões com o mesmo `created_at`.
- PDFs de avaliação renderizados e conferidos por imagem: adulto (igual ao de
  antes), menor com protocolo e menor sem protocolo
  (`scripts/render-pdf-sample.mjs` gera os dois novos).

Não verificado aqui: as telas por captura (exigem sessão real e token de aluno) e
a detecção de pontos da postura no navegador com a CSP nova.

## Como aplicar

No **CMD do Windows**, um comando de cada vez.

1. Aplicar pelo SQL Editor do dashboard do Supabase, **nesta ordem**, as que ainda
   não foram aplicadas: `0037`, `0038` e `0039` (copiar e colar o conteúdo do
   arquivo — ele tem acentos, então nunca `type | clip`).

2. Regenerar os tipos:

```cmd
npx supabase gen types typescript --linked > src\lib\database.types.ts
```

3. Conferir o carimbo do schema (esperado: `schema gate ok: 0039`):

```cmd
npm run check:remote-schema
```

4. Rodar a validação completa:

```cmd
npm run check
```

5. Publicar (o push é sempre seu):

```cmd
git add -A
```

```cmd
git commit -m "Separa sessao em andamento e protege o registro da execucao"
```

```cmd
git push
```

## Checklist manual

```txt
[ ] Execução: digitar séries, recarregar a página -> sessão recuperada com aviso
[ ] Execução: digitar séries e tocar em "Início" -> pergunta "Sair sem salvar?"
[ ] Execução: semana 99 -> mensagem, nada enviado
[ ] Execução: cronômetro de um avulso, remover o avulso -> faixa some
[ ] Aluno: escolher a carinha, fechar e reabrir -> carinha marcada
[ ] Aluno: "Parar por aqui", reabrir, concluir -> semana e divisão seguintes corretas
[ ] Profissional: sessão salva pelo aluno e não concluída aparece "não concluído"
[ ] Avaliação de menor de 18 anos: IMC e gordura "Sem classificação adulta", no PDF também
[ ] Postura: "Detectar pontos" continua funcionando (CSP nova)
```

## Problemas comuns

```txt
Erro: schema gate falhou: esperado 0039, recebido 0038
Causa: a 0039 ainda não foi aplicada.
Solução: aplicar a 0039 no SQL Editor e rodar de novo.

Erro: "Detectar pontos" falha com erro de carregamento no console (CSP)
Causa: versão do MediaPipe diferente entre package.json, poseDetect.ts e _headers.
Solução: os três precisam da mesma versão; o teste pagesConfig.test.ts acusa a divergência.
```
