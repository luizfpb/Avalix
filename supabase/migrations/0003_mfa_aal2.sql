-- BodyTrack - migration 0003: exigir AAL2 (2FA) nas tabelas sensiveis
-- Depende de 0001/0002. Rodar no SQL Editor do Supabase (ou supabase db push).
--
-- AVISO: muda comportamento de seguranca (nao apaga dados). Antes de aplicar,
-- habilite TOTP em Authentication > MFA no painel. Consequencia desejada: uma
-- conta que ativou 2FA so enxerga/coleta dado sensivel DEPOIS de completar o
-- desafio (aal2). Recuperacao: se a pessoa perder o autenticador, remover o
-- fator MFA exige acesso administrativo (service role) — nao da pra "burlar"
-- pela aplicacao, que e justamente o ponto do 2FA.
--
-- Problema (V1.1, P0): a barreira de MFA era so no cliente (RouteGuard). Uma
-- sessao pos-senha sem o 2o fator ainda e 'authenticated' (aal1); quem chamasse
-- a API direto leria dados sensiveis sem passar pelo 2FA.
--
-- Correcao: exigir aal2 no JWT, MAS so quando o usuario tem um fator MFA
-- verificado. Sem essa ressalva, qualquer conta sem 2FA ficaria trancada (aal1
-- e o maximo que ela alcanca). Esse e o padrao recomendado pelo Supabase:
--   * conta sem 2FA  -> funciona como antes;
--   * conta com 2FA  -> precisa do desafio pra ver os dados.
--
-- Nao trava o shell: is_member/role_in continuam SEM checar aal, pra que
-- org/membros carreguem e o app consiga rotear ate a tela de desafio (/mfa).

create or replace function app.mfa_satisfied()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    (select auth.jwt() ->> 'aal') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = (select auth.uid())
        and f.status = 'verified'
    );
$$;

-- A visibilidade de TODO dado sensivel passa por can_view_subject: subjects,
-- assessments, leituras, sessoes, fotos, anotacoes, consentimento e ate os
-- objetos do Storage derivam dela (can_view_*_id -> can_view_subject ->
-- can_access_photo_object). Exigir mfa_satisfied aqui cobre leitura e as
-- clausulas USING de update/delete num unico ponto. (Corpo identico ao da 0002
-- com o "app.mfa_satisfied() and" na frente.)
create or replace function app.can_view_subject(p_org uuid, p_evaluator uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.mfa_satisfied() and (
    app.role_in(p_org, array['owner','admin'])
    or (
      app.is_member(p_org)
      and (
        p_evaluator = (select auth.uid())
        or coalesce((select o.evaluators_see_all
                     from public.organizations o
                     where o.id = p_org), false)
      )
    )
  );
$$;

-- Coleta nova de subject tambem exige 2FA. Os INSERT/UPDATE de subjects usam
-- is_member no with check (nao passam por can_view_subject), entao reforcamos
-- aqui. As demais tabelas sensiveis ja ficam cobertas porque seus with checks
-- usam can_view_*_id (que cai em can_view_subject).
drop policy subjects_insert on public.subjects;
create policy subjects_insert on public.subjects
  for insert to authenticated
  with check (app.is_member(org_id) and app.mfa_satisfied());

drop policy subjects_update on public.subjects;
create policy subjects_update on public.subjects
  for update to authenticated
  using (app.can_view_subject(org_id, evaluator_id))
  with check (app.is_member(org_id) and app.mfa_satisfied());
