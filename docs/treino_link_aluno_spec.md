# Treino executado pelo aluno (link) — Especificação

> **Estado atual (schema 0028).** Este documento preserva abaixo o desenho-base
> que originou a migration 0027. O contrato operacional vigente inclui também a
> estabilização da 0028; em qualquer divergência, `docs/DECISIONS.md`, as
> migrations e o bloco a seguir prevalecem sobre os exemplos históricos.

## Atualização de estabilização — 0028

- `/t` e `/t/` são rewrites explícitos do Cloudflare Pages, sempre `no-store`;
  `treino.webmanifest` tem `id`, `start_url` e `scope` em `/t`. A rota pública
  registra o service worker silenciosamente para o shell abrir offline, sem
  interromper treino ou anamnese com aviso de atualização.
- O pacote público informa `link_expires_at` e `current_plan_sessions`. Cache
  legado sem validade, validade malformada ou expirada falha fechado. Expiração,
  revogação observada e saída do aparelho removem token, pacote, histórico,
  planos, rascunhos e fila; outras abas convergem pela mudança do token.
- Rascunho e fila ficam no IndexedDB, isolados por hash do token, plano,
  divisão e data. “Salvar progresso” e “Concluir treino” reutilizam o
  `client_ref` somente dentro dessa sessão; trocar divisão ou data recupera ou
  cria outra identidade. Cada envio reserva atomicamente uma `client_revision`
  crescente, inclusive entre abas. Uma confirmação só aparece depois que o
  rascunho/outbox necessário termina; recusa definitiva permanece visível até
  o aluno descartá-la.
- `p_plan` é aceito somente como referência do plano em que a sessão offline foi
  executada: ele precisa pertencer ao mesmo avaliado e estar `active` ou
  `archived`; `draft` é recusado no banco. Os exercícios continuam limitados ao
  catálogo global ou à organização do link, para uma fila legítima sobreviver à
  edição posterior da prescrição.
- Plano histórico só abre com status `archived`; `draft` nunca é publicado. O
  histórico usa `get_workout_history_page_for_link` com cursor composto
  `(performed_at, created_at, id)`, evitando perda ou repetição quando várias
  sessões têm a mesma data. Respostas atrasadas de outro plano são ignoradas.
- Toda RPC pública preserva `NULL` como sinal de link inválido. Histórico e
  detalhe anterior convergem para o mesmo purge central; um epoch de acesso
  impede resposta em voo de regravar estado ou cache depois da revogação.
- A última série é escolhida primeiro pela sessão mais recente e só então pela
  melhor série dentro dela. A próxima divisão deriva da sequência semanal e do
  número de sessões do plano atual, não do histórico inteiro.
- Um exercício não pode aparecer duas vezes na mesma divisão, por validação no
  editor e `unique (day_id, exercise_id)` no banco. A migration 0028 possui
  preflight somente leitura e suíte pgTAP própria.

Objetivo: o treinador emite um treino, ele passa a ser o **treino vigente** do
aluno, e o aluno abre um **link** (sem login) para ver o treino do dia e ir
marcando o que fez — série a série, com carga, repetições e RIR. O registro cai
direto no mesmo `workout_logs` que a tela de execução do treinador já alimenta,
marcado como feito pelo aluno.

Fonte de verdade do conteúdo do treino: `docs/DECISIONS.md`, as migrations
`0006`–`0010` e `src/features/workout/`. Este documento trata só do caminho
**aluno → sistema** e do que ele exige do lado do treinador.

O modelo do caminho anônimo é `docs/anamnese_link_aluno_spec.md` (migration
0017/0018). Onde este documento diverge daquele, a divergência está justificada.

---

## 0. O que já existe (e por isso não se reinventa)

- `workout_logs` + `workout_log_sets` (0009) guardam exatamente o que o aluno vai
  marcar: sessão (plano, divisão A/B/C, semana, data) e série a série (carga,
  reps, RIR). O log referencia `exercise_id` do catálogo, não a linha do plano,
  justamente para sobreviver à reedição do plano.
- A 0009 já decidiu que **execução é dado operacional do treino, não coleta de
  dado sensível do titular** — por isso `workout_logs` não passa pelo gate de
  consentimento, ao contrário de avaliação, foto e anamnese. É essa decisão que
  torna o fluxo do aluno barato juridicamente (ver §8).
- O padrão de porta anônima está provado na 0017: token de 256 bits, banco guarda
  só o `sha256`, **nenhuma policy aberta para `anon`**, acesso exclusivamente por
  RPC `security definer` que valida o token por dentro.
- A rota pública `/a` já carrega o token no **fragmento** (`/a#<token>`), que não
  é enviado ao servidor nem entra em log de acesso ou `Referer`.
- `Execucao.tsx` já monta a grade de séries a partir da prescrição, numera as
  séries por exercício e grava tudo numa transação via `create_workout_log`.

Esse era o escopo que faltava antes da 0027; a porta do aluno, o plano vigente e
o link já estão implementados e foram estabilizados na 0028 conforme o bloco
acima.

---

## 1. Decisões-chave (e o porquê)

**D0. Sem conta para o aluno; capability token.** `subjects` é um cadastro, não um
usuário de auth. Dar login ao aluno significa convite, senha, recuperação,
política de MFA, um papel novo em toda a RLS e custo por usuário ativo. O token
entrega o que foi pedido com uma fração disso, e é um padrão que o projeto já
aprovou e auditou. Conta de aluno passa a valer a pena no dia em que ele precisar
de histórico próprio entre planos — não é a v1.

**D1. O link é do ALUNO, não do plano.** Esta é a principal diferença em relação
ao link de anamnese, que é de uso único. O aluno salva o link na tela do celular e
abre três vezes por semana durante meses; se o token fosse por plano, cada
mesociclo novo exigiria reenviar link e o aluno acabaria treinando pelo link
velho. O token aponta para o avaliado e resolve **o plano vigente dele no momento
do acesso**. Trocar de mesociclo passa a ser publicar o plano, não redistribuir
link.

O custo dessa escolha é um bearer token de vida longa. Mitigações, todas no banco:
validade com teto de 180 dias, revogação a qualquer momento, um único link ativo
por avaliado, escopo mínimo (só o plano vigente daquele aluno) e nenhuma
devolução de dado sensível (D5).

**D2. Treino vigente é regra de banco, não convenção de tela.** `workout_plans.status`
já aceita `draft/active/archived`, mas nada impede dois planos ativos para o mesmo
avaliado — e "o link mostra o treino vigente" é ambíguo se houver dois. Vira um
índice único parcial em `(subject_id) where status = 'active'`, no mesmo espírito
do `consent_one_active_idx` da 0020. **Isso exige normalizar o dado existente
antes de criar o índice — ver o aviso em §3.**

**D3. O registro do aluno entra direto, marcado pela origem.** A anamnese exige
aceite do treinador porque dispara lógica clínica (liberação, encaminhamento). Uma
sessão de treino não dispara nada disso, e uma fila de revisão por sessão de cada
aluno morreria na primeira semana de uso. O log entra direto, com
`source = 'student'`, e o treinador corrige ou apaga como já faz hoje. A coluna
existe porque `audit_logs.user_id` fica nulo no acesso anônimo: sem ela, ninguém
sabe quem digitou.

**D4. O aluno pode salvar no meio do treino, e salvar duas vezes não duplica.** O
aluno marca as séries localmente e grava quando quiser — o que importa numa
academia com 4G ruim, onde o app já teve problema documentado exatamente nisso. A
mesma sessão gravada de novo **atualiza** a anterior, identificada por um
`client_ref` (uuid gerado no aparelho do aluno) único por plano. Sem isso, três
toques no botão viram três sessões e a adesão do aluno vira ficção.

**D5. Divulgação mínima, mais estrita que a do PDF.** O PDF do treino é entregue
pelo treinador ao aluno deliberadamente; o link pode ser encaminhado, e quem o
abre não é necessariamente o aluno. Então a página pública mostra: marca da
organização, **primeiro nome** do aluno, a prescrição (divisões, exercícios,
séries, reps, RIR, descanso, cadência, notas do exercício, alterações da semana,
observações do plano) e **o histórico de execução do próprio aluno naquele plano**
(última carga por exercício). Não mostra: percentual de gordura, avaliação de
origem, anamnese, postura, telefone, e-mail, nascimento, nome completo, nem dado
de qualquer outro avaliado. O bloco "Base da prescrição" que existe no PDF **não**
vai para a página.

**D6. O token delimita o aluno; o cliente apenas referencia o plano de origem.**
A RPC resolve o avaliado pelo token. Sem `p_plan`, usa o plano vigente; com
`p_plan` — necessário para sincronizar uma sessão feita offline depois da troca
de mesociclo — exige que ele pertença ao mesmo avaliado e esteja `active` ou
`archived`. `draft` é sempre recusado. Cada `exercise_id` precisa ser global ou
da organização do link. Assim a fila sobrevive a uma edição posterior sem abrir
escrita em plano ou catálogo de terceiros.

**D7. Sem consentimento novo, com transparência.** Pela decisão da 0009 execução é
dado operacional e não abre gate de consentimento; além disso, o link não coleta
nenhum dado que o treinador já não tenha. A página exibe uma linha dizendo que os
registros ficam visíveis para o profissional responsável — transparência sem
inventar um aceite que a LGPD não exige aqui e que ninguém leria.

**D8. Anti-abuso mora no banco, sem infra nova.** A RPC anônima **escreve**, o que
é diferente de ler. Tetos de tamanho, de séries por sessão, de sessões por dia e
de gravações por hora ficam na própria linha do link, contados por ela. Sem
serviço externo, sem tabela nova, no espírito do que a 0019 fez para o intake.

**D9. O token cru continua existindo só no aparelho que o gerou.** Igual à 0017: o
banco guarda o hash; a URL fica no `localStorage` do treinador para reexibir
Copiar/WhatsApp. Perdeu o link? Gera outro — e aqui, ao contrário da anamnese,
isso **não custa nada**: os registros pertencem ao plano, não ao token, então
revogar e reemitir não perde histórico nenhum.

**D10. O aluno enxerga o próprio histórico — planos e execuções.** Não só o treino
vigente: os mesociclos anteriores (o que foi prescrito) e as sessões registradas ao
longo do tempo (o que foi feito). É dado do próprio titular, então não fere a
divulgação mínima de D5 — o que ela proíbe é dado *clínico* (composição corporal,
anamnese, postura) e dado de terceiros, não o treino dele.

Uma consequência de projeto: a **última carga por exercício passa a ser buscada em
todo o histórico do aluno, não só no plano vigente**. A 0009 escolheu referenciar
`exercise_id` do catálogo em vez da linha do plano exatamente para que a
progressão sobreviva à troca de mesociclo; buscar só no plano corrente jogaria isso
fora e faria a primeira semana de todo plano novo aparecer sem referência de carga
— que é a semana em que a referência mais importa.

**D11. Funciona sem internet, e isso não custa uma exceção de segurança.** A
academia é o pior lugar de sinal que existe, e o registro acontece exatamente lá.
Três peças, nenhuma delas nova no projeto:

1. o shell já é pré-cacheado pelo service worker, e `navigateFallback` já aponta
   para `/index.html` — abrir `/t` offline já funciona hoje;
2. o **payload do treino** é guardado pelo app em IndexedDB, não pelo service
   worker. A regra do projeto — "o SW **nunca** cacheia o Supabase" — continua
   valendo inteira; quem decide o que persiste é o código, e o que persiste é
   exatamente o pacote de divulgação mínima de D5, sem dado clínico;
3. as sessões feitas offline vão para uma **fila de saída** local e sobem quando
   houver rede.

A fila só é segura porque D4 já existe: repetir o envio com o mesmo `client_ref`
atualiza em vez de duplicar. Sincronizar duas vezes o mesmo treino é inofensivo por
construção — sem isso, "offline" seria sinônimo de adesão inflada.

**D12. O token fica guardado no aparelho do aluno.** Divergência deliberada da
anamnese, que usa `sessionStorage` porque é um formulário de uso único. Aqui o
aluno abre o mesmo link três vezes por semana, e a página precisa abrir **sem o
fragmento** para poder ser instalada (`start_url` de manifest não carrega `#`) e
para funcionar offline depois de reaberta. Então: na primeira visita com token no
fragmento, o token é guardado; nas seguintes, `/t` sem fragmento recupera dali.

O que sustenta essa escolha é D5: um aparelho comprometido dá acesso ao treino da
pessoa e ao histórico de cargas dela — não a laudo, anamnese, foto ou dado de
terceiro. A página oferece **"sair deste aparelho"** (apaga token, cache e fila) e
o treinador revoga do lado dele a qualquer momento.

---

## 2. Máquina de estados do link

```text
   (treinador emite)
         │
         ▼
    ┌────────┐   treinador emite outro   ┌─────────┐
    │ active │ ────────────────────────▶ │ revoked │
    └────────┘   ou revoga explicitamente└─────────┘
         │
         │ expires_at <= now() (purge diário)
         ▼
    ┌─────────┐
    │ expired │
    └─────────┘
```

- `active` — link válido. **No máximo um por avaliado** (índice único parcial).
- `revoked` — o treinador revogou, ou emitiu um novo (emitir revoga o anterior na
  mesma transação).
- `expired` — passou de `expires_at`; marcado pelo purge.

Não há estado "usado": o link é multiuso por natureza (D1). As RPCs sempre exigem
`status = 'active' and expires_at > now()`, então um link expirado já é recusado
antes mesmo do purge rodar.

---

## 3. Modelo de dados — migration `0027_workout_link.sql`

### 3a. AVISO: normalização destrutiva antes do índice de plano vigente

O índice único de D2 não pode ser criado enquanto houver avaliado com dois planos
`active`. A migration normaliza antes, mantendo o mais recente e arquivando os
demais. **Isso muda dado existente.** Conferir antes de aplicar:

```sql
-- quantos avaliados têm mais de um plano ativo (esperado em produção: 0)
select subject_id, count(*) from public.workout_plans
 where status = 'active' group by subject_id having count(*) > 1;
```

```sql
-- normalização determinística: sobrevive o de início mais recente; empate por
-- created_at e id. Arquivar não apaga nada — o plano continua legível.
with ranked as (
  select id, row_number() over (
           partition by subject_id
           order by coalesce(starts_on, created_at::date) desc, created_at desc, id desc
         ) as rn
    from public.workout_plans
   where status = 'active'
)
update public.workout_plans p
   set status = 'archived'
  from ranked r
 where r.id = p.id and r.rn > 1;

create unique index workout_plans_one_active_idx
  on public.workout_plans (subject_id) where status = 'active';
```

Só o índice não basta: com ele, publicar o segundo plano passaria a dar erro de
chave duplicada em vez de trocar o vigente. Quem arquiva o anterior é um trigger,
não a aplicação:

```sql
create or replace function app.single_active_plan()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'active' then
    update public.workout_plans
       set status = 'archived'
     where subject_id = new.subject_id
       and status = 'active'
       and id <> new.id;
  end if;
  return new;
end;
$$;

create trigger workout_plans_single_active
  before insert or update of status on public.workout_plans
  for each row execute function app.single_active_plan();
```

**Por que trigger e não RPC.** O plano é *criado* por `insert` direto do cliente
(`createWorkoutPlan` em `features/workout/api.ts`) e *editado* pela RPC
`save_workout_plan` — dois caminhos. Regra posta só na RPC deixaria o caminho da
criação de fora, que é justamente o mais usado (publicar mesociclo novo). O
trigger fecha os dois e qualquer caminho futuro, na linha do que o projeto já faz
com `org_from_subject`, `check_evaluator` e `check_exercise_scope`.

A recursão termina em um nível: o `update` interno grava `'archived'`, e para
essas linhas o corpo do trigger não faz nada. O índice único continua existindo
como rede — ele é quem barra duas transações concorrentes ativando planos
diferentes para o mesmo aluno, caso em que uma delas falha por conflito, que é o
comportamento correto.

Consequência de produto: publicar o plano B arquiva o A em silêncio. A tela do
treinador avisa antes de salvar ("isto passa a ser o treino vigente de Maria; o
plano X será arquivado"), porque a surpresa é do usuário, não do banco.

### 3b. Tabela `workout_links`

Mesmo arcabouço das filhas: `org_id` herdado do subject por trigger, colunas
relacionais congeladas, `updated_at`, auditoria.

```sql
create table public.workout_links (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  subject_id     uuid not null references public.subjects(id) on delete cascade,
  created_by     uuid not null default auth.uid() references public.profiles(id),
  token_hash     text not null unique,        -- sha256 hex; token cru nunca é gravado
  status         text not null default 'active'
                 check (status in ('active','revoked','expired')),
  expires_at     timestamptz not null,

  -- uso: diagnóstico para o treinador e janela de rate limit (§4d). Sem PII.
  last_seen_at    timestamptz,
  sessions_count  int not null default 0,
  writes_count    int not null default 0,     -- gravações na janela corrente
  write_window_at timestamptz,                -- início da janela de 1 hora
  last_write_at   timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- o desenho de segurança do token mora no banco, não no front (0019 #8)
  constraint workout_links_ttl_chk check (expires_at <= created_at + interval '180 days')
);

create unique index workout_links_one_active_idx
  on public.workout_links (subject_id) where status = 'active';

create trigger workout_links_b1_org
  before insert on public.workout_links
  for each row execute function app.org_from_subject();
create trigger workout_links_freeze
  before update on public.workout_links
  for each row execute function app.freeze_columns('org_id','subject_id','token_hash','created_by');
create trigger workout_links_updated_at
  before update on public.workout_links
  for each row execute function app.set_updated_at();
create trigger workout_links_audit
  after insert or update or delete on public.workout_links
  for each row execute function app.audit();
```

RLS — só `authenticated`, derivada do subject (`can_view_subject_id` já embute o
gate de MFA desde a 0003). O `anon` nunca toca a tabela: chega só pelas RPCs.

```sql
alter table public.workout_links enable row level security;

create policy workout_links_select on public.workout_links
  for select to authenticated using (app.can_view_subject_id(subject_id));
create policy workout_links_insert on public.workout_links
  for insert to authenticated
  with check (app.can_view_subject_id(subject_id) and created_by = (select auth.uid()));
create policy workout_links_update on public.workout_links
  for update to authenticated using (app.can_view_subject_id(subject_id))
  with check (app.can_view_subject_id(subject_id));
create policy workout_links_delete on public.workout_links
  for delete to authenticated using (app.can_view_subject_id(subject_id));
```

### 3c. Origem e idempotência em `workout_logs`

```sql
alter table public.workout_logs
  add column source text not null default 'trainer'
    check (source in ('trainer','student')),
  add column client_ref uuid;

-- a mesma sessão regravada atualiza, não duplica (D4)
create unique index workout_logs_client_ref_idx
  on public.workout_logs (plan_id, client_ref) where client_ref is not null;

-- congela também a origem e a referência do cliente
drop trigger workout_logs_freeze on public.workout_logs;
create trigger workout_logs_freeze
  before update on public.workout_logs
  for each row execute function app.freeze_columns('org_id','subject_id','plan_id','source','client_ref');
```

`default 'trainer'` mantém todo log existente e todo log da tela do treinador
corretos sem tocar em `create_workout_log`.

### 3d. Purge

```sql
create or replace function public.purge_expired_workout_links(p_limit int default 500)
returns integer
language plpgsql volatile security definer set search_path = ''
-- marca 'expired' os 'active' com expires_at <= now(), em lotes com
-- "for update skip locked", igual purge_expired_anamnese_intakes (0020).
```

Agendar com `service_role`, ao menos diariamente, junto dos purges que já existem.

### 3e. Versão de schema

A migration-base carimbava `0027`; a estabilização vigente carimba
`app_schema_version` em `'0028'`, e `scripts/check-schema-version.mjs` exige a
mesma versão. O gate de deploy bloqueia a ordem errada (front novo com banco
velho).

---

## 4. As RPCs

Todas com `search_path = ''` e nomes qualificados. Padrão do projeto: `revoke
execute from public` e `grant` explícito.

### 4a. `issue_workout_link(p_subject uuid, p_token_hash text, p_expires_at timestamptz)` — treinador

`security invoker` (a RLS do treinador vale por dentro; nada de bypass), no
espírito da 0016. Numa transação: revoga o link ativo do avaliado, se houver, e
insere o novo. Retorna a linha nova.

O token cru é gerado **no cliente** (`crypto.getRandomValues(32)` → base64url, 43
caracteres, 256 bits) e só o hash trafega — mesmo desenho e mesmo `sha256Hex` da
0017. O cru vira a URL `${origin}/t#${raw}`, mostrada uma vez para copiar.

```text
1. select ... from workout_links where subject_id = p_subject and status='active' for update
2. update daquele para status='revoked'
3. insert do novo (org_id vem do trigger; expires_at limitado pelo check de 180 dias)
4. retorna a linha
```

`grant execute to authenticated` apenas.

### 4b. `get_workout_for_link(p_token text)` — anon lê o treino vigente

`security definer`, `grant execute to anon, authenticated`. Retorna **um `jsonb`**
— e não uma tabela como `get_anamnese_intake` — porque a resposta é uma árvore
(divisões → exercícios, semanas → alterações) e o cliente anônimo não pode fazer
join. Uma ida de rede, uma resposta.

Resolve: `token_hash` → link `active` e não expirado → `subject` → plano
`active` daquele subject. Qualquer elo faltando devolve `null`, e a página mostra
"link inválido ou expirado" — sem distinguir os casos, para não confirmar
existência de token.

Conteúdo (D5), na forma que a página consome:

```jsonc
{
  "org_name": "Estúdio Corpo & Movimento",
  "subject_first_name": "Maria",
  "link_expires_at": "2026-12-01T00:00:00Z",
  "current_plan_sessions": 7,
  "plan": { "id": "...", "name": "...", "goal": "hypertrophy", "weeks": 8,
            "starts_on": "2026-06-01", "weekly_schedule": ["A","B","A","C"],
            "notes": "..." },
  "days": [{ "id": "...", "label": "A", "name": "...", "position": 0 }],
  "exercises": [{ "id": "...", "day_id": "...", "exercise_id": "...",
                  "name": "Supino reto com barra", "position": 0,
                  "sets": 4, "reps": "8-12", "rir": 2, "rest_seconds": 90,
                  "tempo": "2-0-2", "notes": null }],
  "weeks": [{ "week_number": 1, "label": "Bloco 1", "is_deload": false }],
  "overrides": [{ "week_number": 2, "workout_exercise_id": "...", "sets": 5,
                  "reps": "6-10", "rir": 1, "rest_seconds": 120,
                  "is_skipped": false, "notes": null }],
  "last_sets": [{ "exercise_id": "...", "performed_at": "2026-06-10",
                  "weight_kg": 40, "reps": 10, "rir": 2 }],
  "history_plans": [{ "id": "...", "name": "Mesociclo de força", "goal": "strength",
                      "weeks": 8, "starts_on": "2026-03-01", "status": "archived",
                      "sessions": 21 }]
}
```

`last_sets` é a melhor série da última sessão de cada exercício **em todo o
histórico do aluno**, não só no plano vigente (D10) — é o que faz a página valer
alguma coisa dentro da academia ("da última vez você fez 40 kg × 10"), inclusive na
semana 1 de um mesociclo novo.

`history_plans` são os planos anteriores do aluno (mais recentes primeiro, teto de
24), só o cabeçalho e a contagem de sessões; o conteúdo de um deles vem sob demanda
por `get_workout_plan_for_link` (§4e).

Efeito colateral deliberado: a função é `volatile` e atualiza `last_seen_at`
quando o último acesso foi há mais de uma hora. Custa uma escrita esporádica e dá
ao treinador o sinal "o aluno abriu o treino".

### 4c. `submit_workout_session(...)` — anon grava a sessão

`security definer`, `grant execute to anon, authenticated`.

```sql
submit_workout_session(
  p_token        text,
  p_client_ref   uuid,      -- idempotência (D4)
  p_day_label    text,
  p_week_number  int,
  p_performed_at date,
  p_sets         jsonb,     -- [{exercise_id, set_number, weight_kg, reps, rir}]
  p_notes        text,
  p_plan         uuid       -- plano de origem da fila; não amplia o aluno do token
) returns jsonb              -- { "ok": true, "log_id": "..." }
```

Validação, nesta ordem (a primeira que falhar aborta):

1. link `active`, não expirado → senão `'link invalido ou expirado'`;
2. plano vigente existe ou `p_plan` pertence ao mesmo subject e está
   `active/archived` → senão `'sem treino vigente'` ou recusa do plano;
3. rate limit da janela (§4d);
4. `pg_column_size(p_sets) <= 16384` e `jsonb_array_length(p_sets) between 1 and 60`;
5. `char_length(p_notes) <= 600`;
6. `p_day_label` existe entre as divisões do plano (ou é nulo);
7. `p_week_number` entre 1 e `plan.weeks` (ou nulo);
8. `p_performed_at` entre `current_date - 7` e `current_date`. A janela é de sete
   dias, e não de um ou dois, **por causa do offline (D11)**: quem treinou na
   quarta sem sinal e só voltou a ter rede no domingo precisa que a sessão suba
   com a data em que aconteceu, senão o histórico mente e a adesão da semana some.
   Reescrever data antiga além disso continua sendo do treinador;
9. **todo `exercise_id` é global ou pertence à organização do link** (D6);
10. `set_number` entre 1 e 50 e `(exercise_id, set_number)` sem repetição no
    payload — a `unique (log_id, exercise_id, set_number)` da 0009 já barraria,
    mas o erro precisa ser legível.

Efeito:

```text
1. localiza log por (plan_id, client_ref); insere se não existe (source='student'),
   senão atualiza day_label/week_number/notes e preserva `performed_at` da criação
2. delete das séries daquele log + insert das novas (mesmo padrão "apaga filhas e
   regrava" que save_workout_plan usa)
3. contadores do link: writes_count + 1, last_write_at = now();
   sessions_count + 1 apenas quando o log foi criado agora
4. retorna { ok, log_id } — nada de dado de volta
```

Tudo numa transação: sessão sem série ou série órfã é exatamente o defeito que a
0019 corrigiu no `create_workout_log`.

### 4d. Rate limit (D8)

Na própria linha do link, sem tabela nova:

- janela de 1 hora em `write_window_at`; ao expirar, zera `writes_count`;
- **30 gravações por hora** por link — cobre um treino inteiro salvo várias vezes,
  cobre a fila offline subindo vários dias de uma vez, e ainda assim limita um
  cliente em laço;
- **3 sessões por data de execução** (`plan_id`, `performed_at`, `source='student'`).
  O teto é por `performed_at` e **não** por `created_at`: contar pela data de
  gravação faria a sincronização de uma semana offline (D11) bater no limite e ser
  recusada justamente no caso que a feature precisa atender. Ninguém treina o mesmo
  plano quatro vezes no mesmo dia;
- estourar qualquer teto levanta exceção com mensagem neutra
  (`'muitas gravacoes; tente de novo mais tarde'`), sem revelar contador.

Enumerar token continua inviável por entropia (256 bits); o limite existe contra
o portador legítimo em laço e contra um token vazado sendo usado para inflar a
base.

### 4e. `get_workout_plan_for_link(p_token text, p_plan uuid)` — anon lê um plano anterior

`security definer`, `grant to anon, authenticated`. Mesma forma de resposta do §4b
(sem `history_plans` e sem `last_sets`), para um plano específico. Valida que
`plan.subject_id = link.subject_id` — sem isso, quem tem um token válido leria o
plano de qualquer avaliado da base pelo id. Plano de outro avaliado devolve `null`,
igual a plano inexistente.

### 4f. `get_workout_history_page_for_link(...)` — anon lê o histórico

`security definer`, `grant to anon, authenticated`. Sessões do próprio aluno, mais
recentes primeiro, com as séries de cada uma; `p_limit` entre 1 e 60 (padrão 30) e
cursor opcional formado por `performed_at`, `created_at` e `id`. O cursor só é
aceito completo e a comparação lexicográfica impede saltar ou repetir sessões da
mesma data. Como `performed_at`, `created_at` e `id` são imutáveis para a sessão,
uma revisão concorrente também não consegue mover uma linha já vista para o outro
lado do cursor. A RPC antiga permanece apenas para a janela de compatibilidade da
0027. **Todos os planos**, não só o vigente (D10), com nomes já resolvidos — o
cliente anônimo não faz join.

Uma sessão traz: `id`, `performed_at`, `day_label`, `week_number`, `plan_name`,
`source`, `notes` e as séries (`exercise_id`, `exercise_name`, `set_number`,
`weight_kg`, `reps`, `rir`). `source` aparece para o aluno distinguir o que ele
registrou do que o treinador registrou por ele.

### 4g. `revoke_workout_link(p_link uuid)` — treinador

`security invoker`. Marca `revoked`. Existe como RPC, e não como `update` direto,
só para o app ter um caminho único e auditável; a policy de update já permitiria.

---

## 5. Página pública do aluno

**Rota `/t`, token no fragmento** (`/t#<token>`) — nasce já no formato que a
anamnese só alcançou depois, sem forma legada com token no path.

`src/lib/routing.ts` ganha `isWorkoutLinkPath(pathname)` (`/t` e `/t/`) e um
`isPublicTokenPath = isIntakePath || isWorkoutLinkPath`, que passa a ser o que
`resolveRedirect`, `App.tsx` e `features/pwa/updateCheck` consultam.
`isIntakePath` continua existindo com o significado atual (o teste de
equivalência dos predicados, citado no DECISIONS, precisa cobrir o novo).

Layout próprio e enxuto: marca da organização, "Olá, Maria", sem nav, sem PWA
shell, sem exigir org nem MFA. Usa o client `anon` que já existe.

Fluxo na tela:

1. **Escolher a divisão do dia** — botões A / B / C com o nome da divisão. A
   sequência semanal (`weekly_schedule`) sugere qual é a próxima pelo que já foi
   registrado, mas o aluno decide.
2. **A semana corrente vem pré-selecionada** — `completedWeeks(starts_on, hoje) + 1`,
   limitada a `[1, plan.weeks]`. O helper `completedWeeks` já existe em
   `features/workout/progress.ts`; entra um `currentWeek` ao lado dele, puro e
   testado, em vez de repetir a conta na página.
3. **Lista de exercícios do dia**, cada um com a prescrição **já mesclada** com a
   alteração da semana escolhida, a última carga registrada, e uma linha por série
   com carga / reps / RIR. Exercício com `is_skipped` na semana aparece marcado
   como "não executar".

   Atenção, porque aqui há uma armadilha conhecida: **não existe hoje um helper
   que resolva a prescrição efetiva de uma semana.** O PDF (`overrideDiff`) e o
   texto do WhatsApp (`planShareText`) formatam o override como *lista do que
   muda*, cada um com seu código. A página do aluno precisa do contrário — o
   valor final a executar —, então entra um módulo puro e testado
   (`features/workout/effective.ts`: base + override → séries/reps/RIR/descanso/
   nota/pulado). Este passa a ser o **terceiro** lugar do app interpretando
   override, e o projeto já tem duas cicatrizes exatamente disso: a regra de
   sessões por semana reescrita em três arquivos e o WhatsApp que contradizia o
   PDF do mesmo plano. Então: o helper nasce em módulo próprio, e o PDF e o texto
   passam a derivar dele o "o que muda" (diff = comparar efetivo contra base) em
   vez de recalcular. Se isso não couber na v1, fica registrado como dívida — mas
   os três não podem divergir.
4. **Marcar conforme faz.** Estado local e rascunho no IndexedDB, isolado pelo
   hash do token, plano, divisão e data. Fechar a aba não perde a sessão em
   andamento, trocar de treino não sobrescreve a anterior e um mesociclo novo
   não herda linhas do anterior.
5. **Salvar** a qualquer momento (D4) e **Concluir treino** no fim. Os dois
   chamam a mesma RPC com o mesmo `client_ref`; o segundo apenas atualiza.
6. Estados: carregando → treino → salvo ("Registrado!") → erro de rede com
   "tentar de novo" que **não perde o que foi digitado**; ou "link inválido ou
   expirado"; ou "seu treinador ainda não publicou um treino" (link válido, sem
   plano vigente).

O `client_ref` é gerado uma vez por sessão de treino (plano + divisão + data) e
vive no rascunho: reabrir a aba continua a mesma sessão em vez de criar outra.
Cada salvamento reserva uma `client_revision` monotônica em transação IndexedDB;
o banco ignora revisão menor. Assim, nem replay tardio nem outra aba consegue
substituir um treino mais completo por um payload parcial.

Nada de PDF, nada de percentual de gordura, nada de anamnese nessa página (D5).

Além do treino do dia, a página tem duas abas rasas: **Histórico** (as sessões
registradas, com as séries, paginadas por `get_workout_history_page_for_link`) e
**Treinos anteriores** (os mesociclos passados, abertos sob demanda por
`get_workout_plan_for_link`). Sem gráfico, sem e1RM, sem comparação — isso é do
treinador, e o aluno que quer ler número já tem a última carga em cada exercício.

---

## 5b. Offline e instalação (D11, D12)

**O que precisa funcionar sem rede:** abrir o app, ver o treino do dia com a
prescrição e a última carga, marcar as séries e "salvar". O que não funciona
offline: emitir link (é do treinador), abrir um plano antigo ainda não visitado e
paginar histórico além do que já foi baixado. Isso é dito na tela, não silenciado.

**Armazenamento local** (`features/workout/studentStore.ts`), tudo em IndexedDB,
chaveado pelo `sha256` do token — nunca pelo token cru, para que o índice do banco
local não seja em si uma cópia da credencial:

| O que | Quando grava | Validade |
| --- | --- | --- |
| Pacote do treino vigente (§4b) | A cada abertura com rede | Até `link_expires_at`; cache legado ou validade inválida é recusado |
| Últimas 30 sessões do histórico | Ao abrir a aba Histórico com rede | Idem |
| Planos anteriores já abertos | Ao abrir cada um com rede | Idem |
| Rascunhos por plano + divisão + data | Ao editar e ao salvar progresso | Até concluir a sessão ou sair do aparelho |
| Fila de saída (sessões não enviadas) | Ao salvar sem rede | Até subir |
| Token | Primeira visita com fragmento | Até "sair deste aparelho" ou revogação |

O service worker **não** entra nisso: ele continua cuidando só do shell estático, e
a regra "nunca cachear o Supabase" fica intacta (D11). Quem persiste dado é o app,
deliberadamente, e só o pacote de divulgação mínima.

**Fila de saída.** Todo envio tenta primeiro atualizar um outbox durável e, sem
rede, a tela diz "salvo no aparelho — vai subir quando houver internet", com o
contador de pendências visível. As mutações da lista são transações IndexedDB
atômicas; flush e envio direto usam Web Lock (com mutex local de fallback). A
subida tenta no `online`, ao reabrir e ao voltar a aba para o primeiro plano.
Cada item carrega `client_ref` e `client_revision`; item aceito sai da fila; item
recusado por regra de negócio deixa de ser reenviado, mas permanece como aviso
legível até o aluno descartá-lo. Assim a falha não some antes de ser vista, não
entra em laço infinito e replay antigo não vence um envio novo.

**Conflito de plano.** Se o treinador publicar um plano novo enquanto o aluno está
offline, a sessão pendente foi feita sobre o plano antigo. A RPC resolve o plano
vigente **no momento do envio**, então gravaria no plano errado. Por isso o envio
carrega também o `plan_id` de origem — não para *escolher* o plano (D6 continua
valendo: quem escolhe é o token), mas para **conferir**: se o vigente mudou, a
sessão é gravada no plano em que foi feita, desde que ele pertença ao mesmo aluno.
Foi assim que o treino aconteceu, e o histórico tem de dizer a verdade.

**Instalação.** Manifest próprio (`public/treino.webmanifest`) com
`start_url: "/t"`, `scope: "/t"`, nome "Meu Treino" e os ícones da marca, ligado
por um `<link rel="manifest">` trocado na rota do aluno. Assim o aluno instala um
app que abre direto no treino, e o treinador continua instalando o Avalix.

**Isto é a parte com risco real de comportamento de navegador**, e vai precisar de
teste em aparelho: dois manifests na mesma origem com escopos diferentes é
suportado, mas o iOS ignora boa parte do manifest em "Adicionar à Tela de Início".
Mitigação de projeto: **a instalação é polimento, não requisito** — o offline
funciona igual numa aba comum do navegador, porque depende do SW e do IndexedDB,
não de estar instalado. Se o install não pegar num aparelho, o aluno salva o link e
tudo continua funcionando.

Uma ressalva honesta sobre iOS: o Safari apaga dado de site sem uso por sete dias
(ITP), e isso atinge a fila de saída de quem sumiu por uma semana. Mitigações:
`navigator.storage.persist()` no primeiro uso e, quando instalado, o armazenamento
persiste. A fila mostra a data de cada pendência, para o aluno saber o que ainda
não subiu.

---

## 6. Lado do treinador

- **Emitir/revogar o link** no detalhe do avaliado (`AvaliadoDetalhe`), não no
  detalhe do plano — o link é do aluno (D1). Botões Copiar / WhatsApp reusando o
  padrão de `IntakeLinkButtons` + `linkStore`, com chave própria
  (`avalix:workoutlink:`) e a mesma regra: em outro aparelho o segredo nunca
  existiu, então o caminho é revogar e emitir de novo — que aqui não custa nada
  (D9).
- **Estado do link** ao lado do botão: "ativo, expira em dd/mm", "aluno abriu há
  2 dias" (`last_seen_at`), "revogado".
- **Sessões registradas pelo aluno** aparecem na lista da tela de execução com
  selo "registrado pelo aluno", e continuam editáveis e apagáveis pelo treinador
  (D3).
- **Adesão e carteira não mudam de fórmula** — passam a ser alimentadas por dado
  real do aluno em vez de depender de o treinador lembrar de registrar. É o ganho
  silencioso desta feature.
- **Publicar plano** arquiva o ativo anterior pelo trigger (D2); a tela avisa
  antes de salvar qual plano será arquivado.

---

## 7. Fora de escopo na v1

Cronômetro de descanso; conversa/comentário aluno↔treinador; foto ou vídeo pelo
aluno; **gráficos** de evolução para o aluno (a lista de sessões e a última carga
entram, curva não); edição ou exclusão de sessão antiga pelo aluno; notificação ao
treinador quando o aluno registra; push notification; mais de um plano vigente por
aluno; e qualquer conteúdo de avaliação, anamnese ou postura na página pública.

---

## 8. Segurança e LGPD — resumo

| Risco | Tratamento |
| --- | --- |
| Enumerar/adivinhar token | 256 bits de entropia; resposta idêntica para inválido e expirado |
| Token vazado (WhatsApp encaminhado) | Revogação imediata pelo treinador; validade com teto de 180 dias; escopo mínimo (D5); nenhum dado sensível exposto |
| Token no log do servidor / Referer | Token viaja no **fragmento**, que o navegador não envia |
| Vazamento do banco | Só o `sha256` é gravado; hash não é token utilizável |
| Escrita em plano alheio ou rascunho | O token delimita o aluno; `p_plan` só referencia plano `active/archived` dele; `draft` é recusado; exercício precisa ser global ou da mesma organização (D6) |
| Cliente em laço / inflar base | Tetos de tamanho, séries, sessões/dia e gravações/hora (§4d) |
| Duplicidade de sessão | `client_ref` único por plano (D4) |
| Não saber quem digitou | `source='student'` + auditoria com ator nulo (D3) |
| Dado que não devia sair | Divulgação mínima explícita e testada (D5) |
| Consentimento | Execução é dado operacional (0009/0010); nenhum dado novo é coletado; a página informa que o registro é visível ao profissional (D7) |
| `anon` alcançar tabela | Nenhuma policy para `anon`; só as RPCs `security definer` |
| Retenção | Purge diário marca expirados; o link morre junto com o avaliado (cascade) |
| Ler plano de outro avaliado pelo id | `get_workout_plan_for_link` confere `plan.subject_id = link.subject_id` (§4e) |
| Dado em repouso no aparelho do aluno | Só o pacote de divulgação mínima (D5): treino e cargas do próprio aluno, nunca dado clínico; "sair deste aparelho" apaga tudo |
| Token guardado no aparelho | Escolha deliberada de D12, sustentada por D5; revogável pelo treinador; some com "sair deste aparelho" |
| Sessão offline gravada no plano errado | O envio confere o `plan_id` de origem contra o vigente e grava no plano em que o treino foi feito (§5b) |

---

## 9. Checklist de teste

**Banco (pgTAP, `supabase/tests/0027_workout_link.test.sql` e
`0028_stabilization_and_security.test.sql`)** — estrutural, pelo
motivo já registrado nos testes 0022/0026 (o `pg_prove` roda como `postgres`, sem
`auth.uid()`):

- [ ] `workout_links` existe com RLS habilitada e nenhuma policy para `anon`.
- [ ] `workout_links_one_active_idx` e `workout_plans_one_active_idx` existem e são únicos parciais.
- [ ] `workout_plans_single_active` existe como trigger `before insert or update of status`.
- [ ] Inserir dois planos `active` para o mesmo subject deixa exatamente um ativo (o segundo), sem erro.
- [ ] `workout_logs.source` e `client_ref` existem, com o check e o índice único.
- [ ] `create_workout_log` continua **sem** grant para `anon` (não regrediu).
- [ ] `get_workout_for_link` e `submit_workout_session` têm grant para `anon` e são `security definer` com `search_path` vazio.
- [ ] `issue_workout_link` é `security invoker` e **não** tem grant para `anon`.
- [ ] O check de 180 dias rejeita `expires_at` além do teto.

**Manual, ponta a ponta:**

- [ ] Emitir link num avaliado → Copiar/WhatsApp aparecem; no banco, só o hash.
- [ ] Emitir de novo → o anterior vira `revoked` e o link velho para de abrir.
- [ ] Abrir `/t#<token>` deslogado → treino vigente, sem redirect para `/login`.
- [ ] Token inválido, expirado e revogado → todos "link inválido ou expirado".
- [ ] Avaliado sem plano ativo → "seu treinador ainda não publicou um treino".
- [ ] Marcar séries e salvar → sessão aparece na execução do treinador com selo "registrado pelo aluno".
- [ ] Salvar de novo a mesma sessão → **atualiza**, não duplica (checar `workout_logs` do plano).
- [ ] Fechar e reabrir a aba no mesmo dia → rascunho recuperado, mesmo `client_ref`.
- [ ] Semana e divisão pré-selecionadas corretamente num plano com `starts_on` no passado.
- [ ] Exercício com override na semana → a página mostra a prescrição alterada, não a base.
- [ ] Enviar `exercise_id` de outro plano (via devtools) → recusado.
- [ ] Enviar 61 séries, payload de 20 kB ou `performed_at` de 10 dias atrás → recusado.
- [ ] Estourar 30 gravações numa hora → mensagem neutra de limite.
- [ ] `set local role anon;` + `select` direto em `workout_links`, `workout_logs` e `workout_plans` → zero linhas.
- [ ] Página do aluno não exibe percentual de gordura, anamnese, nome completo nem outro avaliado (conferir a resposta crua da RPC, não só a tela).
- [ ] Adesão da carteira reflete as sessões registradas pelo aluno.
- [ ] Fluxos antigos intactos: registro pela tela do treinador, link de anamnese, PDF.

**Histórico (D10):**

- [ ] Aba Histórico lista as sessões com séries, das mais recentes para as antigas, e pagina.
- [ ] Sessões registradas pelo treinador aparecem no histórico do aluno, marcadas como tal.
- [ ] Aba Treinos anteriores lista os mesociclos passados e abre o conteúdo de um deles.
- [ ] `get_workout_plan_for_link` com id de plano de OUTRO avaliado → `null`.
- [ ] Exercício repetido em plano novo mostra a última carga vinda do plano anterior.

**Offline (D11/D12):**

- [ ] Abrir `/t#<token>`, fechar, entrar em modo avião e abrir `/t` → treino aparece, sem fragmento.
- [ ] Offline: marcar séries e salvar → "salvo no aparelho", contador de pendências.
- [ ] Voltar a ter rede → fila sobe sozinha; sessão aparece para o treinador com a data em que foi feita, não a de envio.
- [ ] Subir a fila duas vezes (forçando reenvio) → não duplica (`client_ref`).
- [ ] Treinar offline por 3 dias e sincronizar tudo de uma vez → todas entram (teto por `performed_at`, não por data de envio).
- [ ] Treinador publica plano novo enquanto a sessão está na fila → a sessão entra no plano em que foi feita.
- [ ] Link revogado com item na fila → credencial e dados locais são purgados;
  uma recusa definitiva que não invalide o link permanece visível, sem reenvio,
  até ser descartada.
- [ ] "Sair deste aparelho" → token, cache e fila apagados; `/t` sem fragmento passa a mostrar "link inválido".
- [ ] Instalar pelo Chrome/Android → abre em `/t` direto; conferir também no iOS e registrar o comportamento real.

**Suíte do front:** `currentWeek` (puro); `effective.ts` (base + override →
prescrição da semana, incluindo `is_skipped` e campos nulos que não sobrescrevem);
um teste de **não-contradição** entre a prescrição efetiva e o que o PDF e o
WhatsApp dizem do mesmo plano; e `isPublicTokenPath` no teste de equivalência de
predicados de rota que já existe.

---

## 10. Ordem de implementação

1. **Migration 0027**, seguida da estabilização **0028**, seus testes pgTAP e
   `EXPECTED_SCHEMA_VERSION`, além dos módulos
   puros que não dependem dos tipos regenerados (`effective.ts`, `currentWeek`,
   predicado de rota). Aplicada por você no dashboard, com a conferência de §3a
   antes; `gen types` em seguida.
2. **Camada de dados no front**: `features/workout/link.ts` (emitir/revogar,
   `sha256Hex`, linkStore próprio), `features/workout/studentApi.ts` (as RPCs
   anônimas) e `studentStore.ts` (IndexedDB + fila), com os tipos vindos do
   `database.types` regenerado.
3. **Página `/t`**: treino do dia, rascunho, histórico e treinos anteriores.
4. **Offline e instalação**: fila de saída, indicadores de sincronização,
   manifest próprio, `storage.persist()`.
5. **UI do treinador**: emitir/revogar no detalhe do avaliado, selo de origem na
   execução, aviso de qual plano será arquivado ao publicar.
6. **DECISIONS.md** e agendamento do purge.

Nada aqui depende de infra nova: sem Edge Function, sem provedor de e-mail, sem
serviço externo, sem push. É migration, RPCs, uma página e armazenamento local.
