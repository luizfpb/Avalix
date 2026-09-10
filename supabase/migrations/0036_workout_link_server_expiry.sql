-- 0036 — validade do link de treino pelo relógio do servidor.
-- Aplicar depois da 0035. Compatível com o frontend anterior, que envia uma
-- data calculada no aparelho: um prazo acima do teto passa a usar o teto.
-- Não altera links existentes, RLS, grants nem o check de 180 dias.
begin;

create or replace function public.issue_workout_link(
  p_subject    uuid,
  p_token_hash text,
  p_expires_at timestamptz default null
)
returns public.workout_links
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_row public.workout_links;
  -- now() também é o default de created_at. Usar o mesmo instante evita
  -- ultrapassar o check por relógio adiantado, fuso ou duração da transação.
  v_now timestamptz := now();
  v_max_expires_at timestamptz := v_now + interval '180 days';
  v_expires_at timestamptz;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token_hash invalido';
  end if;

  -- SELECT sob RLS: aluno invisível = inexistente para o chamador.
  perform 1 from public.subjects where id = p_subject;
  if not found then
    raise exception 'avaliado inexistente ou sem acesso';
  end if;

  v_expires_at := least(coalesce(p_expires_at, v_max_expires_at), v_max_expires_at);
  if v_expires_at <= v_now then
    raise exception 'A validade do link de treino deve estar no futuro.';
  end if;

  update public.workout_links
     set status = 'revoked'
   where subject_id = p_subject and status = 'active';

  insert into public.workout_links (subject_id, token_hash, expires_at)
  values (p_subject, p_token_hash, v_expires_at)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.issue_workout_link(uuid, text, timestamptz) from anon, public;
grant execute on function public.issue_workout_link(uuid, text, timestamptz) to authenticated;

create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0036'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
