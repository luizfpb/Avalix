import {
  computeProtocol,
  ENGINE_VERSION,
  fatMassKg,
  leanMassKg,
  type ProtocolInput,
  type ResultWarning,
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
  // Ressalvas de domínio no momento do cálculo. Fica no snapshot (e não é
  // recalculado na leitura) pelo mesmo motivo do resto: o laudo precisa
  // continuar dizendo o que dizia quando foi emitido. Opcional porque os
  // snapshots gravados antes da 1.1.0 não têm o campo.
  warnings?: ResultWarning[]
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
    warnings: r.warnings,
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
