// Tipos do motor de volume de treino.
// Principio (igual assessment/protocols): motor e codigo TS puro e testado, nao
// tabela. A taxonomia abaixo e a fonte de verdade do vocabulario; os CHECK das
// migrations 0006/0008 espelham estas listas. Rotulos pt-BR ficam em labels.ts.
//
// Volume = series semanais por grupo muscular, contadas de forma fracionada
// (primario 1.0 / secundario 0.5) — o metodo de melhor evidencia nas
// meta-regressoes dose-resposta atuais. A constante e versionada (engine.ts) e
// snapshotada com o plano, pra reprodutibilidade.

// 20 grupos: recorte dos volume landmarks (RP/Israetel) refinado ao nivel mais
// granular ainda treinavel de forma independente.
export type MuscleGroup =
  | 'chest'
  | 'lats'
  | 'upper_back'
  | 'traps'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'lower_back'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'adductors'
  | 'abductors'
  | 'calves'
  | 'neck'

export type Equipment =
  | 'barbell'
  | 'ez_bar'
  | 'trap_bar'
  | 'dumbbell'
  | 'kettlebell'
  | 'machine'
  | 'smith_machine'
  | 'cable'
  | 'bodyweight'
  | 'resistance_band'
  | 'suspension'
  | 'plate'
  | 'medicine_ball'
  | 'other'

export type MovementPattern =
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'carry'
  | 'rotation'
  | 'isolation'
  | 'core'

// Um exercicio do plano sob a otica do volume. `key` e o id estavel usado pelo
// editor (temp no create, id do banco no edit) e tambem o alvo dos overrides.
export type VolumeExercise = {
  key: string
  primaryMuscle: MuscleGroup
  secondaryMuscles: MuscleGroup[]
  sets: number // baseline do template
}

export type VolumeDay = {
  label: string
  exercises: VolumeExercise[]
}

// Sobrescrita de uma semana para um exercicio. Campo ausente = herda do
// template; skipped = exercicio nao executado naquela semana (volume 0).
export type VolumeOverride = {
  sets?: number
  skipped?: boolean
}

export type VolumePlanInput = {
  weeks: number
  days: VolumeDay[]
  // overrides[weekNumber][exerciseKey]
  overrides?: Record<number, Record<string, VolumeOverride>>
  // semanas marcadas como deload (so influem na escolha da semana "tipica")
  deloadWeeks?: number[]
}

// Series fracionadas por grupo muscular. Parcial: grupo ausente = 0 series.
export type MuscleVolume = Partial<Record<MuscleGroup, number>>

export type WeekVolume = {
  week: number
  byMuscle: MuscleVolume // series fracionadas por grupo
  totalSets: number // series reais (nao fracionadas) executadas na semana
}

// Gravado em workout_plans.volume. Guarda resultado E pesos usados, pro PDF
// continuar reproduzivel mesmo se a constante/motor mudar depois (espelha
// AssessmentResultSnapshot).
export type VolumeSnapshot = {
  engineVersion: string
  weights: { primary: number; secondary: number }
  perWeek: WeekVolume[]
  typicalWeek: number // 1a semana sem deload (default 1)
  typicalByMuscle: MuscleVolume
}
