-- Behavioral regression for migration 0027 (treino executado pelo aluno).
-- Run ONLY against a disposable local/CI Supabase stack after its local reset.
-- Never run db reset or this stateful suite with --linked or --db-url.
--   SUPABASE_TELEMETRY_DISABLED=1 npx supabase test db \
--     supabase/tests/0027_workout_link.test.sql --local
--
-- LIMITE DESTE HARNESS (o mesmo do 0020, 0022 e 0026): o pg_prove conecta como
-- postgres, sem auth.uid(). Nao da para exercitar RLS nem o caminho feliz das
-- RPCs do treinador sem forjar claims e montar organizacao, avaliado e plano.
--
-- O caminho do ALUNO, porem, e anonimo por natureza: as RPCs sao security
-- definer e nao dependem de auth.uid(), entao aqui elas SAO exercitadas de
-- verdade contra uma fixture montada na propria transacao. E o que importa,
-- porque e a unica porta de escrita anonima do sistema.
--
-- O que este arquivo prova:
--   1. estrutura: tabela, indices unicos parciais, colunas de origem e
--      idempotencia, e o trigger de plano vigente;
--   2. superficie exposta: quem tem grant pra anon e quem NAO tem - em especial
--      que create_workout_log continua fechado (regressao mais provavel);
--   3. comportamento das RPCs anonimas: token invalido, escopo por aluno,
--      idempotencia por client_ref e os tetos de abuso;
--   4. o carimbo de versao do schema, que o gate de deploy compara.

begin;

select plan(24);

-- =====================================================================
-- 1. ESTRUTURA
-- =====================================================================
select has_table('public', 'workout_links', 'workout_links existe');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.workout_links'::regclass),
  'workout_links tem RLS habilitada'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'workout_links'
      and 'anon' = any(roles)),
  0,
  'nenhuma policy de workout_links alcanca anon'
);

select has_index('public', 'workout_links', 'workout_links_one_active_idx',
  'indice de link ativo unico por avaliado');

select has_index('public', 'workout_plans', 'workout_plans_one_active_idx',
  'indice de plano vigente unico por avaliado');

select has_index('public', 'workout_logs', 'workout_logs_client_ref_idx',
  'indice de idempotencia por (plan_id, client_ref)');

select has_column('public', 'workout_logs', 'source', 'workout_logs.source existe');
select has_column('public', 'workout_logs', 'client_ref', 'workout_logs.client_ref existe');

select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'workout_logs' and column_name = 'source'),
  '''trainer''::text',
  'log existente e log do treinador continuam com source trainer'
);

select has_trigger('public', 'workout_plans', 'workout_plans_single_active',
  'trigger que arquiva o plano ativo anterior');

-- =====================================================================
-- 2. SUPERFICIE EXPOSTA AO ANONIMO
-- Esta e a regressao mais provavel numa migration futura: alguem reescreve
-- grants em bloco e abre uma porta que nao devia.
-- =====================================================================
select ok(
  has_function_privilege('anon', 'public.get_workout_for_link(text)', 'execute')
  and has_function_privilege('anon', 'public.get_workout_plan_for_link(text, uuid)', 'execute')
  and has_function_privilege('anon', 'public.get_workout_history_for_link(text, int, date)', 'execute')
  and has_function_privilege('anon', 'public.submit_workout_session(text, uuid, jsonb, text, int, date, text, uuid)', 'execute'),
  'as quatro RPCs do aluno tem grant para anon'
);

select ok(
  not has_function_privilege('anon', 'public.create_workout_log(uuid, jsonb, text, int, date, text)', 'execute'),
  'create_workout_log continua FECHADA para anon'
);

select ok(
  not has_function_privilege('anon', 'public.issue_workout_link(uuid, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.revoke_workout_link(uuid)', 'execute'),
  'emitir e revogar link sao exclusivas do treinador'
);

select ok(
  not has_function_privilege('anon', 'public.purge_expired_workout_links(int)', 'execute')
  and not has_function_privilege('authenticated', 'public.purge_expired_workout_links(int)', 'execute'),
  'purge e exclusiva do service_role'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('get_workout_for_link','get_workout_plan_for_link',
                        'get_workout_history_for_link','submit_workout_session')
      and p.prosecdef
      and p.proconfig @> array['search_path=""']),
  4,
  'RPCs do aluno sao security definer com search_path vazio'
);

-- =====================================================================
-- 3. COMPORTAMENTO (fixture propria, desfeita no rollback)
-- =====================================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000aa', 'pgtap-treinador@teste.local');

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Org pgTAP 0027');

insert into public.org_members (org_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000aa', 'owner');

insert into public.subjects (id, org_id, evaluator_id, full_name, birth_date, sex) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000aa', 'Aluna pgTAP', '1990-01-01', 'F'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000aa', 'Outro pgTAP', '1990-01-01', 'M');

insert into public.exercises (id, org_id, name, primary_muscle, equipment, movement_pattern) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1',
   'Supino pgTAP', 'chest', 'barbell', 'horizontal_push');

insert into public.workout_plans (id, org_id, subject_id, evaluator_id, name, weeks, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000aa',
   'Plano pgTAP', 4, 'active'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000aa',
   'Plano alheio pgTAP', 4, 'active');

insert into public.workout_days (id, org_id, plan_id, label, position) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000e1', 'A', 0);

insert into public.workout_exercises (org_id, day_id, exercise_id, position, sets, reps) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-0000000000d1', 0, 3, '8-12');

insert into public.workout_links (org_id, subject_id, created_by, token_hash, expires_at) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000aa',
   encode(sha256(convert_to('pgtap-token','UTF8')), 'hex'), now() + interval '30 days');

select is(
  public.get_workout_for_link('token-que-nao-existe'),
  null,
  'token invalido devolve null, sem distinguir de expirado'
);

select is(
  public.get_workout_for_link('pgtap-token') -> 'plan' ->> 'name',
  'Plano pgTAP',
  'token valido devolve o plano vigente do aluno'
);

select is(
  (select count(*)::int from jsonb_object_keys(public.get_workout_for_link('pgtap-token')) k
    where k in ('body_fat_pct','birth_date','full_name','email','phone','anamnese')),
  0,
  'o pacote do aluno nao carrega dado clinico nem identidade completa'
);

select is(
  public.get_workout_plan_for_link('pgtap-token', '00000000-0000-0000-0000-0000000000e2'),
  null,
  'plano de OUTRO avaliado responde igual a inexistente'
);

select lives_ok($$
  select public.submit_workout_session(
    'pgtap-token', '00000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_array(jsonb_build_object(
      'exercise_id', '00000000-0000-0000-0000-0000000000d1',
      'set_number', 1, 'weight_kg', 40, 'reps', 10, 'rir', 2)),
    'A', 1, current_date, null)
$$, 'o aluno grava a sessao pelo link');

-- mesmo client_ref: atualiza em vez de duplicar. E o que torna a fila offline
-- segura, entao vale um teste proprio.
select public.submit_workout_session(
  'pgtap-token', '00000000-0000-0000-0000-000000000001'::uuid,
  jsonb_build_array(
    jsonb_build_object('exercise_id', '00000000-0000-0000-0000-0000000000d1',
                       'set_number', 1, 'weight_kg', 40, 'reps', 10, 'rir', 2),
    jsonb_build_object('exercise_id', '00000000-0000-0000-0000-0000000000d1',
                       'set_number', 2, 'weight_kg', 45, 'reps', 8, 'rir', 1)),
  'A', 1, current_date, null);

select is(
  (select count(*)::int from public.workout_logs
    where plan_id = '00000000-0000-0000-0000-0000000000e1'),
  1,
  'reenvio com o mesmo client_ref nao duplica a sessao'
);

select throws_ok($$
  select public.submit_workout_session(
    'pgtap-token', gen_random_uuid(),
    jsonb_build_array(jsonb_build_object(
      'exercise_id', '00000000-0000-0000-0000-0000000000d1',
      'set_number', 1, 'weight_kg', 40, 'reps', 10, 'rir', 2)),
    'A', 1, current_date - 30, null)
$$, 'data de execucao fora da janela permitida',
   'data antiga demais e recusada (a janela de 7 dias e da fila offline)');

select throws_ok($$
  select public.submit_workout_session(
    'pgtap-token', gen_random_uuid(),
    jsonb_build_array(jsonb_build_object(
      'exercise_id', '00000000-0000-0000-0000-0000000000d1',
      'set_number', 1, 'weight_kg', 40, 'reps', 10, 'rir', 2)),
    'A', 1, current_date, null, '00000000-0000-0000-0000-0000000000e2')
$$, 'plano nao pertence a este aluno',
   'token de um aluno nao escreve no plano de outro');

-- =====================================================================
-- 4. CARIMBO DE VERSAO
-- =====================================================================
select is(public.app_schema_version(), '0027', 'carimbo de schema em 0027');

select * from finish();

rollback;
