# Análise do Avalix — 04/09/2026

> **Situação (05/09/2026):** os defeitos 1 a 9 deste relatório foram corrigidos — ver a seção **v2.12** de [`DECISIONS.md`](DECISIONS.md), que registra o que mudou e por quê. A migration `0031` entregue nessa rodada ainda depende de aplicação em produção. Este documento fica como está, no estado em que foi escrito.

O Avalix já reúne um fluxo profissional consistente de cadastro, consentimento, anamnese, avaliação física e postural, prescrição, execução e evolução. A arquitetura é adequada ao produto e ao desenvolvimento solo. O principal investimento agora deve ser a confiabilidade das transições entre esses fluxos: há proteções bem desenhadas que deixam de funcionar quando uma atualização, edição ou retomada acontece em determinada ordem.

Esta análise não alterou código de aplicação, migrations, dados ou configurações de produção. Apenas este relatório foi acrescentado ao repositório. Reproduções e imagens foram geradas em pastas temporárias.

## Escopo e evidências

- Leitura das decisões, instruções operacionais, especificações e implementação dos principais módulos; revisão das migrations, autenticação, armazenamento, rotas públicas, relatórios e automações.
- Revisão funcional independente e revisão de segurança com auditor independente das fronteiras de banco e infraestrutura.
- Execução de lint, testes, build, orçamento de build, auditoria npm, consulta pública da versão do schema e smoke HTTP do domínio.
- Inspeção visual no Chromium do build local, com dados fictícios e requisições Supabase interceptadas: login, início, lista de alunos, perfil, criação de treino, avaliação física, anamnese pública e treino do aluno. Foram usados desktop e celular de 360 px, nos temas claro e escuro.
- Renderização do script de amostras de PDF e inspeção das cinco páginas geradas: três do treino e duas da avaliação.
- Quatro reproduções temporárias confirmaram defeitos de comportamento que a suíte existente não cobre.

A revisão é ampla, mas não comprova todos os estados possíveis do aplicativo. A parte de segurança teve 72 arquivos lidos integralmente e cobertura parcial do repositório. Não foram executados pgTAP, testes adversariais em produção, restauração de backup, testes em aparelhos físicos ou validação científica independente das equações. As telas autenticadas foram verificadas com fixtures, sem acessar prontuários reais. O smoke HTTP e a consulta de schema não comprovam o funcionamento de toda a aplicação em produção.

## Resultado das validações

| Verificação | Resultado |
| --- | --- |
| `npm run lint` | Aprovado |
| `npm run test`, horário local | 649 aprovados e 1 falha; repetida na suíte isolada |
| Mesma suíte em UTC | 650 testes aprovados, em 93 arquivos |
| `npm run build` | Aprovado, incluindo TypeScript |
| `npm run check:build` | Aprovado |
| JavaScript de entrada | 607.054 bytes; 182.591 bytes gzip |
| Pré-cache do PWA | 1.890.193 bytes, em 119 arquivos; limite de 2.000.000 bytes |
| `npm audit --json` | Nenhuma vulnerabilidade conhecida reportada, incluindo dependências de desenvolvimento |
| Consulta remota `app_schema_version` | `0030` |
| Smoke HTTP de `https://avalixfit.com.br` | Aprovado |
| Quatro reproduções adicionais | Falharam nas expectativas de preservação, confirmando os quatro defeitos descritos abaixo |

O teste que falha localmente mistura uma data UTC com a data local do aplicativo. Isso não é evidência de colisão real entre identificadores de sessão. Os quatro testes adicionais são separados dos 650 existentes; não seria correto declarar o aplicativo livre de defeitos porque a suíte original passa em UTC.

## O que está bem resolvido

**Produto e domínio.** O maior valor está na continuidade entre os módulos. O profissional pode usar a avaliação e a anamnese como contexto da prescrição, entregar o treino, receber a execução e acompanhar a evolução. Há atenção a situações reais: exercícios substituídos, agrupamentos, semanas diferentes, rascunhos, consentimento revogado e parecer médico posterior à triagem.

**Arquitetura.** React/TypeScript com módulos por funcionalidade, funções puras para regras e Supabase com RLS formam uma estrutura proporcional ao tamanho do projeto. Motores e resultados versionados, regras compartilhadas e snapshots reduzem divergências entre telas e relatórios. As bibliotecas pesadas são carregadas sob demanda. Não vi motivo para uma reescrita ou troca de stack.

**Proteção dos dados.** Isolamento por organização e avaliador no banco, gate de MFA nas principais superfícies sensíveis, fotos privadas com caminhos canônicos, tokens aleatórios com hash e expiração, consentimento protegido no servidor e exclusão verificada demonstram cuidado estrutural. Isso não equivale a uma certificação de conformidade ou ausência de vulnerabilidades.

**Operação.** Existem validações de build, gate de compatibilidade do schema, smoke pós-deploy, backup cifrado de banco e Storage e documentação de restauração. As ações de CI estão fixadas por SHA. A situação atual dos backups e o sucesso recente de um restore não foram verificados.

**Apresentação.** A identidade visual é consistente, com boa hierarquia, tipografia própria e continuidade entre aplicação e PDFs. Nas telas inspecionadas não apareceu transbordamento horizontal em 360 px. O agrupamento de exercícios no treino e a grade bilateral de circunferências ajudam na leitura.

## Achados de maior prioridade

### 1. Restrição médica pode desaparecer do aviso ao prescrever

**Prioridade alta. Confirmado por reprodução de função pura e encadeamento do código.**

Em `src/features/anamnesis/clearance.ts`, o retorno para uma triagem limpa ocorre antes do tratamento de `liberado_com_restricoes`. É possível registrar um parecer com restrições e depois corrigir as respostas da anamnese, deixando a triagem limpa. A migration 0029 preserva o parecer nessa edição.

Na reprodução, o parecer continha “Sem carga axial pesada”, mas o alerta retornou nível `ok`, badge “Liberado” e somente a data do parecer. A observação continuava registrada, porém não aparecia no alerta que orienta a prescrição. `AnamneseFlag` usa esse resultado no builder.

**Direção de correção:** definir a precedência do parecer registrado antes do retorno de triagem limpa, preservando restrições e ressalvas. Trata-se de consistência da regra interna do produto; esta análise não avaliou o conteúdo clínico do parecer.

**Referências:** `src/features/anamnesis/clearance.ts:261`, `src/features/workout/AnamneseFlag.tsx:42`, `supabase/migrations/0029_liberacao_medica.sql:123`.

### 2. Atualização automática da consulta pode neutralizar o controle de concorrência

**Prioridade alta. Reproduzido na avaliação; o treino usa a mesma estrutura problemática.**

Os valores do editor ficam no estado inicial do formulário, mas o `expectedUpdatedAt` acompanha a resposta mais recente da query. Uma atualização por foco/reconexão pode, portanto, atualizar o carimbo de versão sem atualizar os valores que estão sendo editados.

Reprodução: abrir versão das 10h, peso 80 kg; editar para 81 kg; receber versão das 11h, peso 90 kg, salva por outro dispositivo. O campo continua 81, mas a versão enviada ao salvamento passa a ser 11h. O guard do banco deixa de identificar que a edição partiu de uma versão antiga. A chave do rascunho também acompanha o carimbo novo.

**Direção de correção:** manter a versão-base junto do estado-base do editor, sem substituí-la silenciosamente em um refetch; tratar a alteração externa como conflito explícito. Na anamnese há uma lacuna relacionada: o update é filtrado somente por ID, sem comparação de versão.

**Referências:** `src/pages/AvaliacaoNova.tsx:274`, `src/pages/TreinoNovo.tsx:196`, `src/features/anamnesis/api.ts:51`.

### 3. Editar o plano pode tornar inacessível o treino que o aluno estava preenchendo

**Prioridade alta. Confirmado por reprodução de componente.**

A gravação do plano apaga e recria suas divisões e exercícios. Os IDs filhos mudam, mesmo quando o exercício do catálogo continua igual. Na revalidação, o app do aluno recebe o pacote novo e remonta o formulário com base nos IDs das divisões. O rascunho é rejeitado porque aponta para uma divisão antiga.

Reprodução: o aluno preenche 40 kg e espera o autosave; o treinador salva uma edição no mesmo plano; o aluno reconecta e recebe os novos IDs. O campo volta vazio. A reprodução usa o mesmo plano e o mesmo exercício do catálogo. Isso atinge a sessão ainda em rascunho; sessões já enviadas e a fila de envio não foram afetadas nesse cenário.

**Direção de correção:** preservar a prescrição usada no início da sessão, ou reconciliar o rascunho por identidades estáveis com tratamento explícito das alterações. Também convém avaliar preservação de IDs na gravação do plano.

**Referências:** `supabase/migrations/0030_treino_agrupamentos.sql:134`, `src/pages/TreinoAluno.tsx:435`, `src/pages/TreinoAluno.tsx:677`.

### 4. Falha ao criar um plano ativo pode deixar o aluno sem treino vigente

**Prioridade alta. Confirmado por análise estática do cliente e das migrations; não simulado em banco.**

`createWorkoutPlan` insere o cabeçalho e depois chama a RPC que grava a estrutura filha. Quando o cabeçalho nasce ativo, o trigger da migration 0027 já arquiva o plano ativo anterior.

Se a segunda chamada falhar, a limpeza do cliente apaga somente o plano novo. O anterior continua arquivado. Se a limpeza também falhar, pode sobrar um plano ativo vazio. A edição já possui uma transação mais abrangente; a criação continua em duas chamadas.

**Direção de correção:** criar e publicar cabeçalho e estrutura dentro da mesma transação, incluindo a troca do plano vigente.

**Referências:** `src/features/workout/api.ts:332`, `src/features/workout/api.ts:348`, `supabase/migrations/0027_workout_link.sql:60`.

### 5. O script de limpeza de órfãos pode apagar fotos legítimas

**Prioridade alta operacional. Confirmado estaticamente; depende de execução administrativa.**

`scripts/find-orphan-photos.mjs` carrega os caminhos de `posture_photos` sem paginação, mas percorre o Storage inteiro. Quando a consulta de banco ultrapassa o limite de retorno da API, fotos legítimas ficam fora do conjunto conhecido. O script passa a classificá-las como órfãs.

O modo padrão apenas lista. Com `--delete` e service role, esses candidatos são enviados à exclusão. Não foi consultada a quantidade real de fotos nem o limite remoto, e o script não foi executado contra produção.

**Direção de correção:** paginação determinística, verificação de completude e revalidação de cada candidato antes da exclusão. Até corrigir, não confiar na lista como autorização suficiente para executar o modo destrutivo.

**Referências:** `scripts/find-orphan-photos.mjs:37`, `scripts/find-orphan-photos.mjs:47`, `scripts/find-orphan-photos.mjs:88`.

## Outros defeitos confirmados

### 6. Autosave do aluno omite os exercícios extras

**Prioridade média. Confirmado por reprodução de componente.**

O debounce salva `rows`, mas omite `extras`. Adicionar um exercício de outra divisão, preencher suas séries e fechar a aba antes de salvar explicitamente faz a seleção desaparecer na retomada. As linhas ficam sem a identificação necessária para entrar no próximo envio.

Na reprodução, o rascunho continha 100 kg na linha do exercício extra, mas `extras` era `undefined`. O caminho explícito de salvar usa `draftAtual()`, que inclui o campo; isso explica por que o teste existente de troca de exercício não detecta o problema.

**Direção de correção:** usar a mesma representação completa de rascunho no autosave e nos demais caminhos.

**Referência:** `src/pages/TreinoAluno.tsx:726`.

### 7. A escrita no catálogo personalizado não exige o segundo fator

**Achado de segurança, gravidade baixa na classificação do scan, confiança alta na análise estática.**

As policies de INSERT, UPDATE e DELETE de `exercises` conferem organização/papel, mas não `app.mfa_satisfied()`. Os helpers `is_member` e `role_in` não incluem esse gate por decisão do projeto. Nenhuma migration posterior revisada acrescenta a verificação a essas policies.

Uma sessão AAL1 obtida somente com a senha de uma conta que usa 2FA pode alterar exercícios personalizados da própria organização por REST, embora a UI pare no desafio MFA. O nome do catálogo é lido pelos treinos publicados, portanto a alteração pode chegar à instrução exibida ao aluno.

Não foi demonstrado acesso a outra organização, alteração do catálogo global ou vazamento de dados clínicos. A análise não executou esse cenário contra produção.

**Direção de correção:** nova migration com o gate nas três policies e teste em banco cobrindo AAL1, AAL2 e contas sem fator verificado.

**Referências:** `supabase/migrations/0007_workout_rls.sql:61`, `supabase/migrations/0003_mfa_aal2.sql:21`, `supabase/migrations/0030_treino_agrupamentos.sql:240`.

### 8. O teste de mudança de data depende do horário e do fuso

**Prioridade média de qualidade. Reproduzido.**

O teste calcula ontem com `new Date(Date.now() - 86400000).toISOString().slice(0, 10)`, enquanto o app usa o calendário local. Às 21h07 de 04/09 em Brasília, o valor calculado como ontem era `2026-09-04`, igual ao hoje do aplicativo. O teste não trocou a data, mas exigiu uma terceira sessão independente.

Isso explica a falha consistente no ambiente local e a aprovação em UTC. Não é uma falha demonstrada da regra de sessão do aplicativo.

**Direção de correção:** fixar relógio e fuso da reprodução, ou calcular a data alternativa a partir da data local exibida. Não basta aumentar timeout.

**Referências:** `src/pages/TreinoAluno.test.tsx:502`, `src/pages/TreinoAluno.tsx:88`.

### 9. O PDF rotula diferença de percentual como variação percentual

**Prioridade média de clareza numérica. Confirmado no código e na amostra visual.**

O gráfico calcula `last.value - first.value` e acrescenta a unidade `%`. Na amostra, gordura de 22% para 18% aparece como `-4%`. A diferença é de quatro pontos percentuais; uma redução relativa de 4% significaria outra conta.

**Direção de correção:** separar unidade do valor e unidade da diferença, usando `p.p.` na variação do percentual de gordura. Manter `%` para os valores medidos/estimados.

**Referências:** `src/features/reports/assessmentPdf.tsx:198`, `src/features/reports/assessmentPdf.tsx:303`.

## Impressões de experiência e produto

**O visual já oferece uma boa base.** Eu manteria a identidade e concentraria as mudanças em densidade, orientação e facilidade de agir. Login, menu reduzido e temas estão coerentes. Os PDFs têm boa hierarquia e os blocos de super-série/circuito são identificáveis.

**A anamnese exige muita rolagem.** A versão inspecionada para uma aluna, sem respostas preenchidas, ocupou cerca de 8.145 px de altura em um celular de 360 px. Os blocos são legíveis, mas a pessoa não tem uma indicação clara de quanto falta. Vale experimentar progresso por seção, resumo de pendências e revelação progressiva de campos opcionais, preservando as perguntas e as regras de completude. Não medi taxa de abandono nem tempo de preenchimento com usuários.

**O perfil privilegia administração antes do trabalho recorrente.** Dados cadastrais e o card de consentimento vigente ocupam bastante espaço antes de anamnese, avaliações e treinos. Para uso frequente, valeria compactar o consentimento já regular e destacar a próxima ação contextual. A aprovação/revogação deve continuar acessível.

**O painel de atenção mostra só os primeiros casos.** Com mais de cinco alunos sinalizados, aparece uma contagem dos demais, mas falta um caminho para abrir a lista completa já filtrada por motivo. A lista geral de alunos exige procurar novamente quem precisa da ação.

**O aluno recebe abreviações especializadas.** RIR e cadência aparecem no treino, mas podem precisar de ajuda contextual curta para iniciantes. O treino no celular tem boa separação por exercício; o preenchimento pode melhorar com orientação sobre o que registrar e uma indicação persistente de progresso.

**Os PDFs podem aproveitar melhor o papel.** Na amostra de avaliação, a segunda página contém apenas observação e ressalvas, deixando grande área vazia. Na ficha de treino, a primeira página também termina cedo para manter o bloco seguinte inteiro. Não houve corte evidente nas amostras; é uma oportunidade de ajustar paginação e densidade, sem sacrificar o agrupamento dos exercícios.

**Comparação entre protocolos precisa do mesmo cuidado dos prompts.** A tela compara percentuais e massas e colore diferenças sem um aviso específico quando os protocolos são diferentes. O prompt de avaliação já reconhece essa limitação explicitamente. Convém compartilhar essa regra com a comparação, a evolução e os relatórios, preservando a comparabilidade das medidas diretas. Referências: `src/features/assessment/compare.ts:70`, `src/pages/AvaliacoesComparar.tsx`, `src/features/prompts/assessment.ts:366`.

## Manutenção, escala e operação

- **Os componentes de maior risco concentram responsabilidades demais.** `TreinoAluno`, `TreinoNovo`, `AvaliadoDetalhe` e `AnamneseForm` reúnem estado, regras, persistência e apresentação em arquivos extensos. Os bugs de rascunho encontrados justificam extrair primeiro a gestão de sessão e os contratos de edição, com testes de comportamento. Uma refatoração geral por tamanho de arquivo teria retorno menos claro.
- **A lacuna principal dos testes está nas transições.** Há cobertura valiosa de regras isoladas, estados de erro e renderização. Faltam cenários que combinem duas superfícies: refetch durante edição, treinador publicando enquanto aluno executa, parecer preservado após correção e retomada sem clique em salvar. Um conjunto pequeno de testes de navegador desses percursos teria alto valor.
- **A escala ainda depende de listagens completas.** A lista de alunos pagina as requisições, mas acumula toda a organização e filtra no cliente. Algumas consultas de resumos de planos e avaliações não paginam. Isso não demonstrou problema na carteira atual; merece teste com volume maior e paginação/busca no servidor antes de expandir para organizações grandes.
- **O orçamento do PWA passou, com pouca folga.** Restam aproximadamente 110 kB até o teto de pré-cache atual. Convém acompanhar o que entra no cache nas próximas funcionalidades; não há motivo para elevar automaticamente o limite ou trocar a stack.
- **O estado operacional documentado está desatualizado.** O início de `DECISIONS.md` marca 0029 e 0030 como pendentes, mas a RPC remota já retornou 0030 nesta análise. Outros trechos históricos também preservam estados antigos. Um resumo atual curto, separado do histórico, reduziria o risco de orientação baseada em pendência já resolvida.
- **Backup precisa de evidência operacional.** O workflow é semanal e possui verificação estrutural. A periodicidade implica uma janela nominal de até uma semana entre cópias; falhas podem ampliá-la. Antes de crescer, registrar execução recente, alertas de falha e data/resultado de restauração de banco e Storage. Não foi constatada falha real do backup nesta análise.

## Ordem sugerida de trabalho

1. Corrigir precedência da restrição médica, versão-base dos editores e preservação da sessão do aluno durante atualização do plano.
2. Tornar a criação/publicação do treino atômica e corrigir a enumeração do script de fotos antes de seu próximo uso destrutivo.
3. Unificar o rascunho do aluno, completar o gate de MFA do catálogo e estabilizar o teste de data.
4. Corrigir rótulos de diferenças e compartilhar a regra de comparação de protocolos entre as superfícies.
5. Acrescentar testes das transições reproduzidas e então melhorar o preenchimento mobile e a orientação das telas.

## Artefatos de apoio

As pastas abaixo são temporárias e podem ser removidas pelo sistema:

- `C:/Users/luizf/AppData/Local/Temp/avalix-review-20260904/`: capturas, amostras dos PDFs, relatório do navegador e `reproductions.json`.
- `C:/Users/luizf/AppData/Local/Temp/avalix-business-review/`: quatro reproduções adicionais e configuração independente do Vitest.
- `C:/Users/luizf/AppData/Local/Temp/codex-security-scans-MpLGmh/Avalix/d7ae018f8eeebb2ffb07ffa6aa97ea714cd40021_20260905T000434Z_wlu7bljd/`: relatório canônico do scan de segurança, findings, coverage e SARIF. O scan não forneceu medição confiável de tokens.

Para repetir somente as quatro reproduções locais, em CMD, cada comando em uma linha:

```cmd
node node_modules/vitest/vitest.mjs run --config C:/Users/luizf/AppData/Local/Temp/avalix-business-review/vitest.config.mjs --configLoader native -t REPRO
```

Na versão analisada, a falha dessas quatro expectativas é o resultado que demonstra os defeitos. Elas não fazem parte da suíte permanente do projeto.
