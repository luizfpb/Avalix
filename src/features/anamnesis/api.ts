import { supabase } from '../../lib/supabase'
import type { Database, Json } from '../../lib/database.types'
import type { AnamnesisAnswers } from './spec'
import { assertGateComplete } from './gate'
import { validarLiberacao, type LiberacaoInput } from './clearance'
import { SPEC_VERSION } from './spec'

export type AnamneseRow = Database['public']['Tables']['anamneses']['Row']

export type CreateAnamneseInput = {
  orgId: string
  subjectId: string
  assessedAt: string
  answers: AnamnesisAnswers
}

// O gate é recalculado aqui (fonte única) e gravado nas colunas; o payload
// guarda as respostas cruas. org_id é recopiado do subject pelo trigger.
export async function createAnamnese(input: CreateAnamneseInput): Promise<AnamneseRow> {
  const gate = assertGateComplete(input.answers)
  const { data, error } = await supabase
    .from('anamneses')
    .insert({
      org_id: input.orgId,
      subject_id: input.subjectId,
      assessed_at: input.assessedAt,
      spec_version: SPEC_VERSION,
      payload: input.answers as unknown as Json,
      liberado: gate.liberado,
      nivel_encaminhamento: gate.nivelEncaminhamento,
      flag_encaminhamento: gate.flagEncaminhamento,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export type UpdateAnamneseInput = {
  assessedAt: string
  answers: AnamnesisAnswers
}

// Correção de uma anamnese já registrada (mesmo registro, não versão nova: pra
// reavaliar existe "Nova anamnese", que versiona por data). org_id/subject_id
// nem entram no update — são congelados por trigger; updated_at e a trilha de
// auditoria saem dos triggers da 0005. O gate é recalculado das respostas
// novas pela MESMA função do create, senão as colunas liberado/nivel/flag
// ficariam descrevendo respostas antigas.
export async function updateAnamnese(
  id: string,
  input: UpdateAnamneseInput
): Promise<AnamneseRow> {
  const gate = assertGateComplete(input.answers)
  const { data, error } = await supabase
    .from('anamneses')
    .update({
      assessed_at: input.assessedAt,
      spec_version: SPEC_VERSION,
      payload: input.answers as unknown as Json,
      liberado: gate.liberado,
      nivel_encaminhamento: gate.nivelEncaminhamento,
      flag_encaminhamento: gate.flagEncaminhamento,
    })
    .eq('id', id)
    .select('*')
    .single()
  // update que não pega linha nenhuma (registro excluído noutra aba, acesso
  // perdido) volta como PGRST116 em inglês; normalizeDbError repassa a
  // mensagem, então a tradução tem que sair daqui
  if (error?.code === 'PGRST116') {
    throw new Error('Esta anamnese não está mais disponível para edição. Recarregue a página.')
  }
  if (error) throw error
  return data
}

// As mensagens dos triggers vêm em ASCII (convenção das migrations, para o
// SQL Editor não depender de codificação); a versão que o profissional lê sai
// daqui. A validação do cliente já barra quase tudo antes de sair — o que
// sobra é o que só o servidor sabe, como consentimento revogado.
const ERROS_LIBERACAO: Record<string, string> = {
  'consentimento revogado: nao e possivel registrar parecer medico novo':
    'O consentimento deste avaliado está revogado — não é possível registrar um parecer novo. Retirar o registro atual continua permitido.',
  'informe a data do parecer medico': 'Informe a data do parecer médico.',
  'a data do parecer medico nao pode estar no futuro':
    'A data do parecer não pode estar no futuro.',
  'a validade do parecer nao pode ser anterior a data dele':
    'A validade não pode ser anterior à data do parecer.',
  'descreva as restricoes indicadas pelo medico':
    'Descreva as restrições indicadas pelo médico.',
  'observacoes do parecer excedem 2000 caracteres':
    'As observações do parecer passam de 2000 caracteres.',
  'sessao invalida para registrar parecer medico':
    'Sessão expirada. Entre de novo para registrar o parecer.',
}

// Registra, corrige ou retira (status 'pendente') o parecer médico sobre uma
// anamnese. As colunas da triagem NÃO entram no update: elas descrevem as
// respostas e continuam derivadas do payload pelo banco. Autoria e carimbo são
// escritos pelo servidor (migration 0029) e por isso não são enviados daqui.
export async function setLiberacaoMedica(
  id: string,
  input: LiberacaoInput
): Promise<AnamneseRow> {
  const invalido = validarLiberacao(input)
  if (invalido) throw new Error(invalido)

  const registro =
    input.status === 'pendente'
      ? {
          liberacao_medica: 'pendente',
          liberacao_medica_em: null,
          liberacao_medica_validade: null,
          liberacao_medica_obs: null,
        }
      : {
          liberacao_medica: input.status,
          liberacao_medica_em: input.em,
          liberacao_medica_validade: input.validade || null,
          liberacao_medica_obs: (input.obs ?? '').trim() || null,
        }

  const { data, error } = await supabase
    .from('anamneses')
    .update(registro)
    .eq('id', id)
    .select('*')
    .single()
  if (error?.code === 'PGRST116') {
    throw new Error('Esta anamnese não está mais disponível para edição. Recarregue a página.')
  }
  if (error) {
    const traduzido = ERROS_LIBERACAO[(error.message ?? '').trim()]
    if (traduzido) throw new Error(traduzido)
    throw error
  }
  return data
}

export async function listAnamneses(subjectId: string): Promise<AnamneseRow[]> {
  const { data, error } = await supabase
    .from('anamneses')
    .select('*')
    .eq('subject_id', subjectId)
    // Desempate determinístico: duas anamneses na MESMA data deixavam a ordem
    // por conta do plano do Postgres, então "a mais recente" — que alimenta o
    // banner de contraindicações no builder de treino — podia alternar entre
    // recarregamentos. Com um aluno que respondeu duas vezes no mesmo dia, o
    // profissional podia ver a triagem errada.
    .order('assessed_at', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getAnamnese(id: string): Promise<AnamneseRow | null> {
  const { data, error } = await supabase
    .from('anamneses')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}
