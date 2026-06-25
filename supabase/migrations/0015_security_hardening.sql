-- Avalix - migration 0015: endurecimento de seguranca (achados da revisao pre-beta)
-- Depende de 0001-0014. Nao apaga dado; so troca funcoes e policies.
-- Aplicar no SQL Editor do Supabase. Roda em transacao: se algo falhar, reverte
-- inteiro (nada fica pela metade).
--
-- Cobre 3 achados:
--   #1 (governanca) consentimento podia ser DES-revogado por update (revoked_at
--      voltando a null), perdendo a trilha do periodo revogado. Reconsentir deve
--      criar um NOVO registro. Agora revoked_at e via unica: null -> timestamp.
--   #3 (abuso)      create_organization sem limite -> flood de orgs. Cap generoso
--      por usuario (improvavel no beta, barato de fechar).
--   #4 (robustez)   policies do bucket 'logos' casteavam ((foldername)[1])::uuid
--      direto; path com 1a pasta nao-uuid estourava erro. Agora casa o formato
--      antes de castear (uuid_or_null) -> negacao limpa, sem erro.
--
-- (Achado #2, lockout de 2FA, e operacional: testar enrollment + recuperacao;
--  nao da pra "corrigir" em codigo sem enfraquecer o 2FA. Achado #5 e informativo.)

begin;

-- =====================================================================
-- #1 - consentimento: revoked_at imutavel apos a revogacao
-- =====================================================================
create or replace function app.consent_update_guard()
returns trigger
language plpgsql
as $$
begin
  if new.org_id                 is distinct from old.org_id
     or new.subject_id          is distinct from old.subject_id
     or new.consent_version     is distinct from old.consent_version
     or new.consent_text_sha256 is distinct from old.consent_text_sha256
     or new.signer_kind         is distinct from old.signer_kind
     or new.signer_name         is distinct from old.signer_name
     or new.collected_by        is distinct from old.collected_by
     or new.user_agent          is distinct from old.user_agent
     or new.granted_at          is distinct from old.granted_at
  then
    raise exception 'registro de consentimento e imutavel; apenas revoked_at pode ser alterado';
  end if;
  -- revoked_at e via unica: so pode ir de null -> timestamp (revogar). Des-revogar
  -- (timestamp -> null) ou trocar a data fica bloqueado; reconsentir cria novo
  -- registro, preservando a trilha do periodo revogado.
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'revoked_at e imutavel apos a revogacao; reconsentir cria um novo registro';
  end if;
  return new;
end;
$$;

-- =====================================================================
-- #3 - create_organization: cap anti-flood por usuario
-- =====================================================================
create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_org   uuid;
  v_owned int;
begin
  if (select auth.uid()) is null then
    raise exception 'nao autenticado';
  end if;
  -- guarda anti-flood: limite generoso de orgs proprias por usuario. Um
  -- profissional solo precisa de 1; 25 cobre qualquer uso legitimo sem virar
  -- vetor de abuso. Ajustar se um dia houver multi-org de verdade acima disso.
  select count(*) into v_owned
    from public.org_members m
   where m.user_id = (select auth.uid()) and m.role = 'owner';
  if v_owned >= 25 then
    raise exception 'limite de organizacoes por usuario atingido';
  end if;
  insert into public.organizations (name) values (p_name) returning id into v_org;
  insert into public.org_members (org_id, user_id, role)
  values (v_org, (select auth.uid()), 'owner');
  return v_org;
end;
$$;

revoke execute on function public.create_organization(text) from anon, public;
grant execute on function public.create_organization(text) to authenticated;

-- =====================================================================
-- #4 - bucket 'logos': castear o org_id do path com seguranca
-- =====================================================================
-- devolve o uuid so se o texto tem o formato; senao null. is_member(null) e
-- role_in(null, ...) dao false -> path malformado e negado sem erro de cast.
create or replace function app.uuid_or_null(p text)
returns uuid
language sql immutable
as $$
  select case
    when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then p::uuid
    else null
  end;
$$;

drop policy storage_logos_select on storage.objects;
create policy storage_logos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'logos'
    and app.is_member(app.uuid_or_null((storage.foldername(name))[1]))
  );

drop policy storage_logos_insert on storage.objects;
create policy storage_logos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and app.role_in(app.uuid_or_null((storage.foldername(name))[1]), array['owner','admin'])
  );

drop policy storage_logos_update on storage.objects;
create policy storage_logos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos'
    and app.role_in(app.uuid_or_null((storage.foldername(name))[1]), array['owner','admin'])
  )
  with check (
    bucket_id = 'logos'
    and app.role_in(app.uuid_or_null((storage.foldername(name))[1]), array['owner','admin'])
  );

drop policy storage_logos_delete on storage.objects;
create policy storage_logos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos'
    and app.role_in(app.uuid_or_null((storage.foldername(name))[1]), array['owner','admin'])
  );

commit;
