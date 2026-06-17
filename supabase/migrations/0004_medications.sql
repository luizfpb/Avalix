-- BodyTrack - migration 0004: medicamentos em uso na avaliacao
-- Depende de 0001-0003. Rodar no SQL Editor do Supabase (ou supabase db push).
--
-- Campo livre com os medicamentos que o avaliado usa no momento da avaliacao
-- (relevante pra interpretar composicao corporal). E dado de saude (sensivel),
-- mas ja fica coberto pela RLS e pelo consentimento de assessments: nenhuma
-- policy nova e necessaria. Nao destrutivo.
alter table public.assessments add column if not exists medications text;
