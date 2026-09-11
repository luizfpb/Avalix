import { supabase } from '../../lib/supabase'
import type { WeekLogPoint } from './progress'

// Camada de acesso da página do aluno (/t). Tudo aqui passa pelas RPCs
// anônimas da 0027, que validam o token por dentro: o cliente do aluno nunca
// toca tabela direta, e não existe policy de `anon` em lugar nenhum.
//
// Os tipos abaixo descrevem o jsonb que as RPCs devolvem. Não vêm do
// database.types porque o Postgres só sabe dizer "Json" — o contrato de forma
// mora na migration e aqui, e é conferido pelo smoke da 0027.

export type StudentPlan = {
  id: string
  name: string
  goal: string | null
  weeks: number
  starts_on: string | null
  notes: string | null
  status: string
  weekly_schedule: string[]
}

export type StudentDay = {
  id: string
  label: string
  name: string | null
  position: number
}

export type StudentExercise = {
  id: string
  day_id: string
  exercise_id: string
  name: string
  position: number
  sets: number
  reps: string | null
  rir: number | null
  rest_seconds: number | null
  tempo: string | null
  notes: string | null
  // Agrupamento e técnica (migration 0030). Opcionais no tipo porque um pacote
  // em cache no aparelho do aluno pode ter sido baixado antes da 0030 — a tela
  // trata ausente como exercício solto, nunca quebra.
  group_key?: string | null
  group_kind?: string | null
  technique?: string | null
}

export type StudentWeek = {
  week_number: number
  label: string | null
  is_deload: boolean
  notes: string | null
}

export type StudentOverride = {
  week_number: number
  workout_exercise_id: string
  sets: number | null
  reps: string | null
  rir: number | null
  rest_seconds: number | null
  is_skipped: boolean
  notes: string | null
}

export type StudentLastSet = {
  exercise_id: string
  performed_at: string
  weight_kg: number | null
  reps: number | null
  rir: number | null
  rest_seconds?: number | null
  reached_failure?: boolean | null
}

export type StudentHistoryPlan = {
  id: string
  name: string
  goal: string | null
  weeks: number
  starts_on: string | null
  status: string
  sessions: number
}

export type StudentWorkout = {
  org_name: string
  subject_first_name: string
  link_expires_at: string
  current_plan_sessions: number
  // Últimas sessões do plano ativo (data + semana), da mais recente para a
  // mais antiga, para a tela derivar em que semana do mesociclo o aluno está
  // — ver `suggestedPlanWeek`. Opcional: um pacote guardado no aparelho antes
  // da 0037 não tem o campo, e a tela precisa continuar abrindo com ele.
  plan_week_log?: WeekLogPoint[]
  plan: StudentPlan | null
  days: StudentDay[]
  exercises: StudentExercise[]
  weeks: StudentWeek[]
  overrides: StudentOverride[]
  last_sets: StudentLastSet[]
  history_plans: StudentHistoryPlan[]
}

// Um plano anterior aberto sob demanda: mesma forma, sem histórico agregado.
export type StudentPlanDetail = Pick<
  StudentWorkout,
  'plan' | 'days' | 'exercises' | 'weeks' | 'overrides'
>

export type StudentHistorySet = {
  exercise_id: string
  exercise_name: string
  set_number: number
  weight_kg: number | null
  reps: number | null
  rir: number | null
  // Ausente no histórico em cache anterior à migration 0032.
  rest_seconds?: number | null
  reached_failure?: boolean | null
}

export type StudentHistorySession = {
  id: string
  plan_id?: string
  // O cache legado não permite edição até receber a versão atual do servidor.
  updated_at?: string
  performed_at: string
  day_label: string | null
  week_number: number | null
  plan_name: string
  source: 'trainer' | 'student'
  notes: string | null
  sets: StudentHistorySet[]
}

export type StudentHistoryCursor = {
  performed_at: string
  created_at: string
  id: string
}

export type StudentHistoryPage = {
  items: StudentHistorySession[]
  next_cursor: StudentHistoryCursor | null
}

export async function getWorkoutForLink(token: string): Promise<StudentWorkout | null> {
  const { data, error } = await supabase.rpc('get_workout_for_link', { p_token: token })
  if (error) throw error
  return (data as unknown as StudentWorkout | null) ?? null
}

export async function getPlanForLink(
  token: string,
  planId: string
): Promise<StudentPlanDetail | null> {
  const { data, error } = await supabase.rpc('get_workout_plan_for_link', {
    p_token: token,
    p_plan: planId,
  })
  if (error) throw error
  return (data as unknown as StudentPlanDetail | null) ?? null
}

export async function getHistoryForLink(
  token: string,
  options: { limit?: number; before?: string | null } = {}
): Promise<StudentHistorySession[]> {
  const { data, error } = await supabase.rpc('get_workout_history_for_link', {
    p_token: token,
    p_limit: options.limit ?? 30,
    ...(options.before ? { p_before: options.before } : {}),
  })
  if (error) throw error
  return (data as unknown as StudentHistorySession[] | null) ?? []
}

export async function getHistoryPageForLink(
  token: string,
  options: { limit?: number; cursor?: StudentHistoryCursor | null } = {}
): Promise<StudentHistoryPage | null> {
  const cursor = options.cursor
  const { data, error } = await supabase.rpc('get_workout_history_page_for_link', {
    p_token: token,
    p_limit: options.limit ?? 30,
    ...(cursor
      ? {
          p_before_performed_at: cursor.performed_at,
          p_before_created_at: cursor.created_at,
          p_before_id: cursor.id,
        }
      : {}),
  })
  if (error) throw error
  const page = data as unknown as StudentHistoryPage | null
  // NULL e o sinal autoritativo de credencial revogada/expirada. Nao o
  // transforme em historico vazio: o chamador precisa purgar token e caches.
  if (!page) return null
  return {
    items: Array.isArray(page.items) ? page.items : [],
    next_cursor: page.next_cursor ?? null,
  }
}

export type SubmitSet = {
  exercise_id: string
  set_number: number
  weight_kg: number | null
  reps: number | null
  rir: number | null
  // A fila offline anterior à migration 0032 não tem este campo.
  rest_seconds?: number | null
  // RIR zero sozinho não prova falha; a fila legada mantém esse dado ausente.
  reached_failure?: boolean | null
}

export type SubmitSessionInput = {
  token: string
  clientRef: string
  sets: SubmitSet[]
  dayLabel: string | null
  weekNumber: number | null
  performedAt: string
  notes: string | null
  // plano em que o treino foi FEITO. Vai junto por causa da fila offline: se o
  // treinador publicou um plano novo enquanto a sessão esperava para subir, ela
  // tem de entrar no plano em que aconteceu. A RPC confere que o plano é do
  // mesmo aluno — quem delimita continua sendo o token.
  planId: string | null
  // Monotono por client_ref. Replays antigos da fila nao podem substituir um
  // payload mais novo que ja chegou ao servidor.
  revision: number
}

export async function submitSession(
  input: SubmitSessionInput
): Promise<{ logId: string; stale: boolean; corrected?: boolean }> {
  // Argumento com default na RPC é opcional no tipo gerado (string | undefined,
  // não null): valor ausente se OMITE, e o banco aplica o default. Mandar null
  // explícito não compila — e, se compilasse, sobrescreveria o default.
  const { data, error, status } = await supabase.rpc('submit_workout_session', {
    p_token: input.token,
    p_client_ref: input.clientRef,
    p_client_revision: input.revision,
    p_sets: input.sets,
    p_performed_at: input.performedAt,
    ...(input.dayLabel ? { p_day_label: input.dayLabel } : {}),
    ...(input.weekNumber != null ? { p_week_number: input.weekNumber } : {}),
    ...(input.notes ? { p_notes: input.notes } : {}),
    ...(input.planId ? { p_plan: input.planId } : {}),
  })
  if (error) throw Object.assign(error, { status })
  const row = data as unknown as { log_id?: string; stale?: boolean; corrected?: boolean } | null
  return {
    logId: row?.log_id ?? '',
    stale: row?.stale === true,
    ...(row?.corrected === true ? { corrected: true } : {}),
  }
}

export type UpdateSessionForLinkInput = {
  token: string
  logId: string
  expectedUpdatedAt: string
  performedAt: string
  notes: string | null
  sets: SubmitSet[]
}

export async function updateSessionForLink(
  input: UpdateSessionForLinkInput
): Promise<StudentHistorySession> {
  // Contrato provisório da RPC 0033, até o usuário aplicar a migration e
  // regenerar database.types. O cliente original conserva sua configuração.
  const client = supabase as unknown as {
    rpc(name: 'update_workout_session_for_link', args: {
      p_token: string
      p_log: string
      p_expected_updated_at: string
      p_sets: SubmitSet[]
      p_performed_at: string
      p_notes?: string
    }): PromiseLike<{ data: unknown; error: unknown }>
  }
  const { data, error } = await client.rpc('update_workout_session_for_link', {
    p_token: input.token,
    p_log: input.logId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_sets: input.sets,
    p_performed_at: input.performedAt,
    ...(input.notes != null ? { p_notes: input.notes } : {}),
  })
  if (error) throw error
  if (!data) throw new Error('Não foi possível confirmar a edição deste treino.')
  return data as StudentHistorySession
}
