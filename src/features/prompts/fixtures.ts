// Fixtures compartilhadas pelos testes de prompt. Ficam fora do *.test.ts
// porque três suítes usam o mesmo caso, e um caso só, realista e completo, vale
// mais do que três meio preenchidos: o objetivo dos testes aqui é garantir que
// nada do material se perde no caminho.

import { emptyAnamnesis, type AnamnesisAnswers } from '../anamnesis/spec'
import type { AssessmentResultSnapshot } from '../assessment/result'
import type { AssessmentPromptPoint, SkinfoldReading } from './assessment'
import type { PromptSubject } from './identity'

export const SUBJECT: PromptSubject = {
  fullName: 'Luiz Felipe Brum Boy',
  birthDate: '1985-03-12',
  sex: 'M',
}

// PAR-Q todo "Não", sem doença nem sintoma: base para o caso liberado.
export function anamneseBase(): AnamnesisAnswers {
  const a = emptyAnamnesis()
  for (const k of Object.keys(a.parq)) a.parq[k] = false
  return a
}

// Caso realista e denso: triagem positiva, texto livre em vários campos,
// queixa de dor, lesão diagnosticada e alteração postural.
export function anamneseCompleta(): AnamnesisAnswers {
  const a = anamneseBase()
  a.parq.condicao_cronica = true
  a.parq_condicao_cronica_qual = 'hipotireoidismo'
  a.parq.medicacao_cronica = true
  a.parq_medicacao_cronica_qual = 'levotiroxina 75mcg'
  a.parq.lesao_atividade = true

  a.ativo_regular = false
  a.doenca_cmr = ['metabolica']

  a.objetivo_principal = ['composicao', 'saude']
  a.objetivo_motivo = 'voltei a sentir dor nas costas no trabalho e me sinto sem disposição'
  a.objetivo_6meses = 'perder uns 8 kg e não sentir dor lombar no fim do dia'
  a.experiencia_treino = 'lt6m'
  a.intensidade_desejada = 'moderada'

  a.treino_freq_semana = '3'
  a.treino_tempo_sessao = '45_60'
  a.treino_local = 'academia'
  a.pref_gosta = 'caminhada, esteira'
  a.pref_nao_gosta = 'aula coletiva'
  a.pref_veto = 'nada de corrida, tenho medo do joelho'
  a.perfil_sessao = 'volumosa_cadenciada'

  a.doencas_cronicas = ['tireoide', 'dislipidemia']
  a.cirurgias = [{ descricao: 'menisco joelho direito', ano: '2019', regiao: 'joelho_d' }]
  a.medicamentos = [
    { nome: 'levotiroxina', dose: '75 mcg' },
    { nome: 'sinvastatina', dose: '20 mg' },
  ]
  a.historia_familiar_dcv = 'sim'
  a.tabagismo = 'ex'
  a.tabagismo_macos_ano = '5'
  a.alcool = 'social'

  a.dor_queixas = [
    {
      regiao: 'lombar',
      intensidade: 6,
      tempo_evolucao: 'cronica',
      fatores_piora: 'ficar sentado muito tempo e no fim do dia',
      fatores_melhora: 'alongar e caminhar',
      lesao_previa_regiao: false,
    },
    {
      regiao: 'joelho_d',
      intensidade: 3,
      tempo_evolucao: 'cronica',
      fatores_piora: 'descer escada',
      fatores_melhora: 'repouso',
      lesao_previa_regiao: true,
    },
  ]
  // narrativa da dor (spec 1.2). A fixture mantém DE PROPÓSITO os campos antigos
  // nas queixas acima: é assim que um registro real de 1.1 chega ao prompt, e o
  // briefing tem de continuar carregando os dois.
  a.dor_historia =
    'comecou ha uns dois anos, depois que mudei de setor e passei a ficar mais tempo sentado; e uma dor que aperta e piora no fim do dia'
  a.dor_tentativas =
    'fiz fisioterapia por dois meses e ajudou bastante, anti-inflamatorio so tira na hora; piora quando fico parado e melhora quando caminho'
  a.dor_impacto_medo =
    'parei de jogar futebol com meus amigos no sabado; tenho medo de ter uma hernia e precisar operar'

  a.lesoes_diagnosticadas = ['menisco']
  a.lesoes_estado_atual = 'operei em 2019, médico liberou, mas às vezes trava'

  a.ocupacao = 'analista administrativo'
  a.horas_sentado_dia = '9'
  a.sono_horas = '6'
  a.sono_qualidade = 'regular'
  a.estresse_percebido = 'alto'
  a.esforco_repetitivo_carga = false
  a.acompanhamento_nutricional = false

  a.lado_dominante = 'destro'
  a.atividade_assimetrica = false
  a.uso_palmilha_ortese = false
  a.alteracao_postural_diagnosticada = ['hiperlordose']
  a.queixa_postural_principal = 'meu ombro esquerdo parece mais baixo nas fotos'

  a.declaracao_veracidade = true
  a.consentimento_lgpd = true
  a.observacoes = 'tem pressa pra começar, viagem em 3 meses'
  return a
}

function snapshot(overrides: Partial<AssessmentResultSnapshot> = {}): AssessmentResultSnapshot {
  return {
    engineVersion: '1.1.0',
    protocolId: 'jp7',
    bodyDensity: 1.048,
    bodyFatPct: 22.3,
    conversions: { siri: 22.3, brozek: 22.0 },
    fatMassKg: 19.6,
    leanMassKg: 68.4,
    warnings: [],
    inputs: {
      sex: 'M',
      ageYears: 40,
      heightCm: 178,
      weightKg: 88,
      skinfoldsMm: { chest: 14, abdomen: 28, thigh: 18 },
      circumferencesCm: {},
    },
    ...overrides,
  }
}

export function point(
  assessedAt: string,
  overrides: Partial<AssessmentPromptPoint> = {}
): AssessmentPromptPoint {
  return {
    assessedAt,
    protocolId: 'jp7',
    engineVersion: '1.1.0',
    weightKg: 88,
    heightCm: 178,
    results: snapshot(),
    circumferences: [
      { site: 'waist', valueCm: 92 },
      { site: 'arm_relaxed_r', valueCm: 33.5 },
    ],
    ...overrides,
  }
}

export function pointWith(
  assessedAt: string,
  weightKg: number,
  bodyFatPct: number,
  overrides: Partial<AssessmentPromptPoint> = {}
): AssessmentPromptPoint {
  const leanMassKg = Math.round(weightKg * (1 - bodyFatPct / 100) * 10) / 10
  return point(assessedAt, {
    weightKg,
    results: snapshot({
      bodyFatPct,
      fatMassKg: Math.round((weightKg - leanMassKg) * 10) / 10,
      leanMassKg,
    }),
    ...overrides,
  })
}

export const SKINFOLDS: SkinfoldReading[] = [
  { site: 'chest', readings: [14, 15, 14] },
  { site: 'abdomen', readings: [28, 30] },
  { site: 'thigh', readings: [18] },
]
