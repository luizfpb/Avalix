import {
  computeProtocol,
  ENGINE_VERSION,
  fatMassKg,
  leanMassKg,
  type ProtocolInput,
  type Sex,
} from './protocols'

// Snapshot gravado em assessments.results. Guarda o resultado E as entradas,
// pra um laudo continuar reproduzível mesmo se o motor mudar depois.
export type AssessmentResultSnapshot = {
  engineVersion: string
  protocolId: string
  bodyDensity: number | null
  bodyFatPct: number
  conversions: { siri: number; brozek: number } | null
  fatMassKg: number
  leanMassKg: number
  inputs: {
    sex: Sex
    ageYears: number
    heightCm: number
    weightKg: number
    skinfoldsMm: Record<string, number>
    circumferencesCm: Record<string, number>
  }
}

export function buildAssessmentResult(
  protocolId: string,
  input: ProtocolInput,
  weightKg: number
): AssessmentResultSnapshot {
  const r = computeProtocol(protocolId, input)
  return {
    engineVersion: ENGINE_VERSION,
    protocolId,
    bodyDensity: r.bodyDensity,
    bodyFatPct: r.bodyFatPct,
    conversions: r.conversions,
    fatMassKg: fatMassKg(weightKg, r.bodyFatPct),
    leanMassKg: leanMassKg(weightKg, r.bodyFatPct),
    inputs: {
      sex: input.sex,
      ageYears: input.ageYears,
      heightCm: input.heightCm,
      weightKg,
      skinfoldsMm: { ...input.skinfoldsMm } as Record<string, number>,
      circumferencesCm: { ...input.circumferencesCm } as Record<string, number>,
    },
  }
}
