// Conversões densidade corporal -> % de gordura e massas derivadas.

// Siri (1961): %G = 495/D - 450
export function siriBodyFatPct(bodyDensity: number): number {
  return 495 / bodyDensity - 450
}

// Brozek et al. (1963): %G = 457/D - 414.1
export function brozekBodyFatPct(bodyDensity: number): number {
  return 457 / bodyDensity - 414.1
}

export function fatMassKg(weightKg: number, bodyFatPct: number): number {
  return (weightKg * bodyFatPct) / 100
}

export function leanMassKg(weightKg: number, bodyFatPct: number): number {
  return weightKg - fatMassKg(weightKg, bodyFatPct)
}
