-- Avalix - migration 0031: publicacao atomica do plano e gate de 2FA no catalogo
-- Depende de 0001-0030. Nao altera dado existente: cria uma funcao nova e
-- reemite tres policies de escrita. Reversivel na pratica (as policies antigas
-- estao na 0007 e a funcao pode ser dropada).
--
-- =====================================================================
-- #1 CRIAR UM PLANO ATIVO ERA DUAS GRAVACOES INDEPENDENTES
-- =====================================================================
-- createWorkoutPlan fazia INSERT em workout_plans e SO DEPOIS chamava
-- replace_workout_plan_children. Duas requisicoes, dois commits.
--
-- O insert do cabecalho ja e o ato que troca o treino vigente: o trigger
-- workout_plans_single_active (0027) arquiva o plano ativo anterior no mesmo
-- comando. Entao, se a segunda chamada falhasse (rede caindo entre as duas,
-- agrupamento invalido barrado pela propria RPC, sessao expirada), o estado
-- resultante era: plano anterior ARQUIVADO e plano novo VAZIO. A limpeza do
-- cliente apagava o plano novo, mas nao desarquivava o anterior - e se ela
-- tambem falhasse, sobrava um plano ativo sem nenhuma divisao. Nos dois casos o
-- aluno abre o link e nao encontra treino nenhum.
--
-- A 0023 ja tinha corrigido isto na EDICAO (save_workout_plan). A criacao ficou
-- de fora, e e o caminho mais usado: publicar mesociclo novo.
--
-- create_workout_plan abaixo fecha cabecalho, estrutura filha e troca do plano
-- vigente na MESMA transacao. security invoker de proposito: a RLS de
-- workout_plans (can_view_subject_id) e o trigger check_evaluator continuam
-- valendo exatamente como no insert direto, e evaluator_id continua saindo do
-- default auth.uid() em vez de vir do cliente.
--
-- =====================================================================
-- #2 A ESCRITA NO CATALOGO PERSONALIZADO NAO EXIGIA O SEGUNDO FATOR
-- =====================================================================
-- As policies de INSERT/UPDATE/DELETE de public.exercises (0007) conferem
-- organizacao e papel por is_member/role_in, que NAO checam AAL - e nao checam
-- por decisao explicita da 0003, para o shell conseguir rotear ate /mfa.
--
-- A 0022 fechou esse mesmo contorno em org_members e organizations, mas o
-- catalogo ficou de fora. Consequencia: uma sessao aal1, obtida so com a senha
-- de uma conta que usa 2FA, nao ve dado clinico nenhum (can_view_subject barra),
-- mas consegue alterar por REST os exercicios personalizados da organizacao. O
-- nome do exercicio e lido pelos planos publicados, entao a alteracao chega a
-- ficha impressa e ao app do aluno. A UI para no desafio de MFA; o endpoint do
-- PostgREST nao parava.
--
-- Correcao: mesmo tratamento da 0022 - app.mfa_satisfied() nas TRES policies de
-- escrita, e SELECT intocado. Quem nao tem fator verificado continua passando
-- (mfa_satisfied devolve true), entao nada muda para contas sem 2FA.

begin;

-- ---------------------------------------------------------------------
-- #1 - criacao do plano numa transacao so
-- ---------------------------------------------------------------------
create or replace function public.create_workout_plan(
  p_org             uuid,
  p_subject         uuid,
  p_name            text,
  p_weeks           int,
  p_status          text,
  p_weekly_schedule jsonb,
  p_volume          jsonb,
  p_volume_engine_version text,
  p_days            jsonb,
  p_overrides       jsonb,
  p_weeks_meta      jsonb,
  p_goal            text default null,
  p_starts_on       date default null,
  p_notes           text default null,
  p_source_assessment_id      uuid default null,
  p_source_posture_session_id uuid default null
)
returns public.workout_plans
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_row public.workout_plans;
begin
  insert into public.workout_plans
    (org_id, subject_id, name, goal, weeks, starts_on, notes, status,
     source_assessment_id, source_posture_session_id, weekly_schedule,
     volume, volume_engine_version)
  values
    (p_org, p_subject, p_name, p_goal, p_weeks, p_starts_on, p_notes, p_status,
     p_source_assessment_id, p_source_posture_session_id,
     -- weekly_schedule e text[] NOT NULL; array(select ...) devolve array vazio
     -- (nunca null) quando a lista vem vazia. Mesma conversao da 0023.
     array(select jsonb_array_elements_text(coalesce(p_weekly_schedule, '[]'::jsonb))),
     p_volume, p_volume_engine_version)
  returning * into v_row;

  -- Mesma transacao: se a estrutura filha for recusada (agrupamento invalido,
  -- exercicio fora do catalogo da org), o cabecalho nao existe e o plano
  -- anterior NAO chega a ser arquivado pelo trigger da 0027.
  perform public.replace_workout_plan_children(v_row.id, p_days, p_overrides, p_weeks_meta);
  return v_row;
end;
$$;

revoke execute on function public.create_workout_plan(
  uuid, uuid, text, int, text, jsonb, jsonb, text, jsonb, jsonb, jsonb, text, date, text, uuid, uuid
) from anon, public;
grant execute on function public.create_workout_plan(
  uuid, uuid, text, int, text, jsonb, jsonb, text, jsonb, jsonb, jsonb, text, date, text, uuid, uuid
) to authenticated;

-- ---------------------------------------------------------------------
-- #2 - escrita no catalogo personalizado exige 2FA satisfeito
-- (SELECT continua sem gate: o builder precisa listar o catalogo, e a leitura
-- de exercicio nao e dado de saude de ninguem)
-- ---------------------------------------------------------------------
drop policy if exists exercises_insert on public.exercises;
create policy exercises_insert on public.exercises
  for insert to authenticated
  with check (org_id is not null and app.is_member(org_id) and app.mfa_satisfied());

drop policy if exists exercises_update on public.exercises;
create policy exercises_update on public.exercises
  for update to authenticated
  using (org_id is not null and app.is_member(org_id) and app.mfa_satisfied())
  with check (org_id is not null and app.is_member(org_id) and app.mfa_satisfied());

drop policy if exists exercises_delete on public.exercises;
create policy exercises_delete on public.exercises
  for delete to authenticated
  using (
    org_id is not null
    and app.role_in(org_id, array['owner','admin'])
    and app.mfa_satisfied()
  );

-- ---------------------------------------------------------------------
-- Marcador de schema conferido pelo deploy (scripts/check-schema-version.mjs).
-- ---------------------------------------------------------------------
create or replace function public.app_schema_version()
returns text
language sql immutable set search_path = ''
as $$ select '0031'::text $$;

commit;
