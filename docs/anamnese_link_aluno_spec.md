# Anamnese respondida pelo aluno (link) — Especificação

Objetivo: o personal gera um **link** para um avaliado específico e manda por
WhatsApp/e-mail. O aluno abre **sem login**, responde a anamnese, aceita o termo
(LGPD) e envia. A resposta cai no sistema como **pendente de revisão**, sinalizada
de forma bem visível pro personal, que revisa e **aceita** — só então vira uma
`anamnese` oficial.

Escopo desta v1: **só a anamnese** (não um motor genérico de formulários). A
estrutura é pensada pra generalizar depois, mas nada aqui depende disso.

Fonte de verdade do conteúdo da anamnese: `docs/bodytrack_anamnese_spec.md` e
`src/features/anamnesis/`. Este doc trata só do **caminho aluno→sistema**.

---

## 1. Decisões-chave (e o porquê)

**D1. Resposta entra como pendente e exige aceite do personal.** Quem responde
não é um usuário autenticado; a anamnese dispara lógica clínica séria (liberação /
encaminhamento médico). Um checkpoint humano antes de virar prontuário oficial
evita registro sujo e mantém o profissional no circuito. Decisão do Luiz.

**D2. O token do link é uma credencial, não "segurança por obscuridade".** A 0002
rejeita explicitamente proteger foto por "path difícil de adivinhar". Aqui é
diferente: o token é uma **capability** de uso único (como um link de redefinir
senha) — 256 bits de entropia, com validade, revogável, e o banco guarda só o
**hash** dele (mesmo princípio do hash do texto de consentimento). A linha que ele
destrava não expõe dado de nenhum outro avaliado. Não é obscuridade; é bearer token.

**D3. Abrimos exatamente UMA porta pro anônimo: duas RPCs `security definer`.**
Nenhuma tabela ganha policy pra `anon`. O anônimo só toca o banco através de
`get_anamnese_intake` (ler o formulário) e `submit_anamnese_intake` (enviar), ambas
validando o token por dentro. Mesmo padrão de `create_organization` (0001): a porta
especial é uma função, não uma policy aberta.

**D4. O aluno consente por si mesmo — e isso é um ganho jurídico.** Hoje é o
personal que marca "consentiu" no lugar do aluno. Com o aluno respondendo direto,
**é ele quem aceita o termo**, com data/hora, versão e hash do texto. Guardamos essa
evidência na própria linha do intake; o `consent_records` oficial é criado no
aceite. Isso é LGPD **mais forte** que o fluxo atual, não mais fraco.

**D5. Divulgação mínima pelo link.** O avaliado **já existe** no sistema (o personal
cadastra antes de gerar o link); a anamnese não coleta identidade (nome/nascimento/
sexo moram no cadastro do avaliado). A página pública mostra só: a marca da
organização (nome/logo), o **primeiro nome** do aluno (saudação) e o **sexo**
(necessário pra decidir a seção B6, saúde da mulher). Nada de telefone, e-mail,
observações, nascimento, nem dado de qualquer outro avaliado. Quem tem o token é o
próprio aluno; esse mínimo é o que o formulário precisa funcionar.

---

## 2. Máquina de estados do intake

```text
  (personal gera link)
        │
        ▼
   ┌─────────┐   aluno envia    ┌───────────┐  personal aceita  ┌──────────┐
   │ pending │ ───────────────▶ │ submitted │ ────────────────▶ │ accepted │
   └─────────┘                  └───────────┘                   └──────────┘
        │                             │  personal recusa
        │ expira / personal revoga    ▼
        ▼                        ┌──────────┐
   ┌──────────┐                  │ rejected │
   │ canceled │                  └──────────┘
   └──────────┘
```

- `pending` — link criado, aluno ainda não respondeu. Expira em `expires_at`.
- `submitted` — aluno respondeu; **aguardando revisão** (o estado que precisa gritar).
- `accepted` — personal aceitou → gerou a `anamnese` (`resulting_anamnese_id`).
- `rejected` — personal descartou (resposta inconsistente, teste, etc.).
- `canceled` — personal revogou o link antes de responder, ou expirou.

Único-uso: `submit` só age sobre `pending` não expirado. Reenvio = revogar e gerar
outro link.

---

## 3. Modelo de dados — migration `0017_anamnese_intakes.sql`

Segue o mesmo padrão das outras filhas: `org_id` herdado do subject por trigger,
colunas relacionais congeladas, `updated_at`, auditoria. `payload` é a fonte de
verdade das respostas (igual `anamneses.payload`).

```sql
create table public.anamnese_intakes (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  subject_id      uuid not null references public.subjects(id) on delete cascade,
  created_by      uuid not null default auth.uid() references public.profiles(id),
  token_hash      text not null unique,          -- sha256 do token; token cru nunca é gravado
  status          text not null default 'pending'
                  check (status in ('pending','submitted','accepted','rejected','canceled')),
  expires_at      timestamptz not null,
  spec_version    text not null,                 -- versão da spec vigente na geração

  -- preenchidos no envio (anon), nulos até lá
  submitted_at    timestamptz,
  payload         jsonb,

  -- evidência de consentimento dado pelo próprio aluno (D4)
  consent_version      text,
  consent_text_sha256  text,
  signer_kind          text check (signer_kind in ('titular','responsavel')),
  signer_name          text,
  submit_user_agent    text,

  -- preenchidos na revisão
  reviewed_at          timestamptz,
  reviewed_by          uuid references public.profiles(id),
  resulting_anamnese_id uuid references public.anamneses(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index anamnese_intakes_subject_idx on public.anamnese_intakes (subject_id, created_at desc);
create index anamnese_intakes_pending_idx on public.anamnese_intakes (org_id) where status = 'submitted';

create trigger anamnese_intakes_b1_org
  before insert on public.anamnese_intakes
  for each row execute function app.org_from_subject();
create trigger anamnese_intakes_freeze
  before update on public.anamnese_intakes
  for each row execute function app.freeze_columns('org_id','subject_id','token_hash','created_by');
create trigger anamnese_intakes_updated_at
  before update on public.anamnese_intakes
  for each row execute function app.set_updated_at();
create trigger anamnese_intakes_audit
  after insert or update or delete on public.anamnese_intakes
  for each row execute function app.audit();   -- audit_logs.user_id é nullable: submit anônimo grava ator nulo, ok
```

RLS — só `authenticated`, derivada do subject (anon nunca toca a tabela direto):

```sql
alter table public.anamnese_intakes enable row level security;

create policy anamnese_intakes_select on public.anamnese_intakes
  for select to authenticated using (app.can_view_subject_id(subject_id));

create policy anamnese_intakes_insert on public.anamnese_intakes
  for insert to authenticated
  with check (app.can_view_subject_id(subject_id) and created_by = (select auth.uid()));
  -- gerar link NÃO exige consentimento prévio: o consentimento vem do aluno

create policy anamnese_intakes_update on public.anamnese_intakes
  for update to authenticated
  using (app.can_view_subject_id(subject_id))
  with check (app.can_view_subject_id(subject_id));

create policy anamnese_intakes_delete on public.anamnese_intakes
  for delete to authenticated using (app.can_view_subject_id(subject_id));
```

---

## 4. As RPCs

### 4a. Gerar o link (cliente autenticado, sem RPC nova)

O token cru é gerado **no cliente** e só o hash vai pro banco — o cru nunca trafega
pro servidor a não ser dentro do próprio link montado. Reusa `sha256Hex`.

```ts
// features/anamnesis/intake.ts (esboço)
const raw = base64url(crypto.getRandomValues(new Uint8Array(32))) // 256 bits
const token_hash = await sha256Hex(raw)
await supabase.from('anamnese_intakes').insert({
  subject_id, org_id, token_hash, spec_version: SPEC_VERSION,
  expires_at: addDays(new Date(), 7).toISOString(),
})
const link = `${location.origin}/a/${raw}`   // mostrado uma vez pro personal copiar
```

O personal vê o link com botões **Copiar** e **Compartilhar no WhatsApp**
(`https://wa.me/?text=...`). Depois disso o cru some (só o hash ficou no banco).

### 4b. `get_anamnese_intake(p_token text)` — anon lê o formulário

`security definer`, `search_path=''`, `grant execute to anon`. Divulgação mínima (D5):

```sql
returns table (org_name text, org_logo_path text, subject_first_name text, subject_sex text, spec_version text)
-- valida: existe intake com token_hash = sha256(p_token), status='pending', expires_at > now()
-- se não: retorna vazio → página mostra "link inválido ou expirado"
-- retorna SÓ marca da org + primeiro nome + sexo (p/ B6). Nada além disso.
```

> O hash do token é feito em SQL com `sha256()` nativo do Postgres
> (`encode(sha256(convert_to(p_token,'UTF8')),'hex')`) — mesmo hex do `sha256Hex()`
> do front. Server-side de propósito: vazamento do banco revela só o hash, não um
> token usável.

### 4c. `submit_anamnese_intake(...)` — anon envia

`security definer`, `search_path=''`, `grant execute to anon`. Args: token, payload,
signer_name, signer_kind, consent_version, consent_text_sha256, user_agent.

```text
1. localizar intake por hash(token) com status='pending' e não expirado; senão → erro
2. exigir consentimento aceito (signer_name não-vazio + campos de consent presentes)
3. update: status='submitted', submitted_at=now(), payload, + evidência de consent
4. único-uso garantido pelo filtro status='pending' (2º envio não acha nada)
5. retorno mínimo: ok boolean (nada de dado de volta)
```

Validação profunda do payload é client-side (zod, o mesmo do form) e **revalidada no
aceite**. O gate NÃO é confiado do cliente do aluno: é recalculado
no aceite, a partir do `payload`, pelo módulo puro `computeGate` (já é assim no
`createAnamnese` hoje).

### 4d. `accept_anamnese_intake(p_intake, p_liberado, p_nivel, p_flag)` — personal aceita (atômico)

`security invoker` (RLS do personal vale por dentro), no espírito da 0016. Numa
transação: cria o `consent_records` (com a evidência do aluno; `collected_by` = o
personal que aceitou, `signer_kind`/`signer_name` do aluno) **e** cria a `anamnese`
a partir do `payload`, e marca o intake `accepted` + `resulting_anamnese_id`.

> Ordem importa: `anamneses_insert` exige `has_active_consent`. Por isso o
> consent é criado **antes** da anamnese, na mesma transação. O gate
> (`liberado`/`nível`/`flag`) é recalculado no TS do personal a partir do payload
> (mesma confiança do `createAnamnese` atual, que já calcula no cliente) e passado
> como parâmetro — a lógica clínica fica no módulo puro testado, não no banco.

Recusar = RPC/update simples marcando `rejected`.

---

## 5. Página pública (aluno)

- **Rota nova, fora do AppShell e fora da auth:** `/a/:token`. Precisa abrir com o
  visitante **deslogado** sem cair no `/login`. Ajustar `src/lib/routing.ts`:
  `isPublicPath` passa a aceitar prefixo `/a/` (e `resolveRedirect` respeita isso).
  O `RouteGuard` deixa a rota passar.
- **Layout enxuto próprio** (logo da org + título "Anamnese"), sem nav, sem PWA
  shell, sem exigir org/MFA. Usa o client `anon` que já existe (`lib/supabase`).
- **Reaproveitar o formulário:** hoje ele mora dentro de `src/pages/AnamneseNova.tsx`.
  Extrair o corpo pra um componente compartilhado `features/anamnesis/AnamneseForm.tsx`,
  consumido por (a) `AnamneseNova` (personal) e (b) a página pública. O bloco de
  **consentimento** (texto + aceite + nome/tipo do signatário) aparece no fim do
  form público.
- Estados da página: carregando → formulário → **enviado** ("Recebido! Seu
  profissional vai revisar.") ; ou **link inválido/expirado**.

---

## 6. Pendência bem visível (o pedido central)

Sinalização em três camadas, forte porque é item de ação, não lembrete passivo:

1. **Badge global no AppShell.** Ponto/contador vermelho no item "Início" quando há
   intakes `submitted` na org. É pra onde o olho vai.
2. **Card de destaque no Dashboard.** Na seção "Lembretes" (já existe em
   `Dashboard.tsx`), um card com acento de alerta — **"Anamneses aguardando
   revisão"** — listando os avaliados com envio pendente e botão **Revisar**.
   Visualmente mais forte que "Para reavaliar" (é ação, não aviso).
3. **No detalhe do avaliado.** Em `AvaliadoDetalhe.tsx → AnamneseSection`, o intake
   pendente aparece no topo com selo "Aguardando revisão" e botão **Revisar**, além
   do estado "aguardando o aluno responder" quando o link foi enviado mas não
   respondido.

Fonte barata dos números: uma view `security_invoker` no estilo da 0016
(`pending_anamnese_intakes`) que conta/lista os `submitted` por org — uma query
alimenta badge + card.

> Fora de escopo na v1 (mas o próximo passo natural pra "não esquecer de vez"):
> **e-mail/WhatsApp pro personal quando o aluno envia**. Exige gatilho server-side
> (Supabase Database Webhook ou Edge Function + provedor de e-mail). Deixei de fora
> pra não introduzir infra nova agora; as três camadas in-app já resolvem o "não
> cair em esquecimento" enquanto o app está aberto.

---

## 7. Segurança / LGPD — resumo

- Token: 256 bits, uso único, expira (padrão 14 dias), revogável; só o hash no banco.
- Anônimo só alcança o banco por 2 RPCs `security definer` que validam o token;
  nenhuma policy aberta pra `anon`. Enumerar token é inviável (256 bits).
- Divulgação mínima: o link não devolve dado do avaliado (D5).
- Consentimento dado pelo próprio titular, com timestamp/versão/hash — evidência na
  linha do intake; `consent_records` oficial criado no aceite (D4).
- Dado só vira prontuário oficial após revisão humana (D1).
- Auditoria: a tabela entra no `app.audit()`; o envio anônimo registra ator nulo
  (`audit_logs.user_id` é nullable — verificado).

**A verificar na implementação:** rate-limit das RPCs anônimas (Supabase não tem
nativo; o token de 256 bits já torna brute force inviável, mas avaliar um limite
simples se virar preocupação); confirmar que `app.org_from_subject` existe com esse
nome (é o `anamneses_b1_org`/`app.org_from_subject()` da 0005).

---

## 8. Checklist de teste

- [ ] Gerar link num avaliado → aparece com Copiar/WhatsApp; hash gravado, cru não.
- [ ] Abrir `/a/<token>` deslogado → mostra marca da org e formulário (sem redirect a login).
- [ ] `/a/<token-invalido>` e link expirado → "link inválido ou expirado".
- [ ] Responder + aceitar termo + enviar → tela "Recebido"; intake vira `submitted`.
- [ ] Reenviar o mesmo link → recusado (uso único).
- [ ] Logado: badge no AppShell, card no Dashboard e selo no detalhe aparecem.
- [ ] Revisar → aceitar → cria `consent_records` + `anamnese` (gate recalculado); intake `accepted`; some das pendências.
- [ ] Recusar → intake `rejected`; nada criado.
- [ ] `set local role anon;` + select direto em `anamnese_intakes` → zero linhas (RLS).
- [ ] Revogar link `pending` → `canceled`; abrir depois → inválido.
- [ ] Menor de idade: `signer_kind='responsavel'` capturado e propagado ao consent.

---

## 9. Sugestão de atualização do DECISIONS.md

Registrar: (1) anamnese auto-preenchida por link com aceite obrigatório do personal
(D1); (2) padrão de **capability token** (hash no banco, uso único, expira) como
mecanismo aprovado pra acesso anônimo pontual — distinto de "segurança por path"
(D2/D3); (3) consentimento dado pelo titular via link como base LGPD reforçada (D4);
(4) nova migration 0017 e as RPCs `get/submit/accept_anamnese_intake`.
