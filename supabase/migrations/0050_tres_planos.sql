-- 0050 — três planos e preço de lançamento.
-- Aplicar depois da 0049. Não altera tabela, função nem policy; só a tabela plans.
--
-- A 0049 semeou dois planos (Até 30 e Ilimitado) com preços de referência.
-- Preço de lançamento: anual = 8 mensalidades (4 meses grátis), arredondado
-- para baixo. Entra o plano do meio, Até 100.
--
--   Até 30     19,90 / mês   159,00 / ano
--   Até 100    39,90 / mês   319,00 / ano
--   Ilimitado 100,00 / mês   799,00 / ano
--
-- Assinatura já criada no Asaas mantém o valor da época; o preço novo vale
-- para quem assinar ou trocar de plano. O teste grátis e a cortesia continuam
-- no Ilimitado.
begin;

insert into public.plans (id, name, monthly_price_brl, yearly_price_brl, max_subjects, sort_order)
values
  ('ate30', 'Até 30', 19.90, 159.00, 30, 1),
  ('ate100', 'Até 100', 39.90, 319.00, 100, 2),
  ('ilimitado', 'Ilimitado', 100.00, 799.00, null, 3)
on conflict (id) do update
  set name = excluded.name,
      monthly_price_brl = excluded.monthly_price_brl,
      yearly_price_brl = excluded.yearly_price_brl,
      max_subjects = excluded.max_subjects,
      sort_order = excluded.sort_order;

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0050'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
