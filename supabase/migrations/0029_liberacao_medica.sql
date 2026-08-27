-- Avalix - migration 0029: liberacao medica sobre a triagem da anamnese
-- Depende de 0001-0028. Aplicar ANTES de publicar o frontend correspondente
-- (o deploy roda check:remote-schema e falha de proposito na ordem errada).
--
-- POR QUE
-- Desde a 0028 o banco deriva `liberado`, `nivel_encaminhamento` e
-- `flag_encaminhamento` do payload da anamnese. Quando a triagem aponta
-- encaminhamento, o app avisa em toda superficie que toca aquele aluno - e
-- continuava avisando exatamente igual depois de o aluno voltar do medico com
-- parecer. Aviso que nao muda quando o problema e resolvido treina o
-- profissional a ignorar aviso, que e o pior desfecho possivel para um alerta
-- clinico. Faltava registrar o DESFECHO da triagem.
--
-- O QUE ENTRA
-- Um bloco de liberacao medica em `anamneses`. Ele NAO altera e nao pode
-- alterar a triagem: as tres colunas derivadas continuam saindo do payload
-- pelo `anamneses_b3_gate_guard`. Sao fatos de naturezas diferentes e ficam
-- separados de proposito - a triagem diz o que as RESPOSTAS indicam; a
-- liberacao diz o que o MEDICO decidiu depois. Sobrescrever a primeira com a
-- segunda apagaria a razao clinica do encaminhamento e falsificaria o
-- historico.
--
-- POR QUE NA PROPRIA ANAMNESE, E NAO NUMA TABELA NOVA
-- A anamnese ja e versionada por data: reavaliar cria outro registro. O parecer
-- responde a UMA triagem especifica, entao mora na linha que o gerou. Anamnese
-- nova nasce `pendente` de novo - e o comportamento correto, porque as
-- respostas mudaram e o parecer antigo pode nao cobrir o quadro novo. Uma
-- tabela a parte traria RLS, consentimento e auditoria proprios para guardar
-- um fato 1:1 com a linha que ja existe.
--
-- INTEGRIDADE (mesmo desenho do resto do projeto: cliente propoe, banco decide)
--   * autoria (`liberacao_medica_por`) e carimbo (`..._registrada_em`) sao
--     escritos pelo servidor, nunca pelo cliente;
--   * a anamnese sempre NASCE `pendente`, inclusive pelo aceite de intake -
--     registrar liberacao e ato posterior, explicito e auditado do profissional
--     (o aluno nunca se autolibera);
--   * parecer novo exige consentimento vigente, como toda coleta nova; retirar
--     o registro (voltar a `pendente`) continua permitido apos revogacao;
--   * a auditoria ja cobre: `anamneses_audit` registra o UPDATE, e
--     `app.audit()` grava so identificadores, nunca o texto clinico.

begin;

-- =====================================================================
-- 1. COLUNAS
-- =====================================================================
alter table public.anamneses
  add column liberacao_medica text not null default 'pendente'
    check (liberacao_medica in
      ('pendente','liberado','liberado_com_restricoes','nao_liberado')),
  add column liberacao_medica_em date,
  add column liberacao_medica_validade date,
  add column liberacao_medica_obs text,
  add column liberacao_medica_por uuid references public.profiles(id),
  add column liberacao_medica_registrada_em timestamptz;

comment on column public.anamneses.liberacao_medica is
  'Desfecho medico da triagem, registrado pelo profissional. Nao altera as colunas derivadas do payload.';
comment on column public.anamneses.liberacao_medica_em is
  'Data do parecer/atestado emitido pelo medico.';
comment on column public.anamneses.liberacao_medica_validade is
  'Validade do parecer, quando o documento traz uma. Vencida, a triagem volta a avisar.';
comment on column public.anamneses.liberacao_medica_obs is
  'Restricoes e observacoes do parecer. Obrigatorio quando ha restricoes.';

-- Forma do registro. O trigger abaixo da a mensagem em pt-BR e e quem o app
-- encosta; a constraint fecha a porta para qualquer caminho que passe por
-- fora dele (script administrativo, trigger desabilitado numa manutencao).
alter table public.anamneses
  add constraint anamneses_liberacao_medica_shape check (
    case
      when liberacao_medica = 'pendente' then
        liberacao_medica_em is null
        and liberacao_medica_validade is null
        and liberacao_medica_obs is null
        and liberacao_medica_por is null
        and liberacao_medica_registrada_em is null
      else
        liberacao_medica_em is not null
        and liberacao_medica_por is not null
        and liberacao_medica_registrada_em is not null
        and (liberacao_medica_validade is null
             or liberacao_medica_validade >= liberacao_medica_em)
        and (liberacao_medica <> 'liberado_com_restricoes'
             or length(btrim(coalesce(liberacao_medica_obs, ''))) >= 3)
        and length(coalesce(liberacao_medica_obs, '')) <= 2000
    end
  );

-- =====================================================================
-- 2. GUARDA DO REGISTRO
-- =====================================================================
create or replace function app.anamnese_liberacao_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor   uuid;
  v_alterou boolean;
begin
  new.liberacao_medica_obs :=
    nullif(btrim(coalesce(new.liberacao_medica_obs, '')), '');
  new.liberacao_medica :=
    coalesce(nullif(btrim(coalesce(new.liberacao_medica, '')), ''), 'pendente');

  -- Toda anamnese nasce pendente, venha do formulario do profissional ou do
  -- aceite de um intake respondido pelo aluno.
  if tg_op = 'INSERT' then
    new.liberacao_medica := 'pendente';
    new.liberacao_medica_em := null;
    new.liberacao_medica_validade := null;
    new.liberacao_medica_obs := null;
    new.liberacao_medica_por := null;
    new.liberacao_medica_registrada_em := null;
    return new;
  end if;

  v_alterou :=
    new.liberacao_medica is distinct from old.liberacao_medica
    or new.liberacao_medica_em is distinct from old.liberacao_medica_em
    or new.liberacao_medica_validade is distinct from old.liberacao_medica_validade
    or new.liberacao_medica_obs is distinct from old.liberacao_medica_obs;

  -- Corrigir as respostas nao reescreve autoria nem carimbo do parecer: o
  -- cliente manda a linha inteira e nao pode reassinar o registro de outra
  -- pessoa sem tocar no conteudo dele.
  if not v_alterou then
    new.liberacao_medica_por := old.liberacao_medica_por;
    new.liberacao_medica_registrada_em := old.liberacao_medica_registrada_em;
    return new;
  end if;

  -- Retirar o registro e sempre possivel: restaura o aviso original e nao
  -- coleta nada. Nao exige consentimento vigente de proposito.
  if new.liberacao_medica = 'pendente' then
    new.liberacao_medica_em := null;
    new.liberacao_medica_validade := null;
    new.liberacao_medica_obs := null;
    new.liberacao_medica_por := null;
    new.liberacao_medica_registrada_em := null;
    return new;
  end if;

  if not app.has_active_consent(new.subject_id) then
    raise exception 'consentimento revogado: nao e possivel registrar parecer medico novo';
  end if;

  if new.liberacao_medica_em is null then
    raise exception 'informe a data do parecer medico';
  end if;
  if new.liberacao_medica_em > current_date then
    raise exception 'a data do parecer medico nao pode estar no futuro';
  end if;
  if new.liberacao_medica_validade is not null
     and new.liberacao_medica_validade < new.liberacao_medica_em then
    raise exception 'a validade do parecer nao pode ser anterior a data dele';
  end if;
  if new.liberacao_medica = 'liberado_com_restricoes'
     and coalesce(length(new.liberacao_medica_obs), 0) < 3 then
    raise exception 'descreva as restricoes indicadas pelo medico';
  end if;
  if length(coalesce(new.liberacao_medica_obs, '')) > 2000 then
    raise exception 'observacoes do parecer excedem 2000 caracteres';
  end if;

  v_actor := (select auth.uid());
  if v_actor is null then
    raise exception 'sessao invalida para registrar parecer medico';
  end if;
  new.liberacao_medica_por := v_actor;
  new.liberacao_medica_registrada_em := now();
  return new;
end;
$$;

revoke execute on function app.anamnese_liberacao_guard() from public, anon, authenticated;

-- b4: depois do gate (b3), antes do freeze e do updated_at. Dispara em todo
-- update, e nao so nas colunas do bloco, porque precisa preservar autoria e
-- carimbo quando o cliente reenvia a linha inteira.
drop trigger if exists anamneses_b4_liberacao_guard on public.anamneses;
create trigger anamneses_b4_liberacao_guard
  before insert or update on public.anamneses
  for each row execute function app.anamnese_liberacao_guard();

-- =====================================================================
-- 3. CARIMBO DE SCHEMA
-- =====================================================================
create or replace function public.app_schema_version()
returns text
language sql immutable set search_path = ''
as $$ select '0029'::text $$;

revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;

commit;
