import { supabase } from '../../lib/supabase'
import { isPrimaryKeyConflict } from '../../lib/errors'
import type { FitnessMeasures } from './measures'

// Linha de fitness_tests (0059). Contrato provisório até regenerar o
// database.types depois de aplicar a 0059.
export type FitnessTestRow = {
  id: string
  org_id: string
  subject_id: string
  evaluator_id: string
  tested_at: string
  measures: unknown
  notes: string | null
  created_at: string
  updated_at: string
}

type Result<T> = PromiseLike<{ data: T; error: unknown }>
type Filter<T> = {
  eq(column: string, value: string): Filter<T>
  order(column: string, opts?: { ascending?: boolean }): Filter<T>
  range(from: number, to: number): Result<T[] | null>
  select(columns: string): Filter<T>
  maybeSingle(): Result<T | null>
  single(): Result<T>
}
type Table<T> = {
  select(columns: string): Filter<T>
  insert(row: Record<string, unknown>): { select(columns: string): { single(): Result<T> } }
  update(patch: Record<string, unknown>): Filter<T>
  delete(): { eq(column: string, value: string): Result<null> }
}

function table(): Table<FitnessTestRow> {
  return (supabase as unknown as { from(name: 'fitness_tests'): Table<FitnessTestRow> }).from('fitness_tests')
}

export type FitnessTestInput = {
  orgId: string
  subjectId: string
  testedAt: string
  measures: FitnessMeasures
  notes: string | null
  // identidade da ação de criar, gerada uma vez pela tela (0053): a nova
  // tentativa depois de uma resposta perdida devolve o mesmo registro
  id?: string
}

export async function getFitnessTest(id: string): Promise<FitnessTestRow | null> {
  const { data, error } = await table().select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function listFitnessTests(subjectId: string): Promise<FitnessTestRow[]> {
  const rows: FitnessTestRow[] = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await table()
      .select('*')
      .eq('subject_id', subjectId)
      .order('tested_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) return rows
  }
}

export async function createFitnessTest(input: FitnessTestInput): Promise<FitnessTestRow> {
  const { data, error } = await table()
    .insert({
      ...(input.id ? { id: input.id } : {}),
      org_id: input.orgId,
      subject_id: input.subjectId,
      tested_at: input.testedAt,
      measures: input.measures,
      notes: input.notes,
    })
    .select('*')
    .single()
  if (error) {
    if (input.id && isPrimaryKeyConflict(error, 'fitness_tests_pkey')) {
      const existing = await getFitnessTest(input.id)
      if (existing && existing.subject_id === input.subjectId) return existing
    }
    throw error
  }
  return data
}

// Concorrência otimista, como no cadastro do aluno: se a linha mudou em outro
// aparelho depois que a tela abriu, o update não casa e nada é sobrescrito.
export async function updateFitnessTest(
  id: string,
  input: Pick<FitnessTestInput, 'testedAt' | 'measures' | 'notes'>,
  expectedUpdatedAt: string
): Promise<FitnessTestRow> {
  const { data, error } = await table()
    .update({ tested_at: input.testedAt, measures: input.measures, notes: input.notes })
    .eq('id', id)
    .eq('updated_at', expectedUpdatedAt)
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) {
    const current = await getFitnessTest(id).catch(() => undefined)
    if (current === undefined) {
      throw new Error('Não foi possível confirmar se os testes mudaram. Seu preenchimento foi preservado; tente novamente.')
    }
    if (current && current.updated_at !== expectedUpdatedAt) {
      throw new Error('Estes testes foram alterados em outro dispositivo. Recarregue para ver a versão atual antes de salvar.')
    }
    throw new Error('Estes testes não estão mais disponíveis para edição. Recarregue a página.')
  }
  return data
}

export async function deleteFitnessTest(id: string): Promise<void> {
  const { error } = await table().delete().eq('id', id)
  if (error) throw error
}
