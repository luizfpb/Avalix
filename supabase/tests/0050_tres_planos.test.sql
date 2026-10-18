-- Somente PostgreSQL/Supabase descartável, com migrations até a 0050.
begin;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pgtap') then
    execute 'create extension if not exists pgtap with schema extensions';
  end if;
end; $$;
set local search_path = public, extensions, pg_catalog;
select plan(4);

select ok(public.app_schema_version() >= '0050', 'schema inclui os três planos');
select is(
  (select string_agg(id || ':' || coalesce(max_subjects::text, '-') || ':' || monthly_price_brl || ':' || yearly_price_brl, ' ' order by sort_order)
     from public.plans),
  'ate30:30:19.90:159.00 ate100:100:39.90:319.00 ilimitado:-:100.00:799.00',
  'três planos em ordem, com limite e preço de lançamento');
select ok(
  (select bool_and(round(yearly_price_brl / monthly_price_brl) = 8) from public.plans),
  'anual vale 8 mensalidades (4 meses grátis)');

-- o limite do plano do meio vale pela mesma regra da 0049
insert into auth.users(id, raw_user_meta_data) values ('50000000-0000-0000-0000-000000000001', '{}');
insert into public.organizations(id, name) values ('50000000-0000-0000-0000-000000000002', 'Org 0050');
insert into public.org_members(org_id, user_id, role)
values ('50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'owner');
update public.org_subscriptions set status = 'active', plan_id = 'ate100',
       current_period_end = now() + interval '10 days', asaas_subscription_id = 'sub_0050'
 where org_id = '50000000-0000-0000-0000-000000000002';
insert into public.subjects(org_id, evaluator_id, full_name, birth_date, sex)
select '50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'A' || g, '1990-01-01', 'F'
  from generate_series(1, 31) g;
select throws_ok(
  $$select public.billing_change_plan('50000000-0000-0000-0000-000000000002', 'ate30', 'monthly')$$,
  'P0001', 'Você tem 31 avaliados ativos e o plano escolhido permite 30. Inative cadastros antes de trocar.',
  'com 31 ativos no Até 100 não desce para o Até 30');

select * from finish();
rollback;
