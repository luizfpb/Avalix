import type { AnamnesisAnswers } from '../anamnesis/spec'
import type { MovementPattern, MuscleGroup } from './volume'

// Inteligência avaliação→prescrição: cruza a anamnese (dados estruturados) com os
// exercícios do plano. NÃO é contraindicação médica nem diagnóstico — é um SINAL
// pra o profissional REVISAR o exercício diante da queixa/achado. Conservador,
// versionado e transparente (cada sinal traz o motivo). O treinador decide.
export const CONTRA_RULES_VERSION = 'contra-rules@2'

type Caution = { muscles: MuscleGroup[]; patterns: MovementPattern[] }

// Região de dor (REGIAO_DOR da anamnese) -> grupos/padrões a revisar.
const REGION_CAUTION: Record<string, Caution> = {
  lombar: { muscles: ['lower_back'], patterns: ['hinge', 'squat'] },
  dorsal: { muscles: ['lower_back', 'upper_back'], patterns: ['hinge'] },
  cervical: { muscles: ['neck', 'traps'], patterns: ['vertical_push'] },
  ombro_d: { muscles: ['front_delts', 'side_delts', 'chest'], patterns: ['vertical_push', 'horizontal_push'] },
  ombro_e: { muscles: ['front_delts', 'side_delts', 'chest'], patterns: ['vertical_push', 'horizontal_push'] },
  cotovelo_punho: { muscles: ['biceps', 'triceps', 'forearms'], patterns: [] },
  quadril_d: { muscles: ['glutes', 'adductors'], patterns: ['squat', 'hinge', 'lunge'] },
  quadril_e: { muscles: ['glutes', 'adductors'], patterns: ['squat', 'hinge', 'lunge'] },
  joelho_d: { muscles: ['quads'], patterns: ['squat', 'lunge'] },
  joelho_e: { muscles: ['quads'], patterns: ['squat', 'lunge'] },
  tornozelo_pe: { muscles: ['calves'], patterns: ['squat', 'lunge'] },
}

const REGION_LABEL: Record<string, string> = {
  cervical: 'cervical',
  ombro_d: 'ombro direito',
  ombro_e: 'ombro esquerdo',
  dorsal: 'dorsal',
  lombar: 'lombar',
  quadril_d: 'quadril direito',
  quadril_e: 'quadril esquerdo',
  joelho_d: 'joelho direito',
  joelho_e: 'joelho esquerdo',
  tornozelo_pe: 'tornozelo/pé',
  cotovelo_punho: 'cotovelo/punho',
  outra: 'outra região',
}

// Lesão diagnosticada (LESOES da anamnese) -> grupos/padrões a revisar. Só as
// lesões cuja região é inequívoca; as demais (fratura, tendinopatia, luxação,
// estiramento, outra) não carregam região e ficam pro texto livre do estado
// atual — sinal automático nelas seria chute.
const LESION_CAUTION: Record<string, { caution: Caution; label: string }> = {
  lca: { caution: { muscles: ['quads'], patterns: ['squat', 'lunge'] }, label: 'lesão de LCA (joelho)' },
  menisco: { caution: { muscles: ['quads'], patterns: ['squat', 'lunge'] }, label: 'lesão de menisco (joelho)' },
  manguito: {
    caution: { muscles: ['front_delts', 'side_delts', 'chest'], patterns: ['vertical_push', 'horizontal_push'] },
    label: 'lesão de manguito rotador (ombro)',
  },
  hernia_disco: {
    caution: { muscles: ['lower_back'], patterns: ['hinge', 'squat'] },
    label: 'hérnia de disco',
  },
}

export type ExerciseLite = {
  primaryMuscle: MuscleGroup
  secondaryMuscles: MuscleGroup[]
  movementPattern: MovementPattern
}

// queixas relevantes: dor >= 3/10 ou lesão prévia na região.
function relevantRegions(answers: AnamnesisAnswers): { region: string; reason: string }[] {
  const out: { region: string; reason: string }[] = []
  for (const q of answers.dor_queixas ?? []) {
    if ((q.intensidade ?? 0) >= 3 || q.lesao_previa_regiao) {
      const label = REGION_LABEL[q.regiao] ?? q.regiao
      const dor = q.intensidade ? ` (dor ${q.intensidade}/10)` : ''
      out.push({ region: q.regiao, reason: `queixa em ${label}${dor}` })
    }
  }
  return out
}

// Motivos para REVISAR este exercício diante da anamnese. Vazio = sem sinal.
export function exerciseCautions(answers: AnamnesisAnswers, ex: ExerciseLite): string[] {
  const reasons: string[] = []
  const muscles = new Set<MuscleGroup>([ex.primaryMuscle, ...ex.secondaryMuscles])

  for (const { region, reason } of relevantRegions(answers)) {
    const c = REGION_CAUTION[region]
    if (!c) continue
    if (c.muscles.some((m) => muscles.has(m)) || c.patterns.includes(ex.movementPattern)) {
      reasons.push(reason)
    }
  }

  // histórico de lesão diagnosticada com região conhecida
  for (const lesao of answers.lesoes_diagnosticadas ?? []) {
    const l = LESION_CAUTION[lesao]
    if (!l) continue
    if (l.caution.muscles.some((m) => muscles.has(m)) || l.caution.patterns.includes(ex.movementPattern)) {
      reasons.push(`histórico de ${l.label}`)
    }
  }

  // red flags de coluna: poupar carga axial pesada até avaliação
  if (
    (answers.red_flags ?? []).length > 0 &&
    (ex.movementPattern === 'hinge' || ex.movementPattern === 'squat' || muscles.has('lower_back'))
  ) {
    reasons.push('sinais de alerta de coluna — evitar carga axial até avaliação médica')
  }

  return [...new Set(reasons)]
}

// "Sugestão por achado": alterações posturais diagnosticadas -> ênfase de treino
// (orientação geral, não diagnóstico).
const POSTURE_EMPHASIS: Record<string, string> = {
  hipercifose:
    'Hipercifose: considere priorizar dorsais e deltoide posterior e trabalho de mobilidade torácica.',
  hiperlordose:
    'Hiperlordose: considere fortalecer abdômen e glúteos e mobilidade de flexores de quadril.',
  escoliose:
    'Escoliose: priorize trabalho simétrico e unilateral controlado; encaminhe se progressiva ou dolorosa.',
}

export function posturalEmphasis(answers: AnamnesisAnswers): string[] {
  const out: string[] = []
  for (const a of answers.alteracao_postural_diagnosticada ?? []) {
    if (POSTURE_EMPHASIS[a]) out.push(POSTURE_EMPHASIS[a])
  }
  if (answers.gestante) {
    out.push('Gestante: adapte conforme o trimestre; evite supino prolongado em decúbito dorsal e Valsalva intensa.')
  }
  return out
}
