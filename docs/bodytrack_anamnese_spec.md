# Anamnese BodyTrack — Especificação

Estrutura em duas camadas. **Camada A** é gate de segurança (decide liberação). **Camada B** é contexto de avaliação. Campos marcados `[gate]` alimentam a lógica de encaminhamento médico.

Convenção de tipos: `bool` = Sim/Não, `enum` = seleção única, `multi` = múltipla, `text`, `int`, `date`, `vas` = escala 0-10.

---

## Camada A — Triagem de prontidão (gate de segurança)

Não pode ser pulada. Toda resposta aqui pode disparar `flag_encaminhamento = true`.

### A1. Triagem de domínios de risco (equivalente PAR-Q+, redação própria)

Sete itens `bool`. Qualquer "Sim" → não liberado automaticamente → exige follow-up antes de intensidade vigorosa.

1. `cardio_dx` — Algum médico já disse que você tem condição cardíaca ou pressão alta? `[gate]`
2. `dor_toracica` — Sente dor no peito em repouso, nas atividades do dia a dia ou durante esforço físico? `[gate]`
3. `tontura_sincope` — Perdeu o equilíbrio por tontura ou perdeu a consciência nos últimos 12 meses? `[gate]`
4. `condicao_cronica` — Tem outra condição crônica diagnosticada além de cardíaca/pressão? (se Sim → `text` especificar) `[gate]`
5. `medicacao_cronica` — Toma medicação prescrita para condição crônica? (se Sim → `text`) `[gate]`
6. `lesao_atividade` — Tem problema ósseo, articular ou de tecido mole que piora com atividade física? `[gate]`
7. `supervisao_medica` — Algum médico já disse que você só deve fazer atividade física sob supervisão médica? `[gate]`

Regra: `liberado = todos os 7 == Não`. Caso contrário, exibir orientação de buscar liberação médica/profissional qualificado antes de progredir intensidade.

### A2. Refinamento ACSM (decide o nível de encaminhamento)

Quatro entradas, combinadas em matriz:

- `ativo_regular` — `bool` — Pratica exercício estruturado regular há ≥3 meses (≥30 min, ≥3x/semana, intensidade ao menos moderada)?
- `doenca_cmr` — `multi` — Doença diagnosticada: nenhuma / cardiovascular / metabólica (DM1, DM2) / renal
- `sinais_sintomas` — `multi` — Presença atual de: dor/desconforto torácico; dispneia anormal ao esforço ou repouso; tontura/síncope; ortopneia ou dispneia noturna; edema de tornozelos; palpitações/taquicardia; claudicação intermitente; sopro cardíaco conhecido; fadiga desproporcional. (nenhum = vazio)
- `intensidade_desejada` — `enum` — leve / moderada / vigorosa  *(reuso de B1)*

**Matriz de decisão (modelo ACSM atual):**

| Situação | Recomendação |
|---|---|
| Sintomas presentes (`sinais_sintomas` ≠ vazio) | Liberação médica antes de qualquer exercício |
| Doença CMR conhecida + assintomático + **inativo** | Liberação médica antes de iniciar |
| Doença CMR conhecida + assintomático + **ativo** | Liberação só antes de progredir para vigorosa |
| Sem doença, sem sintomas, **ativo** | Liberado; pode manter ou progredir |
| Sem doença, sem sintomas, **inativo** | Liberado para leve→moderada; progredir gradualmente |

Saída: `nivel_encaminhamento ∈ {liberado, antes_vigorosa, antes_iniciar}`.

---

## Camada B — Anamnese de avaliação

### B0. Identificação (mínimo)

- `nome` — `text`
- `data_nascimento` — `date` → calcula `idade` (entra em equações preditivas de composição e VO2)
- `sexo_biologico` — `enum` masculino/feminino (necessário p/ fórmulas e referências; separe de identidade de gênero se quiser registrar ambos)
- `contato` — `text`
- `data_avaliacao` — `date`
- `profissional_responsavel` — `text` (se multiusuário)

Não coloque peso/altura aqui. São *medidas*, pertencem ao módulo de avaliação, não à anamnese (evita duplicar fonte de verdade). Se quiser autorrelato inicial, marque como `autorreferido`.

### B1. Objetivo e contexto

- `objetivo_principal` — `multi` — hipertrofia / composição corporal / performance esportiva / saúde geral / dor e reabilitação / correção postural / condicionamento cardiorrespiratório
- `esporte_modalidade` — `text`
- `experiencia_treino` — `enum` — nunca treinou / <6 meses / 6-24 meses / >2 anos
- `intensidade_desejada` — `enum` — leve / moderada / vigorosa  *(alimenta A2)*

### B2. História clínica

- `doencas_cronicas` — `multi` — HAS / DM1 / DM2 / dislipidemia / cardiopatia / doença renal / pulmonar (asma, DPOC) / tireoidiana / câncer (atual ou prévio) / reumática-artrite / osteoporose-osteopenia / neurológica / psiquiátrica relevante ao engajamento
- `cirurgias` — repetível: `{descricao: text, ano: int, regiao: enum}` — priorize ortopédicas
- `medicamentos` — repetível: `{nome: text, dose: text}` — sinalize classes que alteram resposta ao exercício (betabloqueador → atenua FC; diurético → desidratação/cãibra; insulina → hipoglicemia de esforço)
- `historia_familiar_dcv` — `bool` — Morte por doença cardíaca ou morte súbita em familiar de 1º grau (homem <55a, mulher <65a)?
- `tabagismo` — `enum` — nunca / ex / atual  (+ `int` maços-ano se atual/ex)
- `alcool` — `enum` — não / social / frequente

### B3. Dor e sistema musculoesquelético

Crítico para o módulo postural. Repetível por região.

Por queixa:
- `regiao` — `enum` — cervical / ombro D / ombro E / dorsal / lombar / quadril D / quadril E / joelho D / joelho E / tornozelo-pé / cotovelo-punho / outra
- `intensidade` — `vas` (0-10)
- `tempo_evolucao` — `enum` — aguda (<6 sem) / subaguda (6-12 sem) / crônica (>12 sem)
- `fatores_piora` — `text` ; `fatores_melhora` — `text`
- `lesao_previa_regiao` — `bool`

**Red flags de coluna (gate de encaminhamento, não de treino):** dispare `flag_encaminhamento` se qualquer um:
- dor noturna progressiva que não alivia com repouso
- perda de peso inexplicada
- déficit neurológico (formigamento, fraqueza, perda de força)
- febre associada
- história de câncer
- alteração de controle de bexiga/intestino
- trauma significativo recente

Estas indicam que o caso não é de treino e sim de avaliação médica. Para um app postural isto é diferencial: saber quando *não* prosseguir.

### B4. Hábitos de vida

- `nivel_atividade_atual` — `{tipo: text, freq_semanal: int, duracao_min: int, intensidade: enum}` — base estilo IPAQ curto
- `ocupacao` — `text`
- `horas_sentado_dia` — `int` (preditor postural direto)
- `esforco_repetitivo_carga` — `bool` (+ `text`)
- `sono_horas` — `int` ; `sono_qualidade` — `enum` boa/regular/ruim
- `estresse_percebido` — `enum` baixo/médio/alto
- `acompanhamento_nutricional` — `bool` (mantém nutrição fora do escopo; só registra se há profissional)

### B5. Específico postural / ocupacional

- `lado_dominante` — `enum` destro / canhoto / ambidestro
- `atividade_assimetrica` — `bool` (+ `text`: tênis, arremesso, instrumento, etc.)
- `uso_palmilha_ortese` — `bool` (+ `text`)
- `alteracao_postural_diagnosticada` — `multi` — nenhuma / escoliose / hipercifose / hiperlordose / outra
- `queixa_postural_principal` — `text`

### B6. Saúde da mulher (condicional — só se `sexo_biologico == feminino`)

- `gestante` — `bool` (+ `int` semanas) `[gate]` — gestação muda restrições e exige protocolo próprio
- `pos_parto_recente` — `bool` (+ `int` meses)

### B7. Consentimento e dados

- `declaracao_veracidade` — `bool` obrigatório — declara ter respondido com honestidade
- `consentimento_lgpd` — `bool` obrigatório — **dados de saúde são "dados pessoais sensíveis" sob a LGPD (Art. 5º, II e Art. 11)**. Tratamento exige base legal específica; consentimento explícito é a mais segura para este caso. Registre `timestamp` e versão do termo.
- Saída automática: `flag_encaminhamento`, `nivel_encaminhamento`, `liberado` — exibir resumo de pendências antes de habilitar prescrição/avaliação completa.

---

## Notas de implementação

- **Lógica de gate centralizada:** calcule `liberado` / `nivel_encaminhamento` / `flag_encaminhamento` num único módulo puro, testável, separado da UI. Facilita teste e auditoria.
- **Persistência versionada:** anamnese muda ao longo do tempo (lesão nova, gravidez, medicação). Guarde por avaliação com `data_avaliacao`, não sobrescreva. Permite comparar reavaliações, que é metade do valor de um app de acompanhamento.
- **Condicionais:** B6 só aparece por sexo; campos "se Sim → especificar" devem ser progressive disclosure para não inflar o formulário.
- **Offline-first:** sendo PWA, a anamnese é candidata óbvia a preenchimento offline com sync posterior. Marque o schema com `synced: bool`.
