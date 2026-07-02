import type { MuscleGroup } from './types'

// Faixas de referencia de volume semanal (series por grupo muscular):
// MEV (minimo efetivo) / MAV (faixa adaptativa) / MRV (maximo recuperavel),
// de Renaissance Periodization / Israetel. SAO DIRETRIZ PRATICA de hipertrofia,
// nao constante validada por ensaio — exibidas como referencia, versionadas
// abaixo pra rastreabilidade (mesma transparencia do Siri/Brozek na avaliacao).
//
// Mapeadas pra taxonomia de 20 grupos: "Costas" da RP vira lats (largura) e
// upper_back (espessura); "ombro lateral/posterior" cobre side/rear delts.
// Grupos sem diretriz publicada (obliques, lower_back, adductors, abductors,
// neck) ficam de fora — exibidos so com o numero, sem faixa.
export const VOLUME_LANDMARKS_VERSION = 'landmarks-rp@1'

export type VolumeLandmark = { mev: number; mavLow: number; mavHigh: number; mrv: number }

export const VOLUME_LANDMARKS: Partial<Record<MuscleGroup, VolumeLandmark>> = {
  chest: { mev: 8, mavLow: 12, mavHigh: 20, mrv: 22 },
  lats: { mev: 8, mavLow: 12, mavHigh: 20, mrv: 25 },
  upper_back: { mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 },
  traps: { mev: 4, mavLow: 10, mavHigh: 20, mrv: 26 },
  front_delts: { mev: 0, mavLow: 0, mavHigh: 6, mrv: 12 },
  side_delts: { mev: 6, mavLow: 12, mavHigh: 20, mrv: 25 },
  rear_delts: { mev: 6, mavLow: 12, mavHigh: 20, mrv: 25 },
  biceps: { mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 },
  triceps: { mev: 4, mavLow: 8, mavHigh: 14, mrv: 18 },
  forearms: { mev: 4, mavLow: 8, mavHigh: 16, mrv: 20 },
  quads: { mev: 6, mavLow: 10, mavHigh: 18, mrv: 20 },
  hamstrings: { mev: 4, mavLow: 8, mavHigh: 14, mrv: 16 },
  glutes: { mev: 4, mavLow: 8, mavHigh: 16, mrv: 20 },
  calves: { mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 },
  abs: { mev: 0, mavLow: 16, mavHigh: 20, mrv: 25 },
}

export const VOLUME_LANDMARKS_NOTE =
  `Faixas de referência (MEV/MAV/MRV) de Renaissance Periodization/Israetel — ` +
  `diretriz prática de hipertrofia, não constante validada (${VOLUME_LANDMARKS_VERSION}).`

export type LandmarkZone = 'below' | 'effective' | 'optimal' | 'high' | 'above'

export const ZONE_LABELS: Record<LandmarkZone, string> = {
  below: 'abaixo do mínimo',
  effective: 'efetivo',
  optimal: 'ótimo',
  high: 'alto',
  above: 'acima do máximo',
}

// Classifica as series semanais de um grupo contra as faixas. null = grupo sem
// diretriz publicada.
export function classifyVolume(
  muscle: MuscleGroup,
  sets: number
): { landmark: VolumeLandmark; zone: LandmarkZone } | null {
  const lm = VOLUME_LANDMARKS[muscle]
  if (!lm) return null
  let zone: LandmarkZone
  if (sets < lm.mev) zone = 'below'
  else if (sets < lm.mavLow) zone = 'effective'
  else if (sets <= lm.mavHigh) zone = 'optimal'
  else if (sets <= lm.mrv) zone = 'high'
  else zone = 'above'
  return { landmark: lm, zone }
}

export type LandmarkBar = {
  zone: LandmarkZone | null
  fillPct: number // sets / escala
  mavLowPct: number
  mavHighPct: number
  mrvPct: number
  scaleMax: number
}

// Geometria pura (fracoes 0..1) pra desenhar a barra contra a faixa MAV e o teto
// MRV numa escala COMUM (default 28 series), tornando os grupos comparaveis lado
// a lado. Testavel como donutSlices/linePath. Sem diretriz: so o preenchimento.
export function landmarkBar(muscle: MuscleGroup, sets: number, scaleMax = 28): LandmarkBar {
  const clamp = (n: number) => Math.max(0, Math.min(1, n / scaleMax))
  const c = classifyVolume(muscle, sets)
  if (!c) {
    return { zone: null, fillPct: clamp(sets), mavLowPct: 0, mavHighPct: 0, mrvPct: 0, scaleMax }
  }
  return {
    zone: c.zone,
    fillPct: clamp(sets),
    mavLowPct: clamp(c.landmark.mavLow),
    mavHighPct: clamp(c.landmark.mavHigh),
    mrvPct: clamp(c.landmark.mrv),
    scaleMax,
  }
}
