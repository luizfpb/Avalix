// Tipos do motor de protocolos de composição corporal.
// Princípio (DECISIONS): protocolo é código TS puro e testado, não tabela.
// As médias das aferições por ponto (1 a 3 dobras) são feitas antes; o motor
// recebe um valor por ponto, em mm. Circunferências em cm.

export type Sex = 'M' | 'F'

export type SkinfoldSite =
  | 'chest' // peitoral
  | 'midaxillary' // axilar média
  | 'triceps' // tríceps
  | 'subscapular' // subescapular
  | 'abdomen' // abdominal
  | 'suprailiac' // supra-ilíaca
  | 'thigh' // coxa
  | 'biceps' // bíceps (Durnin-Womersley)

export type CircumferenceSite = 'neck' | 'waist' | 'hip'

export type ProtocolKind = 'skinfold' | 'circumference'

export type ProtocolInput = {
  sex: Sex
  ageYears: number
  heightCm: number
  skinfoldsMm: Partial<Record<SkinfoldSite, number>>
  circumferencesCm: Partial<Record<CircumferenceSite, number>>
}

export type ProtocolResult = {
  // densidade corporal (g/cc) nos métodos de dobras; null no US Navy
  bodyDensity: number | null
  // % de gordura principal: Siri nos métodos de densidade, valor direto no Navy
  bodyFatPct: number
  // as duas conversões de densidade->gordura; null no US Navy
  conversions: { siri: number; brozek: number } | null
}
