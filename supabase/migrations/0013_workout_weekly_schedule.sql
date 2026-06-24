-- Avalix - migration 0013: sequencia semanal do plano de treino.
-- Permite repetir uma divisao na semana (ex.: ABA = A, B, A). Lista ordenada de
-- rotulos de divisao representando as sessoes de uma semana. Aditiva e
-- retrocompativel: vazio (default) = cada divisao uma vez, na ordem.
-- O volume passa a contar por SESSAO (uma divisao repetida conta o dobro);
-- a adesao usa o total de sessoes da semana.

alter table public.workout_plans
  add column weekly_schedule text[] not null default '{}';
