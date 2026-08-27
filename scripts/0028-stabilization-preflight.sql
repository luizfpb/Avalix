-- Avalix 0028 - preflight SOMENTE LEITURA.
-- Execute no SQL Editor do Supabase antes de aplicar a migration 0028.
-- Nenhuma instrução deste arquivo altera schema, dados ou histórico.

-- 1) BLOQUEADOR: um exercício não pode aparecer duas vezes na mesma divisão.
-- Corrija cada grupo no editor do plano e rode novamente até retornar zero.
select
  p.id as plan_id,
  p.name as plan_name,
  s.id as subject_id,
  s.full_name as subject_name,
  d.id as day_id,
  d.label as day_label,
  x.id as exercise_id,
  x.name as exercise_name,
  count(*)::int as occurrences,
  array_agg(we.id order by we.position, we.created_at, we.id) as workout_exercise_ids
from public.workout_exercises we
join public.workout_days d on d.id = we.day_id
join public.workout_plans p on p.id = d.plan_id
join public.subjects s on s.id = p.subject_id
join public.exercises x on x.id = we.exercise_id
group by p.id, p.name, s.id, s.full_name, d.id, d.label, x.id, x.name
having count(*) > 1
order by s.full_name, p.name, d.position, x.name;

-- 2) AVISO DE ROLLOUT: links pendentes de uma spec anterior precisam ser
-- cancelados e reemitidos após o deploy; respostas antigas não são promovidas
-- silenciosamente para a triagem 1.3.
select
  i.id,
  i.kind,
  i.status,
  i.spec_version,
  i.subject_id,
  i.created_at,
  i.expires_at
from public.anamnese_intakes i
where i.status in ('pending','submitted')
  and i.spec_version <> '1.3'
order by i.status desc, i.created_at;

-- 3) AVISO DE DADOS: submitted atuais que não possuem a confirmação completa
-- A1/A2 serão recusados no aceite. Rejeite e emita um link 1.3.
with candidates as (
  select
    i.*,
    case when jsonb_typeof(i.payload->'parq') = 'object'
         then i.payload->'parq' else '{}'::jsonb end as safe_parq,
    case when jsonb_typeof(i.payload->'doenca_cmr') = 'array'
         then i.payload->'doenca_cmr' else '[]'::jsonb end as safe_doencas,
    case when jsonb_typeof(i.payload->'sinais_sintomas') = 'array'
         then i.payload->'sinais_sintomas' else '[]'::jsonb end as safe_sintomas,
    case when jsonb_typeof(i.payload->'red_flags') = 'array'
         then i.payload->'red_flags' else '[]'::jsonb end as safe_red_flags
  from public.anamnese_intakes i
  where i.status = 'submitted' and i.spec_version = '1.3'
)
select c.id, c.kind, c.subject_id, c.spec_version, c.submitted_at
from candidates c
where
  jsonb_typeof(c.payload) is distinct from 'object'
  or jsonb_typeof(c.payload->'parq') is distinct from 'object'
  or (select count(*) from jsonb_object_keys(c.safe_parq)) <> 7
  or not (c.safe_parq ?& array[
    'cardio_dx','dor_toracica','tontura_sincope','condicao_cronica',
    'medicacao_cronica','lesao_atividade','supervisao_medica'
  ])
  or exists (
    select 1 from jsonb_each(c.safe_parq) answer
    where jsonb_typeof(answer.value) is distinct from 'boolean'
  )
  or jsonb_typeof(c.payload->'ativo_regular') is distinct from 'boolean'
  or c.payload->'doenca_cmr_confirmada' is distinct from 'true'::jsonb
  or c.payload->'sinais_sintomas_confirmados' is distinct from 'true'::jsonb
  or jsonb_typeof(c.payload->'doenca_cmr') is distinct from 'array'
  or exists (
    select 1 from jsonb_array_elements(c.safe_doencas) item
    where jsonb_typeof(item) is distinct from 'string'
       or item #>> '{}' not in ('cardiovascular','metabolica','renal')
  )
  or jsonb_array_length(c.safe_doencas) <> (
    select count(distinct item #>> '{}') from jsonb_array_elements(c.safe_doencas) item
  )
  or jsonb_typeof(c.payload->'sinais_sintomas') is distinct from 'array'
  or exists (
    select 1 from jsonb_array_elements(c.safe_sintomas) item
    where jsonb_typeof(item) is distinct from 'string'
       or item #>> '{}' not in (
         'dor_toracica','dispneia','tontura_sincope','ortopneia','edema',
         'palpitacoes','claudicacao','sopro','fadiga'
       )
  )
  or jsonb_array_length(c.safe_sintomas) <> (
    select count(distinct item #>> '{}') from jsonb_array_elements(c.safe_sintomas) item
  )
  or jsonb_typeof(c.payload->'red_flags') is distinct from 'array'
  or exists (
    select 1 from jsonb_array_elements(c.safe_red_flags) item
    where jsonb_typeof(item) is distinct from 'string'
       or item #>> '{}' not in (
         'dor_noturna','perda_peso','deficit_neuro','febre','cancer','esfincter','trauma'
       )
  )
  or jsonb_array_length(c.safe_red_flags) <> (
    select count(distinct item #>> '{}') from jsonb_array_elements(c.safe_red_flags) item
  )
  or (
    c.payload ? 'gestante'
    and jsonb_typeof(c.payload->'gestante') not in ('null','boolean')
  )
  or c.payload->'declaracao_veracidade' is distinct from 'true'::jsonb
  or c.payload->'consentimento_lgpd' is distinct from 'true'::jsonb
order by c.submitted_at;

-- 4) AVISO DE STORAGE: objetos legados continuam legíveis/removíveis, mas novos
-- uploads só poderão usar as três chaves canônicas.
select o.id, o.bucket_id, o.name, o.created_at
from storage.objects o
where o.bucket_id = 'logos'
  and o.name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo\.(png|jpg|webp)$'
order by o.created_at, o.id;

-- 5) AVISO DE PROVENIÊNCIA: a RPC oficial do aluno sempre grava client_ref.
-- Linhas student sem esse identificador podem ter sido criadas por REST antes
-- da 0028 e merecem conferência do profissional; nada é apagado automaticamente.
select l.id, l.org_id, l.subject_id, l.plan_id, l.performed_at, l.created_at
from public.workout_logs l
where l.source = 'student' and l.client_ref is null
order by l.created_at;

-- 6) AVISO DE INTEGRIDADE: sessões student já ligadas a draft são preservadas
-- como histórico, mas a 0028 impede novas ocorrências.
select l.id, l.subject_id, l.plan_id, l.performed_at, l.created_at
from public.workout_logs l
join public.workout_plans p on p.id = l.plan_id
where l.source = 'student' and p.status = 'draft'
order by l.created_at;

-- 7) CAP DE ORGANIZAÇÕES: 25 é o teto da rota de autocadastro.
select m.user_id, count(*)::int as owned_organizations
from public.org_members m
where m.role = 'owner'
group by m.user_id
having count(*) >= 25
order by owned_organizations desc, m.user_id;
