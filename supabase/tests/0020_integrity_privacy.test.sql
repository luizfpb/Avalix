-- Behavioral regression for migration 0020.
-- Run ONLY against a disposable local/CI Supabase stack after its local reset.
-- Never run db reset or this stateful suite with --linked or --db-url.
--   SUPABASE_TELEMETRY_DISABLED=1 npx supabase test db \
--     supabase/tests/0020_integrity_privacy.test.sql --local
-- The whole fixture is rolled back. It intentionally exercises trigger/RPC
-- behavior as postgres while auth.uid()/auth.jwt() emulate one AAL2 user;
-- grants and browser-facing integration remain separate E2E concerns.

begin;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end;
$$;
set local search_path = public, extensions, pg_catalog;

select plan(39);

select is(
  public.app_schema_version(),
  '0020',
  'marcador publico confirma que o schema 0020 esta aplicado'
);

-- Deterministic auth context for SQL-only tests. Supabase's built-in
-- auth.uid()/auth.jwt() read these request claims directly; do not replace
-- functions in the protected auth schema because pg_prove intentionally runs
-- without CREATE privileges there.
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',
  true
);

insert into auth.users (id, raw_user_meta_data)
values (
  '10000000-0000-0000-0000-000000000001',
  '{"full_name":"Owner Teste"}'::jsonb
);

create temporary table _privacy_state (
  key text primary key,
  value uuid not null
);
create temporary table _privacy_export (document jsonb not null);

select lives_ok(
  $$
    insert into pg_temp._privacy_state (key, value)
    select 'org', public.create_organization('Organizacao Teste 0020')
  $$,
  'create_organization consegue bootstrapar o primeiro owner'
);

select ok(
  exists (
    select 1 from public.org_members m
     where m.org_id = (select value from pg_temp._privacy_state where key = 'org')
       and m.user_id = auth.uid() and m.role = 'owner'
  ),
  'bootstrap cria membership owner para o proprio ator'
);

select throws_ok(
  $$
    update public.org_members set role = 'admin'
     where org_id = (select value from pg_temp._privacy_state where key = 'org')
       and user_id = auth.uid()
  $$,
  'P0001',
  'a organizacao deve manter ao menos um owner',
  'ultimo owner nao pode ser rebaixado'
);

select throws_ok(
  $$
    delete from public.org_members
     where org_id = (select value from pg_temp._privacy_state where key = 'org')
       and user_id = auth.uid()
  $$,
  'P0001',
  'nao e possivel remover o ultimo owner',
  'ultimo owner nao pode ser removido'
);

select throws_ok(
  $$
    update public.org_members
       set created_at = created_at - interval '1 day'
     where org_id = (select value from pg_temp._privacy_state where key = 'org')
       and user_id = auth.uid()
  $$,
  'P0001',
  'organizacao, usuario e criacao da membership sao imutaveis',
  'identidade da membership e imutavel'
);

select throws_ok(
  format(
    $sql$
      insert into public.subjects
        (id, org_id, evaluator_id, full_name, birth_date, sex)
      values
        ('20000000-0000-0000-0000-000000000099', %L, %L,
         'Menor Sem Responsavel', current_date - interval '10 years', 'F')
    $sql$,
    (select value from pg_temp._privacy_state where key = 'org'),
    auth.uid()
  ),
  'P0001',
  'menor de idade exige nome e vinculo do responsavel legal',
  'menor nao pode ser cadastrado sem responsavel'
);

insert into public.subjects
  (id, org_id, evaluator_id, full_name, birth_date, sex)
select
  '20000000-0000-0000-0000-000000000001', value, auth.uid(),
  'Titular Teste', date '1990-01-01', 'F'
from pg_temp._privacy_state where key = 'org';

select throws_ok(
  format(
    $sql$
      insert into public.consent_records
        (id, org_id, subject_id, consent_version, consent_text_sha256,
         signer_kind, signer_name, collected_by)
      values
        ('30000000-0000-0000-0000-000000000099', %L,
         '20000000-0000-0000-0000-000000000001',
         app.canonical_consent_version(),
         encode(sha256(convert_to(app.canonical_consent_text('Organizacao Teste 0020'), 'UTF8')), 'hex'),
         'titular', 'Outra Pessoa', %L)
    $sql$,
    (select value from pg_temp._privacy_state where key = 'org'),
    auth.uid()
  ),
  'P0001',
  'quem assina como titular deve ser o avaliado cadastrado',
  'signer titular deve coincidir com subjects.full_name'
);

select lives_ok(
  format(
    $sql$
      insert into public.consent_records
        (id, org_id, subject_id, consent_version, consent_text_sha256,
         signer_kind, signer_name, collected_by)
      values
        ('30000000-0000-0000-0000-000000000001', %L,
         '20000000-0000-0000-0000-000000000001',
         app.canonical_consent_version(),
         encode(sha256(convert_to(app.canonical_consent_text('Organizacao Teste 0020'), 'UTF8')), 'hex'),
         'titular', ' titular teste ', %L)
    $sql$,
    (select value from pg_temp._privacy_state where key = 'org'),
    auth.uid()
  ),
  'primeiro consentimento canonico e aceito'
);

select lives_ok(
  format(
    $sql$
      insert into public.consent_records
        (id, org_id, subject_id, consent_version, consent_text_sha256,
         signer_kind, signer_name, collected_by)
      values
        ('30000000-0000-0000-0000-000000000002', %L,
         '20000000-0000-0000-0000-000000000001',
         app.canonical_consent_version(),
         encode(sha256(convert_to(app.canonical_consent_text('Organizacao Teste 0020'), 'UTF8')), 'hex'),
         'titular', 'Titular Teste', %L)
    $sql$,
    (select value from pg_temp._privacy_state where key = 'org'),
    auth.uid()
  ),
  'novo consentimento supersede o anterior atomicamente'
);

select ok(
  (select count(*) = 1 from public.consent_records
    where subject_id = '20000000-0000-0000-0000-000000000001'
      and revoked_at is null),
  'existe exatamente um consentimento ativo'
);

select ok(
  (select revoked_at is not null from public.consent_records
    where id = '30000000-0000-0000-0000-000000000001'),
  'consentimento anterior guarda a supersessao'
);

select lives_ok(
  $$ select public.revoke_consent('30000000-0000-0000-0000-000000000002') $$,
  'revogacao server-side funciona'
);

select ok(
  not exists (
    select 1 from public.consent_records
     where subject_id = '20000000-0000-0000-0000-000000000001'
       and revoked_at is null
  ),
  'revogacao encerra todo consentimento ativo do titular'
);

select throws_ok(
  format(
    $sql$
      insert into public.consent_records
        (id, org_id, subject_id, consent_version, consent_text_sha256,
         signer_kind, signer_name, collected_by)
      values
        ('30000000-0000-0000-0000-000000000009', %L,
         '20000000-0000-0000-0000-000000000001',
         '1.0', repeat('9', 64), 'titular', 'Titular Teste', %L)
    $sql$,
    (select value from pg_temp._privacy_state where key = 'org'),
    auth.uid()
  ),
  'P0001',
  'versao ou hash do consentimento nao corresponde ao termo atual',
  'insert direto de consentimento legado continua proibido'
);

insert into public.anamnese_intakes
  (id, org_id, kind, token_hash, spec_version, expires_at)
select
  '40000000-0000-0000-0000-000000000099', value, 'cadastro_anamnese',
  encode(sha256(convert_to('registration-token-0000000000001', 'UTF8')), 'hex'),
  'test-spec', now() + interval '1 day'
from pg_temp._privacy_state where key = 'org';

select throws_ok(
  $$
    select public.submit_anamnese_intake(
      'registration-token-0000000000001', '{}'::jsonb,
      'titular', 'Outra Pessoa', app.canonical_consent_version(),
      encode(sha256(convert_to(app.canonical_consent_text('Organizacao Teste 0020'), 'UTF8')), 'hex'),
      'pgTAP',
      '{"full_name":"Titular Cadastro","birth_date":"1990-01-01","sex":"F"}'::jsonb
    )
  $$,
  'P0001',
  'quem assina como titular deve ser o avaliado cadastrado',
  'signer titular do cadastro deve coincidir com registration.full_name'
);

insert into public.anamnese_intakes
  (id, org_id, subject_id, token_hash, spec_version, expires_at)
select
  '40000000-0000-0000-0000-000000000001', value,
  '20000000-0000-0000-0000-000000000001',
  encode(sha256(convert_to('cancel-token-00000000000000000001', 'UTF8')), 'hex'),
  'test-spec', now() + interval '1 day'
from pg_temp._privacy_state where key = 'org';

select lives_ok(
  $$ select public.cancel_anamnese_intake('40000000-0000-0000-0000-000000000001') $$,
  'cancelamento usa RPC estreita'
);

select ok(
  exists (
    select 1 from public.anamnese_intakes
     where id = '40000000-0000-0000-0000-000000000001'
       and status = 'canceled' and purged_at is not null
       and payload is null and registration is null and signer_name is null
  ),
  'cancelamento anonimiza dados do intake'
);

insert into public.anamnese_intakes
  (id, org_id, subject_id, token_hash, spec_version, expires_at)
select
  '40000000-0000-0000-0000-000000000002', value,
  '20000000-0000-0000-0000-000000000001',
  encode(sha256(convert_to('reject-token-00000000000000000001', 'UTF8')), 'hex'),
  'test-spec', now() + interval '1 day'
from pg_temp._privacy_state where key = 'org';

select lives_ok(
  $$
    select public.submit_anamnese_intake(
      'reject-token-00000000000000000001', '{"answer":true}'::jsonb,
      'titular', 'Titular Teste', app.canonical_consent_version(),
      encode(sha256(convert_to(app.canonical_consent_text('Organizacao Teste 0020'), 'UTF8')), 'hex'),
      'pgTAP', null
    )
  $$,
  'envio valido produz intake submitted'
);

select throws_ok(
  $$
    update public.anamnese_intakes set payload = '{"tampered":true}'::jsonb
     where id = '40000000-0000-0000-0000-000000000002'
  $$,
  'P0001',
  'transicao de intake invalida ou estado terminal imutavel: submitted->submitted',
  'evidencia submitted nao pode ser alterada por update lateral'
);

select lives_ok(
  $$ select public.reject_anamnese_intake('40000000-0000-0000-0000-000000000002') $$,
  'rejeicao usa RPC estreita'
);

select ok(
  exists (
    select 1 from public.anamnese_intakes
     where id = '40000000-0000-0000-0000-000000000002'
       and status = 'rejected' and purged_at is not null
       and payload is null and consent_text_snapshot is null and signer_name is null
  ),
  'rejeicao anonimiza respostas e evidencia pessoal'
);

-- Simula a passagem do prazo do link sem depender do relogio da transacao
-- pgTAP. Desativa apenas o guard de update da propria tabela enquanto monta o
-- estado temporal; nao exige o session_replication_role de superusuario.
insert into public.anamnese_intakes
  (id, org_id, subject_id, token_hash, spec_version, expires_at)
select
  '40000000-0000-0000-0000-000000000010', value,
  '20000000-0000-0000-0000-000000000001',
  encode(sha256(convert_to('expired-pending-token-00000000001', 'UTF8')), 'hex'),
  'test-spec', now() + interval '1 day'
from pg_temp._privacy_state where key = 'org';

insert into public.anamnese_intakes
  (id, org_id, subject_id, token_hash, spec_version, expires_at)
select
  '40000000-0000-0000-0000-000000000011', value,
  '20000000-0000-0000-0000-000000000001',
  encode(sha256(convert_to('expired-submitted-token-0000000001', 'UTF8')), 'hex'),
  'test-spec', now() + interval '1 day'
from pg_temp._privacy_state where key = 'org';

select public.submit_anamnese_intake(
  'expired-submitted-token-0000000001', '{"answer":"preserve"}'::jsonb,
  'titular', 'Titular Teste', app.canonical_consent_version(),
  encode(sha256(convert_to(app.canonical_consent_text('Organizacao Teste 0020'), 'UTF8')), 'hex'),
  'pgTAP', null
);

alter table public.anamnese_intakes
  disable trigger anamnese_intakes_integrity_guard;
update public.anamnese_intakes
   set expires_at = now() - interval '1 day'
 where id in (
   '40000000-0000-0000-0000-000000000010',
   '40000000-0000-0000-0000-000000000011'
 );
alter table public.anamnese_intakes
  enable trigger anamnese_intakes_integrity_guard;

select is(
  public.purge_expired_anamnese_intakes(500),
  1,
  'purge de expirados processa somente link pending'
);

select ok(
  exists (
    select 1 from public.anamnese_intakes
     where id = '40000000-0000-0000-0000-000000000010'
       and status = 'expired' and purged_at is not null
       and payload is null and registration is null and signer_name is null
  ),
  'pending vencido e expirado e anonimizado'
);

select ok(
  exists (
    select 1 from public.anamnese_intakes
     where id = '40000000-0000-0000-0000-000000000011'
       and status = 'submitted' and purged_at is null
       and payload = '{"answer":"preserve"}'::jsonb
       and signer_name = 'Titular Teste'
       and consent_text_snapshot is not null
  ),
  'submitted vencido permanece aguardando revisao com evidencia intacta'
);

-- Reproduz um envio 1.0 que ja estava aguardando revisao quando a 0020 foi
-- aplicada. Desativa somente o guard de insert para montar essa fixture
-- pre-0020; os demais triggers continuam ativos. Somente a RPC de aceite pode
-- materializar o consentimento legado, sempre vinculado ao intake de origem e
-- sem inventar snapshot historico.
alter table public.anamnese_intakes
  disable trigger anamnese_intakes_b2_create_guard;
insert into public.anamnese_intakes
  (id, org_id, subject_id, token_hash, status, expires_at, spec_version,
   submitted_at, payload, consent_version, consent_text_sha256,
   signer_kind, signer_name, submit_user_agent)
select
  '40000000-0000-0000-0000-000000000012', value,
  '20000000-0000-0000-0000-000000000001', repeat('8', 64), 'submitted',
  now() - interval '1 day', 'legacy-spec', now() - interval '2 days',
  '{"legacy":"preserve"}'::jsonb, '1.0', repeat('7', 64),
  'titular', 'Titular Teste', 'legacy-agent'
from pg_temp._privacy_state where key = 'org';
alter table public.anamnese_intakes
  enable trigger anamnese_intakes_b2_create_guard;

select lives_ok(
  $$
    select * from public.accept_anamnese_intake(
      '40000000-0000-0000-0000-000000000012', true, 'liberado', false, null
    )
  $$,
  'RPC aceita submitted legado preservado durante o rollout'
);

select ok(
  exists (
    select 1
      from public.anamnese_intakes i
      join public.consent_records c on c.source_intake_id = i.id
     where i.id = '40000000-0000-0000-0000-000000000012'
       and i.status = 'accepted'
       and i.payload = '{"legacy":"preserve"}'::jsonb
       and i.consent_version = '1.0'
       and i.consent_text_sha256 = repeat('7', 64)
       and c.consent_version = '1.0'
       and c.consent_text_sha256 = repeat('7', 64)
       and c.controller_name_snapshot is null
       and c.consent_text_snapshot is null
  ),
  'aceite legado preserva versao/hash e registra provenance sem snapshot inventado'
);

insert into public.anamnese_intakes
  (id, org_id, subject_id, token_hash, spec_version, expires_at)
select
  '40000000-0000-0000-0000-000000000003', value,
  '20000000-0000-0000-0000-000000000001',
  encode(sha256(convert_to('accept-token-00000000000000000001', 'UTF8')), 'hex'),
  'test-spec', now() + interval '1 day'
from pg_temp._privacy_state where key = 'org';

select lives_ok(
  $$
    select public.submit_anamnese_intake(
      'accept-token-00000000000000000001', '{"answer":true}'::jsonb,
      'titular', 'Titular Teste', app.canonical_consent_version(),
      encode(sha256(convert_to(app.canonical_consent_text('Organizacao Teste 0020'), 'UTF8')), 'hex'),
      'pgTAP', null
    )
  $$,
  'segundo envio valido fica pronto para aceite'
);

select throws_ok(
  $$
    update public.anamnese_intakes
       set status = 'accepted',
           payload = '{"tampered":true}'::jsonb,
           reviewed_at = now(),
           reviewed_by = auth.uid(),
           resulting_anamnese_id = '70000000-0000-0000-0000-000000000099'
     where id = '40000000-0000-0000-0000-000000000003'
  $$,
  'P0001',
  'update de intake alterou colunas fora da allowlist de submitted->accepted',
  'submitted->accepted so permite metadados/resultados, nunca alterar evidencia'
);

select lives_ok(
  $$
    select * from public.accept_anamnese_intake(
      '40000000-0000-0000-0000-000000000003', true, 'liberado', false, null
    )
  $$,
  'aceite cria consentimento e anamnese atomicamente'
);

select throws_ok(
  $$
    update public.anamnese_intakes set payload = '{"tampered":true}'::jsonb
     where id = '40000000-0000-0000-0000-000000000003'
  $$,
  'P0001',
  'transicao de intake invalida ou estado terminal imutavel: accepted->accepted',
  'intake accepted e integralmente imutavel'
);

select lives_ok(
  $$
    insert into pg_temp._privacy_export (document)
    select public.export_subject_data('20000000-0000-0000-0000-000000000001')
  $$,
  'exportacao integral retorna snapshot'
);

select ok(
  exists (
    select 1 from pg_temp._privacy_export e
     where e.document->'subject'->>'id' = '20000000-0000-0000-0000-000000000001'
       and not exists (
         select 1 from jsonb_array_elements(e.document->'anamnese_intakes') i
          where i ? 'token_hash'
       )
  ),
  'snapshot pertence ao titular e nunca inclui token_hash'
);

select ok(
  (select count(*) = 1 from public.audit_logs
    where action = 'SUBJECT_EXPORT'
      and row_id = '20000000-0000-0000-0000-000000000001'
      and user_id = auth.uid()),
  'exportacao e auditoria nascem na mesma transacao'
);

insert into public.posture_sessions
  (id, org_id, subject_id, evaluator_id, taken_at)
select
  '50000000-0000-0000-0000-000000000001', value,
  '20000000-0000-0000-0000-000000000001', auth.uid(), current_date
from pg_temp._privacy_state where key = 'org';

insert into public.posture_photos
  (id, org_id, session_id, category, format, storage_path, thumb_path)
select
  '60000000-0000-0000-0000-000000000001', value,
  '50000000-0000-0000-0000-000000000001', 'frente', 'webp', '', ''
from pg_temp._privacy_state where key = 'org';

insert into storage.objects (bucket_id, name)
select 'photos', storage_path from public.posture_photos
 where id = '60000000-0000-0000-0000-000000000001'
union all
select 'photos', thumb_path from public.posture_photos
 where id = '60000000-0000-0000-0000-000000000001';

select ok(
  (select count(*) = 1
     from public.prepare_subject_deletion('20000000-0000-0000-0000-000000000001')),
  'preflight owner/admin devolve os paths da foto'
);

select throws_ok(
  $$ delete from public.posture_photos
      where id = '60000000-0000-0000-0000-000000000001' $$,
  'P0001',
  'remova os arquivos da foto no Storage antes de apagar o registro',
  'row de foto nao some enquanto houver objeto'
);

select throws_ok(
  $$ select public.finalize_subject_deletion('20000000-0000-0000-0000-000000000001') $$,
  'P0001',
  'remova todas as fotos do avaliado no Storage antes de exclui-lo',
  'finalizacao recusa exclusao enquanto houver objeto'
);

-- A Storage API apaga primeiro os bytes e marca a delecao SQL como autorizada.
-- Nesta fixture nao ha bytes reais; replica somente esse marcador transacional
-- exigido pelo trigger nativo storage.protect_delete().
set local storage.allow_delete_query = 'true';
delete from storage.objects
 where bucket_id = 'photos'
   and name in (
     select storage_path from public.posture_photos
      where id = '60000000-0000-0000-0000-000000000001'
     union all
      select thumb_path from public.posture_photos
       where id = '60000000-0000-0000-0000-000000000001'
   );
set local storage.allow_delete_query = 'false';

select lives_ok(
  $$ select public.finalize_subject_deletion('20000000-0000-0000-0000-000000000001') $$,
  'finalizacao apaga o titular depois de Storage vazio'
);

select ok(
  not exists (
    select 1 from public.subjects
     where id = '20000000-0000-0000-0000-000000000001'
  ),
  'exclusao definitiva remove a row e seus cascades'
);

select * from finish();
rollback;
