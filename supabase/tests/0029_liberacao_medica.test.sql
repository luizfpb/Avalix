-- Regression suite da migration 0029 (liberacao medica sobre a triagem).
-- Execute SOMENTE contra Supabase local/CI descartavel apos reset local:
--   SUPABASE_TELEMETRY_DISABLED=1 npx supabase test db \
--     supabase/tests/0029_liberacao_medica.test.sql --local
-- Nunca execute este arquivo stateful com --linked ou --db-url de producao.
--
-- O que precisa ficar provado aqui:
--   1. registrar parecer NAO mexe nas colunas derivadas do payload (a triagem
--      continua contando o que as respostas disseram);
--   2. autoria e carimbo saem do servidor, e o cliente nao os forja nem os
--      reassina corrigindo respostas;
--   3. a anamnese nasce pendente, inclusive quando o cliente pede o contrario;
--   4. datas incoerentes e restricao sem descricao falham fechado;
--   5. retirar o registro limpa o bloco inteiro e continua possivel depois de
--      revogado o consentimento, mas registrar parecer novo nao.

begin;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end;
$$;
set local search_path = public, extensions, pg_catalog;

select plan(17);

-- =====================================================================
-- Estrutura
-- =====================================================================
select has_column('public', 'anamneses', 'liberacao_medica', 'coluna de status do parecer existe');
select col_not_null('public', 'anamneses', 'liberacao_medica', 'status do parecer nunca e nulo');
select is(
  (select pg_get_expr(d.adbin, d.adrelid)
     from pg_attrdef d
     join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.anamneses'::regclass
      and a.attname = 'liberacao_medica'),
  '''pendente''::text',
  'toda anamnese existente passa a valer como pendente'
);

select ok(
  exists (
    select 1 from pg_constraint
     where conrelid = 'public.anamneses'::regclass
       and conname = 'anamneses_liberacao_medica_shape'
       and convalidated
  ),
  'a forma do registro e validada por constraint, e nao so pelo trigger'
);

select ok(
  not has_function_privilege('anon', 'app.anamnese_liberacao_guard()', 'execute')
  and not has_function_privilege('authenticated', 'app.anamnese_liberacao_guard()', 'execute'),
  'a guarda do parecer nao e chamavel direto por cliente'
);

-- =====================================================================
-- Fixture minima
-- =====================================================================
select set_config('request.jwt.claim.sub', '29000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"29000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',
  true
);

insert into auth.users (id, raw_user_meta_data) values
  ('29000000-0000-0000-0000-000000000001', '{"full_name":"Treinador pgTAP 0029"}'::jsonb);
insert into public.organizations (id, name) values
  ('29000000-0000-0000-0000-000000000002', 'Org pgTAP 0029');
insert into public.org_members (org_id, user_id, role) values
  ('29000000-0000-0000-0000-000000000002',
   '29000000-0000-0000-0000-000000000001', 'owner');
insert into public.subjects
  (id, org_id, evaluator_id, full_name, birth_date, sex)
values
  ('29000000-0000-0000-0000-000000000003',
   '29000000-0000-0000-0000-000000000002',
   '29000000-0000-0000-0000-000000000001',
   'Aluno pgTAP 0029', '1990-01-01', 'M');
insert into public.consent_records
  (org_id, subject_id, consent_version, consent_text_sha256,
   signer_kind, signer_name, collected_by)
values
  ('29000000-0000-0000-0000-000000000002',
   '29000000-0000-0000-0000-000000000003',
   app.canonical_consent_version(),
   encode(sha256(convert_to(app.canonical_consent_text('Org pgTAP 0029'), 'UTF8')), 'hex'),
   'titular', 'Aluno pgTAP 0029', '29000000-0000-0000-0000-000000000001');

-- Triagem que aponta encaminhamento: um "Sim" no PAR-Q e doenca cardiovascular
-- em quem nao e ativo. E o caso que hoje enche a tela de aviso.
insert into public.anamneses
  (id, org_id, subject_id, assessed_at, spec_version, payload,
   liberado, nivel_encaminhamento, flag_encaminhamento,
   liberacao_medica, liberacao_medica_em, liberacao_medica_obs)
values
  ('29000000-0000-0000-0000-000000000004',
   '29000000-0000-0000-0000-000000000002',
   '29000000-0000-0000-0000-000000000003',
   current_date, '1.3',
   '{
      "parq": {
        "cardio_dx": true,
        "dor_toracica": false,
        "tontura_sincope": false,
        "condicao_cronica": false,
        "medicacao_cronica": false,
        "lesao_atividade": false,
        "supervisao_medica": false
      },
      "ativo_regular": false,
      "doenca_cmr": ["cardiovascular"],
      "doenca_cmr_confirmada": true,
      "sinais_sintomas": [],
      "sinais_sintomas_confirmados": true,
      "red_flags": [],
      "gestante": null,
      "declaracao_veracidade": true,
      "consentimento_lgpd": true
    }'::jsonb,
   true, 'liberado', false,
   -- o cliente tenta nascer liberado; o guard tem de ignorar
   'liberado', current_date, 'atestado que nunca existiu');

select row_eq(
  $$ select liberacao_medica, liberacao_medica_em, liberacao_medica_obs,
            liberacao_medica_por, liberacao_medica_registrada_em
       from public.anamneses
      where id = '29000000-0000-0000-0000-000000000004' $$,
  row('pendente'::text, null::date, null::text, null::uuid, null::timestamptz),
  'anamnese nasce pendente mesmo quando o cliente manda parecer no insert'
);

select row_eq(
  $$ select liberado, nivel_encaminhamento, flag_encaminhamento
       from public.anamneses
      where id = '29000000-0000-0000-0000-000000000004' $$,
  row(false, 'antes_iniciar'::text, true),
  'a triagem continua derivada do payload, nao do que o cliente enviou'
);

-- =====================================================================
-- Registro do parecer
-- =====================================================================
select throws_ok(
  $$ update public.anamneses
        set liberacao_medica = 'liberado',
            liberacao_medica_em = current_date + 1
      where id = '29000000-0000-0000-0000-000000000004' $$,
  'P0001',
  'a data do parecer medico nao pode estar no futuro',
  'parecer datado no futuro falha fechado'
);

select throws_ok(
  $$ update public.anamneses
        set liberacao_medica = 'liberado',
            liberacao_medica_em = current_date,
            liberacao_medica_validade = current_date - 1
      where id = '29000000-0000-0000-0000-000000000004' $$,
  'P0001',
  'a validade do parecer nao pode ser anterior a data dele',
  'validade anterior a emissao falha fechado'
);

select throws_ok(
  $$ update public.anamneses
        set liberacao_medica = 'liberado_com_restricoes',
            liberacao_medica_em = current_date,
            liberacao_medica_obs = '  '
      where id = '29000000-0000-0000-0000-000000000004' $$,
  'P0001',
  'descreva as restricoes indicadas pelo medico',
  'restricao sem descricao falha fechado'
);

update public.anamneses
   set liberacao_medica = 'liberado',
       liberacao_medica_em = current_date - 10,
       liberacao_medica_validade = current_date + 180,
       liberacao_medica_obs = '  Apto sem restricoes  ',
       -- forja de autoria e carimbo: o servidor tem de sobrescrever
       liberacao_medica_por = '00000000-0000-0000-0000-000000000009',
       liberacao_medica_registrada_em = timestamptz '2000-01-01 00:00:00+00'
 where id = '29000000-0000-0000-0000-000000000004';

select row_eq(
  $$ select liberacao_medica, liberacao_medica_obs, liberacao_medica_por
       from public.anamneses
      where id = '29000000-0000-0000-0000-000000000004' $$,
  row('liberado'::text, 'Apto sem restricoes'::text,
      '29000000-0000-0000-0000-000000000001'::uuid),
  'o servidor normaliza o texto e assina o registro com o autor da sessao'
);

select ok(
  (select liberacao_medica_registrada_em > timestamptz '2020-01-01 00:00:00+00'
     from public.anamneses where id = '29000000-0000-0000-0000-000000000004'),
  'o carimbo do registro vem do servidor, nao do cliente'
);

select row_eq(
  $$ select liberado, nivel_encaminhamento, flag_encaminhamento
       from public.anamneses
      where id = '29000000-0000-0000-0000-000000000004' $$,
  row(false, 'antes_iniciar'::text, true),
  'registrar parecer nao reescreve a triagem que motivou o encaminhamento'
);

-- Corrigir a anamnese nao pode reassinar o parecer de outra pessoa.
update public.anamneses
   set assessed_at = current_date - 1,
       liberacao_medica_por = '00000000-0000-0000-0000-000000000009',
       liberacao_medica_registrada_em = timestamptz '2000-01-01 00:00:00+00'
 where id = '29000000-0000-0000-0000-000000000004';

select is(
  (select liberacao_medica_por from public.anamneses
    where id = '29000000-0000-0000-0000-000000000004'),
  '29000000-0000-0000-0000-000000000001'::uuid,
  'update que nao toca no conteudo do parecer preserva a autoria original'
);

-- =====================================================================
-- Consentimento revogado
-- =====================================================================
update public.consent_records
   set revoked_at = now()
 where subject_id = '29000000-0000-0000-0000-000000000003';

select throws_ok(
  $$ update public.anamneses
        set liberacao_medica = 'liberado_com_restricoes',
            liberacao_medica_em = current_date,
            liberacao_medica_obs = 'Somente carga leve'
      where id = '29000000-0000-0000-0000-000000000004' $$,
  'P0001',
  'consentimento revogado: nao e possivel registrar parecer medico novo',
  'parecer novo depois da revogacao falha fechado'
);

update public.anamneses
   set liberacao_medica = 'pendente'
 where id = '29000000-0000-0000-0000-000000000004';

select row_eq(
  $$ select liberacao_medica, liberacao_medica_em, liberacao_medica_validade,
            liberacao_medica_obs, liberacao_medica_por,
            liberacao_medica_registrada_em
       from public.anamneses
      where id = '29000000-0000-0000-0000-000000000004' $$,
  row('pendente'::text, null::date, null::date, null::text, null::uuid,
      null::timestamptz),
  'retirar o registro limpa o bloco inteiro mesmo com consentimento revogado'
);

select ok(
  public.app_schema_version() >= '0029',
  'o carimbo confirma a 0029 ou uma versao posterior'
);

select * from finish();
rollback;
