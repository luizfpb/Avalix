-- 0040 — até três músculos principais por exercício.
-- Aplicar depois da 0039. Não altera RLS, policies nem dado existente.
--
-- O cadastro aceitava um único músculo principal, e exercício composto costuma
-- ter mais de um motor principal: agachamento (quadríceps e glúteos), supino
-- fechado (peitoral e tríceps). O segundo ia para "secundários" e entrava no
-- volume com metade do peso.
--
-- `primary_muscle` continua sendo o principal: é por ele que a biblioteca
-- ordena e agrupa, e nada que já o lê precisa mudar. A coluna nova guarda até
-- dois OUTROS principais, e o motor de volume conta cada um com peso cheio
-- (1,0), como o principal. Default vazio: todo exercício existente — o catálogo
-- global inclusive — continua exatamente como está, e os planos já salvos não
-- mudam de volume.
begin;

-- Sem repetição dentro do array. CHECK não aceita subconsulta; a função
-- imutável faz a conta.
create or replace function app.text_array_sem_repeticao(p text[])
returns boolean
language sql immutable set search_path = ''
as $$ select count(*) = count(distinct x) from unnest(p) as x $$;

alter table public.exercises
  add column if not exists additional_primary_muscles text[] not null default '{}';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'exercises_additional_primary_chk'
  ) then
    alter table public.exercises
      add constraint exercises_additional_primary_chk check (
        additional_primary_muscles <@ array[
          'chest','lats','upper_back','traps',
          'front_delts','side_delts','rear_delts',
          'biceps','triceps','forearms',
          'abs','obliques','lower_back',
          'quads','hamstrings','glutes','adductors','abductors',
          'calves','neck']::text[]
        and cardinality(additional_primary_muscles) <= 2
        and app.text_array_sem_repeticao(additional_primary_muscles)
        -- o mesmo músculo não conta duas vezes: nem repetindo o principal, nem
        -- aparecendo também entre os secundários
        and not (primary_muscle = any(additional_primary_muscles))
        and not (additional_primary_muscles && secondary_muscles)
      );
  end if;
end $$;

comment on column public.exercises.additional_primary_muscles is
  'Outros músculos principais (até 2), além de primary_muscle. Contam volume com peso 1,0.';

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0040'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
