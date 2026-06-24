import type {
  MuscleGroup,
  MuscleVolume,
  VolumeExercise,
  VolumeOverride,
  VolumePlanInput,
  VolumeSnapshot,
  WeekVolume,
} from './types'

// Versao do motor de volume. Gravada em workout_plans.volume_engine_version pra
// um plano emitido continuar reproduzivel mesmo se a contagem mudar depois.
export const VOLUME_ENGINE_VERSION = 'volume-engine@1'

// Contagem fracionada: musculo primario conta 1 serie cheia, secundario 0.5.
// Nao e palpite: e o metodo 'fractional' das meta-regressoes dose-resposta, o de
// melhor evidencia atual. Constante por design; versionada acima.
export const VOLUME_WEIGHTS = { primary: 1.0, secondary: 0.5 } as const

// Texto curto do metodo, exibido na UI e no PDF (transparencia, igual a
// divulgacao Siri/Brozek na avaliacao).
export const VOLUME_METHOD_NOTE =
  `Volume fracionado (${VOLUME_ENGINE_VERSION}): musculo primario conta ` +
  `${VOLUME_WEIGHTS.primary.toFixed(1)} serie e secundario ${VOLUME_WEIGHTS.secondary.toFixed(1)}, ` +
  `somando series por grupo muscular na semana.`

function addTo(m: MuscleVolume, key: MuscleGroup, value: number): void {
  m[key] = (m[key] ?? 0) + value
}

// Series efetivas de um exercicio numa semana: override > template; skip = 0.
function effectiveSets(ex: VolumeExercise, override?: VolumeOverride): number {
  if (override?.skipped) return 0
  return override?.sets ?? ex.sets
}

// Conta o volume de UMA semana com os sets ja resolvidos. Exportada pra ser
// testada e reusada isoladamente.
export function countWeekVolume(
  exercises: Pick<VolumeExercise, 'primaryMuscle' | 'secondaryMuscles' | 'sets'>[]
): { byMuscle: MuscleVolume; totalSets: number } {
  const byMuscle: MuscleVolume = {}
  let totalSets = 0
  for (const ex of exercises) {
    if (!(ex.sets > 0)) continue
    totalSets += ex.sets
    addTo(byMuscle, ex.primaryMuscle, ex.sets * VOLUME_WEIGHTS.primary)
    for (const m of ex.secondaryMuscles) addTo(byMuscle, m, ex.sets * VOLUME_WEIGHTS.secondary)
  }
  return { byMuscle, totalSets }
}

// Snapshot completo: expande semanas x dias, aplica overrides, conta por semana
// e escolhe a semana "tipica" (1a sem deload) pro headline. Espelha
// buildAssessmentResult: resultado + dados suficientes pra reproduzir.
export function buildVolumeSnapshot(plan: VolumePlanInput): VolumeSnapshot {
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
        sets: effectiveSets(ex, weekOverrides[ex.key]),
      }))
    })
    const { byMuscle, totalSets } = countWeekVolume(resolved)
    perWeek.push({ week, byMuscle, totalSets })
  }

  const typicalWeek =
    (perWeek.find((w) => !deload.has(w.week)) ?? perWeek[0])?.week ?? 1
  const typical = perWeek.find((w) => w.week === typicalWeek)

  return {
    engineVersion: VOLUME_ENGINE_VERSION,
    weights: { primary: VOLUME_WEIGHTS.primary, secondary: VOLUME_WEIGHTS.secondary },
    perWeek,
    typicalWeek,
    typicalByMuscle: typical?.byMuscle ?? {},
  }
}
