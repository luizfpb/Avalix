import type {
  MovementPattern,
  MuscleGroup,
  MuscleVolume,
  VolumeExercise,
  VolumeMethod,
  VolumeOverride,
  VolumePlanInput,
  VolumeSnapshot,
  WeekVolume,
} from './types'

// Versao do motor de volume. Gravada em workout_plans.volume_engine_version pra
// um plano emitido continuar reproduzivel mesmo se a contagem mudar depois.
export const VOLUME_ENGINE_VERSION = 'volume-engine@1'

// PADRAO — contagem fracionada: musculo primario conta 1 serie cheia, secundario
// 0.5. Nao e palpite: e o metodo 'fractional' das meta-regressoes dose-resposta,
// o de MELHOR EVIDENCIA atual. Constante por design; versionada acima.
export const VOLUME_WEIGHTS = { primary: 1.0, secondary: 0.5 } as const

// REFINADO (opcional) — mantem o secundario em 0.5 nos exercicios COMPOSTOS
// (multiarticulares) e reduz pra 0.25 nos ISOLADOS (monoarticulares, padrao de
// movimento 'isolation'). A regra e por padrao de movimento (transparente,
// cobre 100% incl. customizados), NAO numeros por exercicio.
export const REFINED_WEIGHTS = {
  primary: 1.0,
  compoundSecondary: 0.5,
  isolationSecondary: 0.25,
} as const

// Peso do secundario conforme o metodo e o padrao de movimento do exercicio.
export function secondaryWeight(method: VolumeMethod, pattern?: MovementPattern): number {
  if (method === 'refined') {
    return pattern === 'isolation'
      ? REFINED_WEIGHTS.isolationSecondary
      : REFINED_WEIGHTS.compoundSecondary
  }
  return VOLUME_WEIGHTS.secondary
}

// Texto curto do metodo padrao, exibido na UI e no PDF (transparencia, igual a
// divulgacao Siri/Brozek na avaliacao).
export const VOLUME_METHOD_NOTE =
  `Volume fracionado (${VOLUME_ENGINE_VERSION}): musculo primario conta ` +
  `${VOLUME_WEIGHTS.primary.toFixed(1)} serie e secundario ${VOLUME_WEIGHTS.secondary.toFixed(1)}, ` +
  `somando series por grupo muscular na semana.`

// Texto do modo refinado: explica O QUE E e deixa clara a VALIDADE (convencao
// pratica, nao constante validada). As referencias vao em VOLUME_METHOD_REFS.
export const VOLUME_METHOD_NOTE_REFINED =
  `Refinado (opcional): o secundario conta ${REFINED_WEIGHTS.compoundSecondary.toFixed(2)} nos ` +
  `exercicios compostos (multiarticulares) e ${REFINED_WEIGHTS.isolationSecondary.toFixed(2)} nos ` +
  `isolados (monoarticulares). E uma CONVENCAO PRATICA, nao uma constante validada: nenhuma ` +
  `literatura estabelece fracoes por exercicio, e a EMG (ativacao muscular) nao prediz hipertrofia. ` +
  `O padrao do app segue o 0,5 fixo, o metodo de melhor evidencia nas meta-regressoes dose-resposta.`

// Referencias exibidas junto do modo refinado (links clicaveis na UI).
export const VOLUME_METHOD_REFS: { label: string; url: string }[] = [
  {
    label: 'Meta-regressao dose-resposta (fracionado 0,5 = melhor evidencia relativa)',
    url: 'https://sportrxiv.org/index.php/server/preprint/view/460',
  },
  {
    label: 'Vigotsky et al. 2022 (Sports Med): EMG nao e preditor validado de hipertrofia',
    url: 'https://andrewvigotsky.com/studies/Vigotsky_2022_Sports_Med_sEMG_hypertrophy.pdf',
  },
]

function addTo(m: MuscleVolume, key: MuscleGroup, value: number): void {
  m[key] = (m[key] ?? 0) + value
}

// Series efetivas de um exercicio numa semana: override > template; skip = 0.
function effectiveSets(ex: VolumeExercise, override?: VolumeOverride): number {
  if (override?.skipped) return 0
  return override?.sets ?? ex.sets
}

// Conta o volume de UMA semana com os sets ja resolvidos. method='fractional'
// (padrao) usa 0.5 fixo; 'refined' usa o peso por padrao de movimento.
export function countWeekVolume(
  exercises: Pick<VolumeExercise, 'primaryMuscle' | 'secondaryMuscles' | 'sets' | 'movementPattern'>[],
  method: VolumeMethod = 'fractional'
): { byMuscle: MuscleVolume; totalSets: number } {
  const byMuscle: MuscleVolume = {}
  let totalSets = 0
  for (const ex of exercises) {
    if (!(ex.sets > 0)) continue
    totalSets += ex.sets
    addTo(byMuscle, ex.primaryMuscle, ex.sets * VOLUME_WEIGHTS.primary)
    const w = secondaryWeight(method, ex.movementPattern)
    for (const m of ex.secondaryMuscles) addTo(byMuscle, m, ex.sets * w)
  }
  return { byMuscle, totalSets }
}

// Snapshot completo: expande semanas x dias, aplica overrides, conta por semana
// e escolhe a semana "tipica" (1a sem deload) pro headline. Espelha
// buildAssessmentResult: resultado + dados suficientes pra reproduzir.
export function buildVolumeSnapshot(
  plan: VolumePlanInput,
  method: VolumeMethod = 'fractional'
): VolumeSnapshot {
  const weeksCount = Math.max(1, Math.floor(plan.weeks || 1))
  const deload = new Set(plan.deloadWeeks ?? [])
  const perWeek: WeekVolume[] = []

  // expande as sessoes da semana pela sequencia (ex.: ABA conta A duas vezes);
  // vazio = cada divisao uma vez, na ordem.
  const dayByLabel = new Map(plan.days.map((d) => [d.label, d]))
  const sessions =
    plan.weeklySchedule && plan.weeklySchedule.length > 0
      ? plan.weeklySchedule
      : plan.days.map((d) => d.label)

  for (let week = 1; week <= weeksCount; week++) {
    const weekOverrides = plan.overrides?.[week] ?? {}
    const resolved = sessions.flatMap((label) => {
      const day = dayByLabel.get(label)
      if (!day) return []
      return day.exercises.map((ex) => ({
        primaryMuscle: ex.primaryMuscle,
        secondaryMuscles: ex.secondaryMuscles,
        movementPattern: ex.movementPattern,
        sets: effectiveSets(ex, weekOverrides[ex.key]),
      }))
    })
    const { byMuscle, totalSets } = countWeekVolume(resolved, method)
    perWeek.push({ week, byMuscle, totalSets })
  }

  const typicalWeek =
    (perWeek.find((w) => !deload.has(w.week)) ?? perWeek[0])?.week ?? 1
  const typical = perWeek.find((w) => w.week === typicalWeek)

  return {
    engineVersion: VOLUME_ENGINE_VERSION,
    method,
    weights: { primary: VOLUME_WEIGHTS.primary, secondary: VOLUME_WEIGHTS.secondary },
    perWeek,
    typicalWeek,
    typicalByMuscle: typical?.byMuscle ?? {},
  }
}
