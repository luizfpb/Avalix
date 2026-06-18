import type { SkinfoldSite, CircumferenceSite } from './protocols'

export const SKINFOLD_LABELS: Record<SkinfoldSite, string> = {
  chest: 'Peitoral',
  midaxillary: 'Axilar média',
  triceps: 'Tríceps',
  subscapular: 'Subescapular',
  abdomen: 'Abdominal',
  suprailiac: 'Supra-ilíaca',
  thigh: 'Coxa',
  biceps: 'Bíceps',
}

export const CIRCUMFERENCE_LABELS: Record<CircumferenceSite, string> = {
  neck: 'Pescoço',
  waist: 'Cintura',
  hip: 'Quadril',
}

// Catálogo completo de perímetros (todos opcionais). Vai além dos usados pelos
// protocolos: serve pra acompanhar a evolução. Inclui bilateral (D/E) e o braço
// nas duas formas (relaxado e contraído). O `site` é texto livre no banco, então
// estas chaves convivem com as customizadas.
export const CIRCUMFERENCE_CATALOG: { group: string; items: { key: string; label: string }[] }[] = [
  {
    group: 'Tronco',
    items: [
      { key: 'neck', label: 'Pescoço' },
      { key: 'shoulder', label: 'Ombro' },
      { key: 'chest', label: 'Tórax' },
      { key: 'waist', label: 'Cintura' },
      { key: 'abdomen', label: 'Abdômen' },
      { key: 'hip', label: 'Quadril' },
    ],
  },
  {
    group: 'Membros superiores',
    items: [
      { key: 'arm_relaxed_r', label: 'Braço relaxado (D)' },
      { key: 'arm_relaxed_l', label: 'Braço relaxado (E)' },
      { key: 'arm_flexed_r', label: 'Braço contraído (D)' },
      { key: 'arm_flexed_l', label: 'Braço contraído (E)' },
      { key: 'forearm_r', label: 'Antebraço (D)' },
      { key: 'forearm_l', label: 'Antebraço (E)' },
      { key: 'wrist_r', label: 'Punho (D)' },
      { key: 'wrist_l', label: 'Punho (E)' },
    ],
  },
  {
    group: 'Membros inferiores',
    items: [
      { key: 'thigh_proximal_r', label: 'Coxa proximal (D)' },
      { key: 'thigh_proximal_l', label: 'Coxa proximal (E)' },
      { key: 'thigh_mid_r', label: 'Coxa medial (D)' },
      { key: 'thigh_mid_l', label: 'Coxa medial (E)' },
      { key: 'thigh_distal_r', label: 'Coxa distal (D)' },
      { key: 'thigh_distal_l', label: 'Coxa distal (E)' },
      { key: 'calf_r', label: 'Panturrilha (D)' },
      { key: 'calf_l', label: 'Panturrilha (E)' },
    ],
  },
]

const CIRC_LABEL_MAP: Record<string, string> = Object.fromEntries(
  CIRCUMFERENCE_CATALOG.flatMap((g) => g.items.map((i) => [i.key, i.label]))
)

// Rótulo de uma circunferência por chave; cai no texto cru (customizadas).
export function circumferenceLabel(site: string): string {
  return CIRC_LABEL_MAP[site] ?? site
}

// média das aferições válidas (finitas e > 0); null se nenhuma. As dobras
// permitem de 1 a 3 aferições por ponto; o protocolo usa a média.
export function meanReading(readings: number[]): number | null {
  const valid = readings.filter((r) => Number.isFinite(r) && r > 0)
  if (valid.length === 0) return null
  return valid.reduce((a, b) => a + b, 0) / valid.length
}
