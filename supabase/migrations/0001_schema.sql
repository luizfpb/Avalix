-- BodyTrack - migration 0001: schema base (rev. Etapa 2.1)
-- Rodar no SQL Editor do Supabase (ou via supabase db push).
-- Convencao: tabelas/colunas em ingles pra evitar acento e palavra reservada;
-- termos de dominio em pt-BR ficam na UI.
--
-- Camadas de protecao (nao misturar os papeis):
--   RLS (0002)       -> quem enxerga/escreve o que (visibilidade)
--   triggers (aqui)  -> consistencia relacional, paths canonicos, imutabilidade
--   constraints      -> dominio dos valores
--
-- Triggers before insert da mesma tabela disparam em ordem alfabetica de nome.
-- Por isso o prefixo b1/b2: b1 resolve org/paths a partir do pai, b2 valida
-- o que depende de org ja estar preenchido. Nao renomear sem olhar isso.

create extension if not exists pgcrypto;

-- schema "app": funcoes internas que nao devem ser expostas pela API REST
create schema if not exists app;

-- =====================================================================
-- PERFIS (espelho de auth.users)
-- =====================================================================

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  created_at  timestamptz not null default now()
);

-- cria o profile automaticamente no signup
create or replace function app.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- =====================================================================
-- ORGANIZACOES E MEMBROS
-- profissional solo = organizacao com 1 membro (owner)
-- =====================================================================

create table public.organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(name) between 1 and 120),
  -- termo exibido na UI no lugar de "avaliado"
  subject_term        text not null default 'avaliado'
                      check (subject_term in ('aluno','cliente','paciente','atleta','avaliado')),
  -- se true, avaliadores comuns enxergam todos os avaliados da org
  evaluators_see_all  boolean not null default false,
  logo_path           text,
  created_at          timestamptz not null default now()
);

create table public.org_members (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('owner','admin','evaluator')),
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index org_members_user_idx on public.org_members (user_id);

-- helpers de autorizacao usados por policies e triggers.
-- security definer evita recursao de RLS ao consultar org_members;
-- search_path vazio obriga a qualificar tudo (mitiga hijack de schema).

create or replace function app.is_member(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = (select auth.uid())
  );
$$;

create or replace function app.role_in(p_org uuid, p_roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.role = any(p_roles)
  );
$$;

-- quem pode ser atribuido como avaliador responsavel:
-- precisa ser membro da org; owner/admin atribuem a qualquer membro,
-- avaliador comum so atribui a si mesmo.
create or replace function app.can_assign_evaluator(p_org uuid, p_evaluator uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
           select 1 from public.org_members m
           where m.org_id = p_org and m.user_id = p_evaluator
         )
         and (
           app.role_in(p_org, array['owner','admin'])
           or p_evaluator = (select auth.uid())
         );
$$;

-- criacao de org + membership owner numa transacao so (chamada via supabase.rpc)
create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'nao autenticado';
  end if;
  insert into public.organizations (name) values (p_name) returning id into v_org;
  insert into public.org_members (org_id, user_id, role)
  values (v_org, (select auth.uid()), 'owner');
  return v_org;
end;
$$;

revoke execute on function public.create_organization(text) from anon, public;
grant execute on function public.create_organization(text) to authenticated;

-- =====================================================================
-- GUARDS GENERICOS
-- =====================================================================

-- congela colunas relacionais depois do insert. errou o pai: apaga e recria.
-- uso: create trigger x before update ... execute function app.freeze_columns('org_id','subject_id');
create or replace function app.freeze_columns()
returns trigger
language plpgsql
as $$
declare
  col text;
begin
  foreach col in array tg_argv loop
    if (to_jsonb(new) ->> col) is distinct from (to_jsonb(old) ->> col) then
      raise exception 'coluna % de % e imutavel apos a criacao', col, tg_table_name;
    end if;
  end loop;
  return new;
end;
$$;

-- valida evaluator_id no insert e quando ele for alterado num update.
-- nao roda em update que nao mexe no evaluator (senao bloquearia edicao
-- legitima de outro avaliador quando evaluators_see_all = true).
create or replace function app.check_evaluator()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.evaluator_id is not distinct from old.evaluator_id then
    return new;
  end if;
  if new.evaluator_id is null then
    raise exception 'evaluator_id e obrigatorio';
  end if;
  if not app.can_assign_evaluator(new.org_id, new.evaluator_id) then
    raise exception 'evaluator_id invalido: nao e membro da organizacao ou voce nao pode atribuir a outra pessoa';
  end if;
  return new;
end;
$$;

create or replace function app.set_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================================
-- AVALIADOS (subjects)
-- =====================================================================

create table public.subjects (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  -- not null + restrict: avaliado ativo sempre tem responsavel. consequencia:
  -- excluir uma conta exige excluir/reatribuir a org antes (fluxo documentado).
  evaluator_id          uuid not null default auth.uid()
                        references public.profiles(id) on delete restrict,
  full_name             text not null check (char_length(full_name) between 1 and 160),
  birth_date            date not null check (birth_date > date '1900-01-01' and birth_date <= current_date),
  -- sexo biologico p/ selecao de protocolo (as equacoes sao validadas por sexo)
  sex                   text not null check (sex in ('M','F')),
  height_cm             numeric(4,1) check (height_cm between 50 and 250),
  phone                 text,
  email                 text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  notes                 text,
  is_active             boolean not null default true,
  -- responsavel legal (obrigatorio na pratica p/ menor de 18; validado no app
  -- e no fluxo de consentimento, nao da pra travar por CHECK porque idade muda)
  guardian_name         text,
  guardian_relationship text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index subjects_org_idx on public.subjects (org_id, is_active);
create index subjects_evaluator_idx on public.subjects (evaluator_id);

create trigger subjects_b2_evaluator
  before insert or update on public.subjects
  for each row execute function app.check_evaluator();

create trigger subjects_freeze
  before update on public.subjects
  for each row execute function app.freeze_columns('org_id');

create trigger subjects_updated_at
  before update on public.subjects
  for each row execute function app.set_updated_at();

-- =====================================================================
-- AVALIACAO FISICA
-- org_id e denormalizado nas filhas pra policy de RLS nao precisar de join;
-- triggers b1 copiam do pai ignorando o que vier do cliente, e o freeze
-- impede mover o registro de pai/org depois.
-- =====================================================================

create table public.assessments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  subject_id      uuid not null references public.subjects(id) on delete cascade,
  evaluator_id    uuid not null default auth.uid() references public.profiles(id),
  assessed_at     date not null default current_date,
  -- id do protocolo no registry em TS (ex.: 'jp7'); null = avaliacao sem protocolo
  protocol_id     text,
  weight_kg       numeric(5,2) not null check (weight_kg between 20 and 400),
  height_cm       numeric(4,1) not null check (height_cm between 50 and 250),
  notes           text,
  -- snapshot dos resultados calculados no momento do salvamento.
  -- garante que um PDF emitido continue reproduzivel mesmo se o engine mudar.
  results         jsonb,
  engine_version  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index assessments_subject_date_idx on public.assessments (subject_id, assessed_at desc);
create index assessments_org_idx on public.assessments (org_id);

-- copia org_id do subject (ignora o que vier do cliente)
create or replace function app.org_from_subject()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select s.org_id into new.org_id from public.subjects s where s.id = new.subject_id;
  if new.org_id is null then
    raise exception 'subject inexistente';
  end if;
  return new;
end;
$$;

-- copia org_id da assessment
create or replace function app.org_from_assessment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select a.org_id into new.org_id from public.assessments a where a.id = new.assessment_id;
  if new.org_id is null then
    raise exception 'assessment inexistente';
  end if;
  return new;
end;
$$;

-- copia org_id da foto
create or replace function app.org_from_photo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select p.org_id into new.org_id from public.posture_photos p where p.id = new.photo_id;
  if new.org_id is null then
    raise exception 'foto inexistente';
  end if;
  return new;
end;
$$;

create trigger assessments_b1_org
  before insert on public.assessments
  for each row execute function app.org_from_subject();

create trigger assessments_b2_evaluator
  before insert or update on public.assessments
  for each row execute function app.check_evaluator();

create trigger assessments_freeze
  before update on public.assessments
  for each row execute function app.freeze_columns('org_id', 'subject_id');

create trigger assessments_updated_at
  before update on public.assessments
  for each row execute function app.set_updated_at();

-- circunferencias em cm; site usa slug fixo do app ou texto livre se is_custom
create table public.circumference_readings (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  assessment_id  uuid not null references public.assessments(id) on delete cascade,
  site           text not null check (char_length(site) between 1 and 60),
  is_custom      boolean not null default false,
  value_cm       numeric(5,1) not null check (value_cm between 10 and 250),
  created_at     timestamptz not null default now(),
  unique (assessment_id, site)
);

create index circumference_assessment_idx on public.circumference_readings (assessment_id);

create trigger circumference_b1_org
  before insert on public.circumference_readings
  for each row execute function app.org_from_assessment();

create trigger circumference_freeze
  before update on public.circumference_readings
  for each row execute function app.freeze_columns('org_id', 'assessment_id');

-- dobras em mm; ate 3 afericoes por ponto, media calculada no app
create table public.skinfold_readings (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  assessment_id  uuid not null references public.assessments(id) on delete cascade,
  site           text not null check (char_length(site) between 1 and 60),
  reading_1      numeric(4,1) not null check (reading_1 between 1 and 99),
  reading_2      numeric(4,1) check (reading_2 between 1 and 99),
  reading_3      numeric(4,1) check (reading_3 between 1 and 99),
  notes          text,
  created_at     timestamptz not null default now(),
  unique (assessment_id, site)
);

create index skinfold_assessment_idx on public.skinfold_readings (assessment_id);

create trigger skinfold_b1_org
  before insert on public.skinfold_readings
  for each row execute function app.org_from_assessment();

create trigger skinfold_freeze
  before update on public.skinfold_readings
  for each row execute function app.freeze_columns('org_id', 'assessment_id');

-- =====================================================================
-- AVALIACAO POSTURAL
-- =====================================================================

create table public.posture_sessions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  subject_id    uuid not null references public.subjects(id) on delete cascade,
  evaluator_id  uuid not null default auth.uid() references public.profiles(id),
  taken_at      date not null default current_date,
  notes         text,
  created_at    timestamptz not null default now()
);

create index posture_sessions_subject_idx on public.posture_sessions (subject_id, taken_at desc);

create trigger posture_sessions_b1_org
  before insert on public.posture_sessions
  for each row execute function app.org_from_subject();

create trigger posture_sessions_b2_evaluator
  before insert or update on public.posture_sessions
  for each row execute function app.check_evaluator();

create trigger posture_sessions_freeze
  before update on public.posture_sessions
  for each row execute function app.freeze_columns('org_id', 'subject_id');

-- fotos: o cliente NAO manda path. o trigger b1 resolve org/subject pela
-- sessao e gera o path canonico a partir dos proprios ids. o que vier de
-- storage_path/thumb_path no insert e descartado. a unica escolha do
-- cliente e o formato (webp com fallback jpeg no Safari).
create table public.posture_photos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  session_id    uuid not null references public.posture_sessions(id) on delete cascade,
  category      text not null check (category in ('frente','costas','lateral_direita','lateral_esquerda','outra')),
  custom_label  text,
  format        text not null default 'webp' check (format in ('webp','jpeg')),
  -- canonicos, gerados pelo trigger:
  --   {org_id}/{subject_id}/{session_id}/{photo_id}.{ext}
  --   {org_id}/{subject_id}/{session_id}/{photo_id}_thumb.{ext}
  storage_path  text not null unique,
  thumb_path    text not null unique,
  width         int,
  height        int,
  size_bytes    int,
  created_at    timestamptz not null default now()
);

create index posture_photos_session_idx on public.posture_photos (session_id);

create or replace function app.posture_photo_init()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_subject uuid;
  v_ext     text;
  v_base    text;
begin
  select ps.org_id, ps.subject_id
    into new.org_id, v_subject
    from public.posture_sessions ps
   where ps.id = new.session_id;

  if new.org_id is null then
    raise exception 'sessao inexistente';
  end if;

  v_ext  := case when new.format = 'jpeg' then 'jpg' else 'webp' end;
  v_base := new.org_id::text || '/' || v_subject::text || '/'
            || new.session_id::text || '/' || new.id::text;

  new.storage_path := v_base || '.' || v_ext;
  new.thumb_path   := v_base || '_thumb.' || v_ext;
  return new;
end;
$$;

create trigger posture_photos_b1_init
  before insert on public.posture_photos
  for each row execute function app.posture_photo_init();

-- nao existe policy de update pra fotos; o freeze e defesa em profundidade
create trigger posture_photos_freeze
  before update on public.posture_photos
  for each row execute function app.freeze_columns('org_id', 'session_id', 'storage_path', 'thumb_path', 'format');

-- v1.1: anotacoes (pontos/linhas/angulos) ficam em payload jsonb.
-- tabela ja criada pra nao precisar de migration depois; sem UI na V1.
create table public.posture_annotations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  photo_id    uuid not null references public.posture_photos(id) on delete cascade,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);

create trigger posture_annotations_b1_org
  before insert on public.posture_annotations
  for each row execute function app.org_from_photo();

create trigger posture_annotations_freeze
  before update on public.posture_annotations
  for each row execute function app.freeze_columns('org_id', 'photo_id');

-- =====================================================================
-- CONSENTIMENTO (LGPD art. 8 e 11)
-- aceite eletronico: titular ou responsavel le o texto versionado no
-- dispositivo, digita o nome completo e confirma. guarda-se versao,
-- hash do texto exibido, quem assinou e quando. revogacao = revoked_at.
-- a exigencia de consentimento ativo pra criar dado sensivel e imposta
-- nas policies de insert (0002) via app.has_active_consent*.
-- =====================================================================

create table public.consent_records (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  subject_id           uuid not null references public.subjects(id) on delete cascade,
  consent_version      text not null,
  consent_text_sha256  text not null,
  signer_kind          text not null check (signer_kind in ('titular','responsavel')),
  signer_name          text not null check (char_length(signer_name) between 3 and 160),
  collected_by         uuid not null references public.profiles(id),
  user_agent           text,
  granted_at           timestamptz not null default now(),
  revoked_at           timestamptz
);

create index consent_subject_idx on public.consent_records (subject_id, granted_at desc);
-- consulta de consentimento vigente (usada pelas policies de insert)
create index consent_active_idx on public.consent_records (subject_id) where revoked_at is null;

create trigger consent_b1_org
  before insert on public.consent_records
  for each row execute function app.org_from_subject();

-- imutavel depois de criado: so revoked_at pode mudar
create or replace function app.consent_update_guard()
returns trigger
language plpgsql
as $$
begin
  if new.org_id                 is distinct from old.org_id
     or new.subject_id          is distinct from old.subject_id
     or new.consent_version     is distinct from old.consent_version
     or new.consent_text_sha256 is distinct from old.consent_text_sha256
     or new.signer_kind         is distinct from old.signer_kind
     or new.signer_name         is distinct from old.signer_name
     or new.collected_by        is distinct from old.collected_by
     or new.user_agent          is distinct from old.user_agent
     or new.granted_at          is distinct from old.granted_at
  then
    raise exception 'registro de consentimento e imutavel; apenas revoked_at pode ser alterado';
  end if;
  return new;
end;
$$;

create trigger consent_guard
  before update on public.consent_records
  for each row execute function app.consent_update_guard();

-- =====================================================================
-- AUDITORIA MINIMA
-- quem/o que/quando, sem payload (payload estouraria os 500 MB do free tier).
-- exports/PDF/resumo IA sao logados pelo app como acao avulsa.
-- =====================================================================

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  org_id      uuid,
  user_id     uuid,
  action      text not null,
  table_name  text not null,
  row_id      uuid,
  at          timestamptz not null default now()
);

create index audit_org_at_idx on public.audit_logs (org_id, at desc);

create or replace function app.audit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_logs (org_id, user_id, action, table_name, row_id)
    values (old.org_id, (select auth.uid()), tg_op, tg_table_name, old.id);
    return old;
  end if;
  insert into public.audit_logs (org_id, user_id, action, table_name, row_id)
  values (new.org_id, (select auth.uid()), tg_op, tg_table_name, new.id);
  return new;
end;
$$;

create trigger subjects_audit
  after insert or update or delete on public.subjects
  for each row execute function app.audit();

create trigger assessments_audit
  after insert or update or delete on public.assessments
  for each row execute function app.audit();

create trigger posture_sessions_audit
  after insert or update or delete on public.posture_sessions
  for each row execute function app.audit();

create trigger posture_photos_audit
  after insert or delete on public.posture_photos
  for each row execute function app.audit();

create trigger consent_audit
  after insert or update on public.consent_records
  for each row execute function app.audit();

-- =====================================================================
-- PLANOS (estrutura futura, sem cobranca na V1)
-- =====================================================================

create table public.plans (
  id                 text primary key,
  name               text not null,
  monthly_price_brl  numeric(8,2),
  max_subjects       int
);

create table public.org_subscriptions (
  org_id              uuid primary key references public.organizations(id) on delete cascade,
  plan_id             text not null references public.plans(id),
  status              text not null default 'trial'
                      check (status in ('trial','active','past_due','canceled')),
  current_period_end  timestamptz
);
