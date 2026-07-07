// Anamnese — tipos do payload, opções e rótulos. Baseado na spec
// docs/bodytrack_anamnese_spec.md: Camada A (triagem PAR-Q+/ACSM) é gate de
// segurança; Camada B é contexto de avaliação. Redação própria, inspirada em
// instrumentos validados (PAR-Q+ e diretrizes ACSM de pré-participação).

// 1.1: + motivação (B1), logística e preferências de treino (B1b), lesões
// diagnosticadas (B3); historia_familiar_dcv vira enum com "não sei" (era
// booleano na 1.0 — parseAnswers converte payloads antigos).
export const SPEC_VERSION = '1.1'

export type Option = { value: string; label: string }

// ---- Camada A ----------------------------------------------------------
export const PARQ_ITEMS: { key: string; label: string }[] = [
  { key: 'cardio_dx', label: 'Algum médico já disse que você tem condição cardíaca ou pressão alta?' },
  { key: 'dor_toracica', label: 'Sente dor no peito em repouso, no dia a dia ou durante esforço físico?' },
  { key: 'tontura_sincope', label: 'Perdeu o equilíbrio por tontura ou perdeu a consciência nos últimos 12 meses?' },
  { key: 'condicao_cronica', label: 'Tem outra condição crônica diagnosticada além de cardíaca/pressão?' },
  { key: 'medicacao_cronica', label: 'Toma medicação prescrita para condição crônica?' },
  { key: 'lesao_atividade', label: 'Tem problema ósseo, articular ou de tecido mole que piora com atividade física?' },
  { key: 'supervisao_medica', label: 'Algum médico já disse que você só deve fazer atividade física sob supervisão médica?' },
]

export const DOENCA_CMR: Option[] = [
  { value: 'cardiovascular', label: 'Cardiovascular' },
  { value: 'metabolica', label: 'Metabólica (DM1, DM2)' },
  { value: 'renal', label: 'Renal' },
]

export const SINAIS_SINTOMAS: Option[] = [
  { value: 'dor_toracica', label: 'Dor/desconforto torácico' },
  { value: 'dispneia', label: 'Falta de ar anormal ao esforço ou repouso' },
  { value: 'tontura_sincope', label: 'Tontura ou desmaio' },
  { value: 'ortopneia', label: 'Falta de ar deitado ou à noite' },
  { value: 'edema', label: 'Inchaço nos tornozelos' },
  { value: 'palpitacoes', label: 'Palpitações ou taquicardia' },
  { value: 'claudicacao', label: 'Dor nas pernas ao caminhar (claudicação)' },
  { value: 'sopro', label: 'Sopro cardíaco conhecido' },
  { value: 'fadiga', label: 'Fadiga desproporcional ao esforço' },
]

// ---- Camada B ----------------------------------------------------------
export const INTENSIDADE: Option[] = [
  { value: 'leve', label: 'Leve' },
  { value: 'moderada', label: 'Moderada' },
  { value: 'vigorosa', label: 'Vigorosa' },
]

export const OBJETIVOS: Option[] = [
  { value: 'hipertrofia', label: 'Hipertrofia' },
  { value: 'composicao', label: 'Composição corporal' },
  { value: 'performance', label: 'Performance esportiva' },
  { value: 'saude', label: 'Saúde geral' },
  { value: 'dor_reab', label: 'Dor e reabilitação' },
  { value: 'postural', label: 'Correção postural' },
  { value: 'cardio', label: 'Condicionamento cardiorrespiratório' },
  { value: 'mobilidade', label: 'Flexibilidade / mobilidade' },
  { value: 'energia', label: 'Disposição e energia no dia a dia' },
]

// ---- B1b. Logística e preferências de treino ---------------------------
export const TREINO_FREQ: Option[] = [
  { value: '1', label: '1x por semana' },
  { value: '2', label: '2x por semana' },
  { value: '3', label: '3x por semana' },
  { value: '4', label: '4x por semana' },
  { value: '5', label: '5x por semana' },
  { value: '6', label: '6x ou mais por semana' },
  { value: 'nao_sei', label: 'Ainda não sei' },
]

export const TEMPO_SESSAO: Option[] = [
  { value: 'ate_30', label: 'Até 30 min' },
  { value: '30_45', label: '30 a 45 min' },
  { value: '45_60', label: '45 min a 1h' },
  { value: '60_90', label: '1h a 1h30' },
  { value: 'mais_90', label: 'Mais de 1h30' },
]

export const LOCAL_TREINO: Option[] = [
  { value: 'academia', label: 'Academia' },
  { value: 'casa', label: 'Em casa / home gym' },
  { value: 'condominio', label: 'Academia do condomínio' },
  { value: 'ar_livre', label: 'Parque / ao ar livre' },
]

// locais onde os equipamentos disponíveis limitam a prescrição
export const LOCAL_SEM_ESTRUTURA = ['casa', 'condominio', 'ar_livre']

export const PERFIL_SESSAO: Option[] = [
  { value: 'curta_intensa', label: 'Curtas e intensas' },
  { value: 'volumosa_cadenciada', label: 'Mais longas, com mais descanso entre séries' },
]

export const EXPERIENCIA: Option[] = [
  { value: 'nunca', label: 'Nunca treinou' },
  { value: 'lt6m', label: 'Menos de 6 meses' },
  { value: '6a24m', label: '6 a 24 meses' },
  { value: 'gt2a', label: 'Mais de 2 anos' },
]

export const DOENCAS_CRONICAS: Option[] = [
  { value: 'has', label: 'Hipertensão (HAS)' },
  { value: 'dm1', label: 'Diabetes tipo 1' },
  { value: 'dm2', label: 'Diabetes tipo 2' },
  { value: 'dislipidemia', label: 'Dislipidemia' },
  { value: 'cardiopatia', label: 'Cardiopatia' },
  { value: 'renal', label: 'Doença renal' },
  { value: 'pulmonar', label: 'Pulmonar (asma, DPOC)' },
  { value: 'tireoide', label: 'Tireoidiana' },
  { value: 'cancer', label: 'Câncer (atual ou prévio)' },
  { value: 'reumatica', label: 'Reumática / artrite' },
  { value: 'osteo', label: 'Osteoporose / osteopenia' },
  { value: 'neuro', label: 'Neurológica' },
  { value: 'psiquiatrica', label: 'Psiquiátrica relevante' },
]

export const REGIAO_DOR: Option[] = [
  { value: 'cervical', label: 'Cervical' },
  { value: 'ombro_d', label: 'Ombro direito' },
  { value: 'ombro_e', label: 'Ombro esquerdo' },
  { value: 'dorsal', label: 'Dorsal' },
  { value: 'lombar', label: 'Lombar' },
  { value: 'quadril_d', label: 'Quadril direito' },
  { value: 'quadril_e', label: 'Quadril esquerdo' },
  { value: 'joelho_d', label: 'Joelho direito' },
  { value: 'joelho_e', label: 'Joelho esquerdo' },
  { value: 'tornozelo_pe', label: 'Tornozelo / pé' },
  { value: 'cotovelo_punho', label: 'Cotovelo / punho' },
  { value: 'outra', label: 'Outra' },
]

// lesões com diagnóstico médico/cirúrgico (histórico estruturado; o detalhe
// do estado atual vai em texto livre)
export const LESOES: Option[] = [
  { value: 'lca', label: 'Ligamento cruzado anterior — LCA (joelho)' },
  { value: 'menisco', label: 'Menisco (joelho)' },
  { value: 'manguito', label: 'Manguito rotador (ombro)' },
  { value: 'luxacao_recidivante', label: 'Luxação recidivante ("articulação que sai do lugar")' },
  { value: 'fratura_recente', label: 'Fratura óssea recente (menos de 1 ano)' },
  { value: 'hernia_disco', label: 'Hérnia de disco (lombar / cervical)' },
  { value: 'tendinopatia', label: 'Tendinite / tendinopatia crônica' },
  { value: 'estiramento_grave', label: 'Estiramento muscular grave (grau II/III)' },
  { value: 'outra', label: 'Outra lesão estrutural importante' },
]

export const HISTORIA_FAMILIAR: Option[] = [
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' },
  { value: 'nao_sei', label: 'Não sei' },
]

export const TEMPO_EVOLUCAO: Option[] = [
  { value: 'aguda', label: 'Aguda (menos de 6 semanas)' },
  { value: 'subaguda', label: 'Subaguda (6 a 12 semanas)' },
  { value: 'cronica', label: 'Crônica (mais de 12 semanas)' },
]

export const RED_FLAGS: Option[] = [
  { value: 'dor_noturna', label: 'Dor noturna progressiva que não alivia com repouso' },
  { value: 'perda_peso', label: 'Perda de peso inexplicada' },
  { value: 'deficit_neuro', label: 'Formigamento, fraqueza ou perda de força' },
  { value: 'febre', label: 'Febre associada' },
  { value: 'cancer', label: 'História de câncer' },
  { value: 'esfincter', label: 'Alteração de controle de bexiga/intestino' },
  { value: 'trauma', label: 'Trauma significativo recente' },
]

export const TABAGISMO: Option[] = [
  { value: 'nunca', label: 'Nunca' },
  { value: 'ex', label: 'Ex-fumante' },
  { value: 'atual', label: 'Atual' },
]

export const ALCOOL: Option[] = [
  { value: 'nao', label: 'Não' },
  { value: 'social', label: 'Social' },
  { value: 'frequente', label: 'Frequente' },
]

export const SONO_QUALIDADE: Option[] = [
  { value: 'boa', label: 'Boa' },
  { value: 'regular', label: 'Regular' },
  { value: 'ruim', label: 'Ruim' },
]

export const ESTRESSE: Option[] = [
  { value: 'baixo', label: 'Baixo' },
  { value: 'medio', label: 'Médio' },
  { value: 'alto', label: 'Alto' },
]

export const LADO_DOMINANTE: Option[] = [
  { value: 'destro', label: 'Destro' },
  { value: 'canhoto', label: 'Canhoto' },
  { value: 'ambidestro', label: 'Ambidestro' },
]

export const ALTERACAO_POSTURAL: Option[] = [
  { value: 'escoliose', label: 'Escoliose' },
  { value: 'hipercifose', label: 'Hipercifose' },
  { value: 'hiperlordose', label: 'Hiperlordose' },
  { value: 'outra', label: 'Outra' },
]

// ---- Estruturas do payload --------------------------------------------
export type Cirurgia = { descricao: string; ano: string; regiao: string }
export type Medicamento = { nome: string; dose: string }
export type QueixaDor = {
  regiao: string
  intensidade: number
  tempo_evolucao: string
  fatores_piora: string
  fatores_melhora: string
  lesao_previa_regiao: boolean
}

export type AnamnesisAnswers = {
  // A1 (7 itens PAR-Q) — bool | null (null = não respondido)
  parq: Record<string, boolean | null>
  parq_condicao_cronica_qual: string
  parq_medicacao_cronica_qual: string
  // A2 ACSM
  ativo_regular: boolean | null
  doenca_cmr: string[]
  sinais_sintomas: string[]
  // B1
  objetivo_principal: string[]
  objetivo_motivo: string
  objetivo_6meses: string
  esporte_modalidade: string
  experiencia_treino: string
  intensidade_desejada: string
  // B1b — logística e preferências de treino
  treino_freq_semana: string
  treino_tempo_sessao: string
  treino_local: string
  treino_equipamentos: string
  pref_gosta: string
  pref_nao_gosta: string
  pref_veto: string
  perfil_sessao: string
  // B2
  doencas_cronicas: string[]
  cirurgias: Cirurgia[]
  medicamentos: Medicamento[]
  // '' | 'sim' | 'nao' | 'nao_sei' (na spec 1.0 era boolean | null;
  // parseAnswers converte na leitura)
  historia_familiar_dcv: string
  tabagismo: string
  tabagismo_macos_ano: string
  alcool: string
  // B3
  dor_queixas: QueixaDor[]
  lesoes_diagnosticadas: string[]
  lesoes_estado_atual: string
  red_flags: string[]
  // B4
  atividade_tipo: string
  atividade_freq_semanal: string
  atividade_duracao_min: string
  atividade_intensidade: string
  ocupacao: string
  horas_sentado_dia: string
  esforco_repetitivo_carga: boolean | null
  esforco_repetitivo_desc: string
  sono_horas: string
  sono_qualidade: string
  estresse_percebido: string
  acompanhamento_nutricional: boolean | null
  // B5
  lado_dominante: string
  atividade_assimetrica: boolean | null
  atividade_assimetrica_desc: string
  uso_palmilha_ortese: boolean | null
  uso_palmilha_desc: string
  alteracao_postural_diagnosticada: string[]
  queixa_postural_principal: string
  // B6 (só feminino)
  gestante: boolean | null
  gestante_semanas: string
  pos_parto_recente: boolean | null
  pos_parto_meses: string
  // B7
  declaracao_veracidade: boolean
  consentimento_lgpd: boolean
  observacoes: string
}

export function emptyAnamnesis(): AnamnesisAnswers {
  return {
    parq: Object.fromEntries(PARQ_ITEMS.map((i) => [i.key, null])),
    parq_condicao_cronica_qual: '',
    parq_medicacao_cronica_qual: '',
    ativo_regular: null,
    doenca_cmr: [],
    sinais_sintomas: [],
    objetivo_principal: [],
    objetivo_motivo: '',
    objetivo_6meses: '',
    esporte_modalidade: '',
    experiencia_treino: '',
    intensidade_desejada: '',
    treino_freq_semana: '',
    treino_tempo_sessao: '',
    treino_local: '',
    treino_equipamentos: '',
    pref_gosta: '',
    pref_nao_gosta: '',
    pref_veto: '',
    perfil_sessao: '',
    doencas_cronicas: [],
    cirurgias: [],
    medicamentos: [],
    historia_familiar_dcv: '',
    tabagismo: '',
    tabagismo_macos_ano: '',
    alcool: '',
    dor_queixas: [],
    lesoes_diagnosticadas: [],
    lesoes_estado_atual: '',
    red_flags: [],
    atividade_tipo: '',
    atividade_freq_semanal: '',
    atividade_duracao_min: '',
    atividade_intensidade: '',
    ocupacao: '',
    horas_sentado_dia: '',
    esforco_repetitivo_carga: null,
    esforco_repetitivo_desc: '',
    sono_horas: '',
    sono_qualidade: '',
    estresse_percebido: '',
    acompanhamento_nutricional: null,
    lado_dominante: '',
    atividade_assimetrica: null,
    atividade_assimetrica_desc: '',
    uso_palmilha_ortese: null,
    uso_palmilha_desc: '',
    alteracao_postural_diagnosticada: [],
    queixa_postural_principal: '',
    gestante: null,
    gestante_semanas: '',
    pos_parto_recente: null,
    pos_parto_meses: '',
    declaracao_veracidade: false,
    consentimento_lgpd: false,
    observacoes: '',
  }
}

