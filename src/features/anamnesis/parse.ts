import { z } from 'zod'
import { emptyAnamnesis, type AnamnesisAnswers } from './spec'

// Validação do payload da anamnese (fronteira de confiança) — módulo separado
// de spec.ts DE PROPÓSITO: spec.ts entra no bundle inicial (AppShell → intake)
// e este schema traz o zod junto; aqui ele só carrega nos chunks que leem
// payload (revisão, detalhe, builder).
//
// O payload pode vir do envio ANÔNIMO do aluno (intake): quem tem o link
// controla o request, então cada campo é validado por tipo — valor com tipo
// errado cai no default vazio em vez de quebrar a tela de revisão ou confundir
// o gate (ex.: red_flags como string tem .length > 0). v2.0, achado #5.

const zs = z.string().catch('')
const zbn = z.boolean().nullable().catch(null)
const zarr = z.array(z.string()).catch([])

const cirurgiaSchema = z.object({ descricao: zs, ano: zs, regiao: zs })
const medicamentoSchema = z.object({ nome: zs, dose: zs })
const queixaDorSchema = z.object({
  regiao: zs,
  intensidade: z.number().catch(0),
  tempo_evolucao: zs,
  fatores_piora: zs,
  fatores_melhora: zs,
  lesao_previa_regiao: z.boolean().catch(false),
})

const answersSchema = z.object({
  parq: z.record(z.string(), z.boolean().nullable().catch(null)).catch({}),
  parq_condicao_cronica_qual: zs,
  parq_medicacao_cronica_qual: zs,
  ativo_regular: zbn,
  doenca_cmr: zarr,
  sinais_sintomas: zarr,
  objetivo_principal: zarr,
  objetivo_motivo: zs,
  objetivo_6meses: zs,
  esporte_modalidade: zs,
  experiencia_treino: zs,
  intensidade_desejada: zs,
  treino_freq_semana: zs,
  treino_tempo_sessao: zs,
  treino_local: zs,
  treino_equipamentos: zs,
  pref_gosta: zs,
  pref_nao_gosta: zs,
  pref_veto: zs,
  perfil_sessao: zs,
  doencas_cronicas: zarr,
  cirurgias: z.array(cirurgiaSchema).catch([]),
  medicamentos: z.array(medicamentoSchema).catch([]),
  historia_familiar_dcv: zs,
  tabagismo: zs,
  tabagismo_macos_ano: zs,
  alcool: zs,
  dor_queixas: z.array(queixaDorSchema).catch([]),
  lesoes_diagnosticadas: zarr,
  lesoes_estado_atual: zs,
  red_flags: zarr,
  atividade_tipo: zs,
  atividade_freq_semanal: zs,
  atividade_duracao_min: zs,
  atividade_intensidade: zs,
  ocupacao: zs,
  horas_sentado_dia: zs,
  esforco_repetitivo_carga: zbn,
  esforco_repetitivo_desc: zs,
  sono_horas: zs,
  sono_qualidade: zs,
  estresse_percebido: zs,
  acompanhamento_nutricional: zbn,
  lado_dominante: zs,
  atividade_assimetrica: zbn,
  atividade_assimetrica_desc: zs,
  uso_palmilha_ortese: zbn,
  uso_palmilha_desc: zs,
  alteracao_postural_diagnosticada: zarr,
  queixa_postural_principal: zs,
  gestante: zbn,
  gestante_semanas: zs,
  pos_parto_recente: zbn,
  pos_parto_meses: zs,
  declaracao_veracidade: z.boolean().catch(false),
  consentimento_lgpd: z.boolean().catch(false),
  observacoes: zs,
})

// Lê um payload persistido (qualquer spec_version): valida cada campo por tipo
// (com fallback pro vazio — nunca lança), completa campos que não existiam
// quando a resposta foi gravada e converte historia_familiar_dcv booleano
// (spec 1.0) pro enum atual. Toda leitura de payload do banco deve passar por
// aqui antes de chegar ao resumo, ao gate ou à prescrição.
export function parseAnswers(payload: unknown): AnamnesisAnswers {
  const raw = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  // legado spec 1.0: historia_familiar_dcv era boolean
  const hf = raw.historia_familiar_dcv
  const compat = {
    ...raw,
    historia_familiar_dcv: hf === true ? 'sim' : hf === false ? 'nao' : hf,
  }
  const parsed: AnamnesisAnswers = answersSchema.parse(compat)
  return { ...parsed, parq: { ...emptyAnamnesis().parq, ...parsed.parq } }
}
