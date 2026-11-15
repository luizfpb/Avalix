import { createSubject, type SubjectRow } from './api'
import { grantConsent } from '../consent/api'
import { createAnamnese } from '../anamnesis/api'
import { emptyAnamnesis, PARQ_ITEMS } from '../anamnesis/spec'
import { createAssessment } from '../assessment/api'
import { buildAssessmentResult } from '../assessment/result'
import { createFitnessTest } from '../fitness/api'
import {
  createWorkoutPlan,
  listExercises,
  type ExerciseRow,
  type PlanDayInput,
} from '../workout/api'
import {
  buildVolumeSnapshot,
  type MovementPattern,
  type MuscleGroup,
} from '../workout/volume'

export type CreateDemoSubjectInput = {
  orgId: string
  orgName: string | null
  userId: string
  now?: Date
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base.getTime())
  next.setDate(next.getDate() + days)
  return next
}

function ageYearsOn(birthIso: string, refDate: Date): number {
  const [y, m, d] = birthIso.split('-').map(Number)
  let age = refDate.getFullYear() - y
  const monthDiff = refDate.getMonth() + 1 - m
  if (monthDiff < 0 || (monthDiff === 0 && refDate.getDate() < d)) age -= 1
  return Math.max(18, age)
}

function pickExercises(catalog: ExerciseRow[]): { a: ExerciseRow[]; b: ExerciseRow[] } {
  const used = new Set<string>()
  const pick = (muscles: string[], count: number): ExerciseRow[] => {
    const out: ExerciseRow[] = []
    for (const m of muscles) {
      const found = catalog.find((e) => !used.has(e.id) && e.primary_muscle === m)
      if (found) {
        used.add(found.id)
        out.push(found)
        if (out.length >= count) return out
      }
    }
    for (const e of catalog) {
      if (!used.has(e.id)) {
        used.add(e.id)
        out.push(e)
        if (out.length >= count) break
      }
    }
    return out
  }
  return {
    a: pick(['quads', 'chest', 'back', 'abs'], 3),
    b: pick(['hamstrings', 'glutes', 'shoulders', 'biceps', 'triceps'], 3),
  }
}

export async function createDemoSubject({
  orgId,
  orgName,
  userId,
  now = new Date(),
}: CreateDemoSubjectInput): Promise<SubjectRow> {
  const d1Date = addDays(now, -60)
  const d1 = isoDate(d1Date)
  const d2 = isoDate(now)
  const birthDate = '1992-05-14'

  const subject = await createSubject({
    org_id: orgId,
    full_name: 'Mariana Costa (Exemplo)',
    sex: 'F',
    birth_date: birthDate,
    phone: '(11) 99999-0000',
    email: null,
    notes:
      'Cadastro de demonstração criado pelo Avalix. Explore a evolução entre as duas avaliações, os testes físicos, o treino ativo e os laudos em PDF; exclua este cadastro quando quiser.',
  })

  await grantConsent({
    subjectId: subject.id,
    orgId,
    collectedBy: userId,
    controllerName: orgName,
    signerKind: 'titular',
    signerName: subject.full_name,
  })

  const answers = emptyAnamnesis()
  answers.parq = Object.fromEntries(PARQ_ITEMS.map((i) => [i.key, false]))
  answers.ativo_regular = true
  answers.doenca_cmr = []
  answers.doenca_cmr_confirmada = true
  answers.sinais_sintomas = []
  answers.sinais_sintomas_confirmados = true
  answers.medicamentos = []
  answers.medicamentos_confirmados = true
  answers.objetivo_principal = ['composicao', 'hipertrofia']
  answers.experiencia_treino = '6a24m'
  answers.treino_freq_semana = '3'
  answers.treino_tempo_sessao = '45_60'
  answers.treino_local = 'academia'
  answers.declaracao_veracidade = true
  answers.consentimento_lgpd = true

  await createAnamnese({
    orgId,
    subjectId: subject.id,
    assessedAt: d1,
    answers,
  })

  const folds1: Record<string, number> = {
    chest: 11,
    midaxillary: 13,
    triceps: 20,
    subscapular: 16,
    abdomen: 24,
    suprailiac: 18,
    thigh: 27,
  }
  const circs1: Record<string, number> = {
    waist: 75.5,
    abdomen: 81.0,
    hip: 99.5,
    arm_relaxed_right: 27.5,
    arm_relaxed_left: 27.3,
    thigh_mid_right: 54.0,
    thigh_mid_left: 53.8,
  }
  await createAssessment({
    orgId,
    subjectId: subject.id,
    assessedAt: d1,
    protocolId: 'jp7',
    weightKg: 64.8,
    heightCm: 165,
    medications: null,
    notes: 'Avaliação inicial de demonstração.',
    result: buildAssessmentResult(
      'jp7',
      {
        sex: 'F',
        ageYears: ageYearsOn(birthDate, d1Date),
        heightCm: 165,
        skinfoldsMm: folds1,
        circumferencesCm: circs1,
      },
      64.8
    ),
    skinfolds: Object.entries(folds1).map(([site, v]) => ({
      site,
      reading_1: v,
      reading_2: v,
      reading_3: null,
    })),
    circumferences: Object.entries(circs1).map(([site, value_cm]) => ({
      site,
      value_cm,
    })),
  })

  const folds2: Record<string, number> = {
    chest: 9,
    midaxillary: 11,
    triceps: 18,
    subscapular: 14,
    abdomen: 21,
    suprailiac: 15,
    thigh: 24,
  }
  const circs2: Record<string, number> = {
    waist: 72.0,
    abdomen: 77.5,
    hip: 98.0,
    arm_relaxed_right: 28.2,
    arm_relaxed_left: 28.0,
    thigh_mid_right: 55.2,
    thigh_mid_left: 55.0,
  }
  const assess2 = await createAssessment({
    orgId,
    subjectId: subject.id,
    assessedAt: d2,
    protocolId: 'jp7',
    weightKg: 62.4,
    heightCm: 165,
    medications: null,
    notes: 'Reavaliação após 8 semanas de treino.',
    result: buildAssessmentResult(
      'jp7',
      {
        sex: 'F',
        ageYears: ageYearsOn(birthDate, now),
        heightCm: 165,
        skinfoldsMm: folds2,
        circumferencesCm: circs2,
      },
      62.4
    ),
    skinfolds: Object.entries(folds2).map(([site, v]) => ({
      site,
      reading_1: v,
      reading_2: v,
      reading_3: null,
    })),
    circumferences: Object.entries(circs2).map(([site, value_cm]) => ({
      site,
      value_cm,
    })),
  })

  await createFitnessTest({
    orgId,
    subjectId: subject.id,
    testedAt: d1,
    measures: {
      cooper: { distance_m: 1950 },
      push_ups: { reps: 14, knees: true },
      sit_ups: { reps: 26 },
      sit_and_reach: { best_cm: 27, feet_mark_cm: 26 },
      grip: { right_kg: 26, left_kg: 24.5 },
    },
    notes: 'Bateria inicial.',
  })

  await createFitnessTest({
    orgId,
    subjectId: subject.id,
    testedAt: d2,
    measures: {
      cooper: { distance_m: 2180 },
      push_ups: { reps: 19, knees: true },
      sit_ups: { reps: 32 },
      sit_and_reach: { best_cm: 30.5, feet_mark_cm: 26 },
      grip: { right_kg: 28.5, left_kg: 27 },
    },
    notes: 'Reavaliação após 8 semanas.',
  })

  const catalog = await listExercises(orgId)
  const { a, b } = pickExercises(catalog)
  if (a.length > 0 && b.length > 0) {
    const days: PlanDayInput[] = [
      {
        label: 'A',
        name: 'Corpo inteiro — ênfase anterior',
        exercises: a.map((ex, idx) => ({
          clientKey: `demo-a-${idx}`,
          exerciseId: ex.id,
          sets: 3,
          reps: '8-12',
          rir: 2,
          restSeconds: 90,
          tempo: null,
          notes: null,
          groupKey: null,
          groupKind: null,
          technique: null,
        })),
      },
      {
        label: 'B',
        name: 'Corpo inteiro — ênfase posterior',
        exercises: b.map((ex, idx) => ({
          clientKey: `demo-b-${idx}`,
          exerciseId: ex.id,
          sets: 3,
          reps: '10-12',
          rir: 2,
          restSeconds: 90,
          tempo: null,
          notes: null,
          groupKey: null,
          groupKind: null,
          technique: null,
        })),
      },
    ]

    const byId = new Map(catalog.map((e) => [e.id, e]))
    const weeklySchedule = ['A', 'B', 'A']
    const volume = buildVolumeSnapshot({
      weeks: 8,
      weeklySchedule,
      days: days.map((d) => ({
        label: d.label,
        exercises: d.exercises.map((e) => {
          const cat = byId.get(e.exerciseId)!
          return {
            key: e.clientKey,
            primaryMuscle: cat.primary_muscle as MuscleGroup,
            additionalPrimaryMuscles: (cat.additional_primary_muscles ?? []) as MuscleGroup[],
            secondaryMuscles: (cat.secondary_muscles ?? []) as MuscleGroup[],
            movementPattern: cat.movement_pattern as MovementPattern,
            sets: e.sets,
          }
        }),
      })),
    })

    await createWorkoutPlan({
      orgId,
      subjectId: subject.id,
      name: 'Base e recomposição corporal (A/B)',
      goal: 'composicao',
      weeks: 8,
      startsOn: d2,
      notes: 'Plano de demonstração (3 sessões por semana, alternando A e B).',
      status: 'active',
      sourceAssessmentId: assess2.id,
      sourcePostureSessionId: null,
      weeklySchedule,
      volume,
      days,
      overrides: [],
      weeksMeta: [],
    })
  }

  return subject
}
