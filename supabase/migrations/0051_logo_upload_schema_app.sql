-- 0051 — envio da logo voltava "permission denied for schema app".
--
-- A 0028 criou app.canonical_logo_org_id() como função SQL comum (security
-- invoker) e a usou no INSERT e no UPDATE do bucket 'logos'. Função com
-- SET search_path não é inlinada: o corpo é analisado na hora, com o papel de
-- quem chama. O corpo cita app.uuid_or_null(), e `authenticated` não tem USAGE
-- no schema app (de propósito: o schema não é exposto). Resultado: todo upload
-- de logo falhava antes mesmo de checar o papel na organização.
--
-- As demais chamadas das policies não sofrem disso porque a policy guarda a
-- referência já resolvida; só o corpo de função invoker é resolvido de novo.
-- Correção: security definer, como os outros helpers de policy. A função é
-- pura (só olha o texto do path), então rodar como dono não abre nada.
begin;

create or replace function app.canonical_logo_org_id(p_name text)
returns uuid
language sql immutable security definer set search_path = ''
as $$
  select case
    when cardinality(string_to_array(p_name, '/')) = 2
     and split_part(p_name, '/', 1)
         = coalesce(app.uuid_or_null(split_part(p_name, '/', 1))::text, '')
     and split_part(p_name, '/', 2) in ('logo.png', 'logo.jpg', 'logo.webp')
    then app.uuid_or_null(split_part(p_name, '/', 1))
    else null
  end;
$$;

revoke execute on function app.canonical_logo_org_id(text) from public, anon;
grant execute on function app.canonical_logo_org_id(text) to authenticated;

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0051'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
