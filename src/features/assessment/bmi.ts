// IMC (índice de massa corporal): peso(kg) / altura(m)². A classificação usa as
// faixas da OMS para adultos — referência padrão e estável, sem fórmula
// inventada (princípio do DECISIONS/AI_WORKFLOW). O IMC não distingue massa
// magra de gorda: serve de contexto geral, não de diagnóstico de composição.

export type BmiCategory = {
  label: string
  // tom pra UI: 'normal' é a faixa saudável; 'warn' é tudo fora dela
  tone: 'normal' | 'warn'
}

export function computeBmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100
  return weightKg / (m * m)
}

// Faixas da OMS (adultos). Os limites superiores são exclusivos: 25.0 já é
// sobrepeso, 30.0 já é obesidade grau I, etc.
export function bmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) return { label: 'Abaixo do peso', tone: 'warn' }
  if (bmi < 25) return { label: 'Peso normal', tone: 'normal' }
  if (bmi < 30) return { label: 'Sobrepeso', tone: 'warn' }
  if (bmi < 35) return { label: 'Obesidade grau I', tone: 'warn' }
  if (bmi < 40) return { label: 'Obesidade grau II', tone: 'warn' }
  return { label: 'Obesidade grau III', tone: 'warn' }
}
