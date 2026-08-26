-- Behavioral regression for migration 0026.
-- Run ONLY against a disposable local/CI Supabase stack after its local reset.
-- Never run db reset or this stateful suite with --linked or --db-url.
--   SUPABASE_TELEMETRY_DISABLED=1 npx supabase test db \
--     supabase/tests/0026_ai_summary_anamneses.test.sql --local
--
-- LIMITE DESTE HARNESS (o mesmo do 0020 e do 0022): o pg_prove conecta como
-- postgres. Nao ha auth.uid(), entao log_data_action aborta logo na primeira
-- linha ("nao autenticado, MFA pendente...") e a matriz acao/alvo nunca chega a
-- ser avaliada. Exercitar o caminho feliz exigiria forjar claims JWT e montar
-- organizacao, membro, avaliado e anamnese - fixture cara para provar uma
-- clausula de OR.
--
-- O que da para provar aqui, e e o que importa na 0026:
--   1. ESTRUTURALMENTE, que a matriz aceita o par (AI_SUMMARY, anamneses) e
--      que existe um ramo resolvendo org/subject pela tabela anamneses. Ler o
--      corpo da funcao pega quem reescrever a log_data_action numa migration
--      futura partindo da versao da 0020 e derrubar o par sem perceber - que e
--      exatamente o risco de regressao aqui, porque a funcao ja foi reescrita
--      inteira duas vezes.
--   2. que os alvos anteriores continuam na matriz (a 0026 ACRESCENTA; se
--      alguem trocar em vez de somar, a auditoria de PDF e CSV cai junto).
--   3. que o gate de autenticacao e MFA continua sendo a primeira coisa que a
--      funcao faz, para o alvo novo nao ter virado uma porta sem tranca.
--   4. o carimbo de versao do schema, que o gate de deploy compara.

begin;

select plan(7);

select ok(
  position($$p_action = 'AI_SUMMARY' and p_table_name in ('assessments','anamneses')$$
    in pg_get_functiondef('public.log_data_action(uuid, text, text, uuid, uuid)'::regprocedure)) > 0,
  'a matriz acao/alvo aceita AI_SUMMARY sobre anamneses'
);

select ok(
  position('from public.anamneses an where an.id = p_row_id'
    in pg_get_functiondef('public.log_data_action(uuid, text, text, uuid, uuid)'::regprocedure)) > 0,
  'existe ramo resolvendo org_id/subject_id pela propria anamnese'
);

select ok(
  position($$when 'anamneses' then$$
    in pg_get_functiondef('public.log_data_action(uuid, text, text, uuid, uuid)'::regprocedure)) > 0,
  'anamneses entrou no case por tabela, e nao cai no raise de tabela invalida'
);

select ok(
  position($$p_action = 'PDF_REPORT' and p_table_name in ('assessments','workout_plans')$$
    in pg_get_functiondef('public.log_data_action(uuid, text, text, uuid, uuid)'::regprocedure)) > 0
  and position($$p_action = 'EXPORT_CSV' and p_table_name = 'assessments'$$
    in pg_get_functiondef('public.log_data_action(uuid, text, text, uuid, uuid)'::regprocedure)) > 0,
  'os alvos que ja existiam continuam na matriz'
);

select ok(
  position('not app.mfa_satisfied()'
    in pg_get_functiondef('public.log_data_action(uuid, text, text, uuid, uuid)'::regprocedure)) > 0,
  'o gate de MFA continua no corpo da funcao'
);

-- Sem auth.uid() o gate barra antes da matriz: prova que o alvo novo nao
-- criou caminho anonimo para escrever na trilha.
select throws_ok(
  $$select public.log_data_action(
      '00000000-0000-0000-0000-000000000001'::uuid,
      'AI_SUMMARY', 'anamneses',
      '00000000-0000-0000-0000-000000000002'::uuid
    )$$,
  'nao autenticado, MFA pendente ou organizacao sem acesso',
  'sem sessao autenticada a RPC recusa mesmo com acao e alvo validos'
);

select ok(
  public.app_schema_version() >= '0026',
  'o carimbo confirma a 0026 ou uma versao posterior'
);

select * from finish();
rollback;
