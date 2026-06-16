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

// média das aferições válidas (finitas e > 0); null se nenhuma. As dobras
// permitem de 1 a 3 aferições por ponto; o protocolo usa a média.
export function meanReading(readings: number[]): number | null {
  const valid = readings.filter((r) => Number.isFinite(r) && r > 0)
  if (valid.length === 0) return null
  return valid.reduce((a, b) => a + b, 0) / valid.length
}
