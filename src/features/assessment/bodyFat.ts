import type { Sex } from './protocols'

// Classificação de % de gordura corporal pelas faixas do ACE (American Council
// on Exercise), por sexo e independente de idade — referência geral e
// amplamente publicada. É contexto clínico, não diagnóstico.
//
// Decisão de produto em aberto (ver V1.1.md): trocar por tabela etária
// (ex.: ACSM/Pollock por sexo e idade) é possível, mas exige fonte verificada
// antes de entrar; por isso a função recebe a faixa etária no futuro sem
// quebrar a assinatura atual ficaria mais simples mantê-la separada.
//
// Faixas ACE:
//   Homens  — essencial 2–5 · atleta 6–13 · fitness 14–17 · aceitável 18–24 · obesidade 25+
//   Mulheres— essencial 10–13 · atleta 14–20 · fitness 21–24 · aceitável 25–31 · obesidade 32+

export type BodyFatCategory = {
  label: string
  // 'low' = gordura essencial (abaixo do mínimo saudável); 'normal' = faixas
  // atleta/fitness/aceitável; 'warn' = obesidade
  tone: 'low' | 'normal' | 'warn'
}

export function classifyBodyFat(sex: Sex, bodyFatPct: number): BodyFatCategory {
  if (sex === 'M') {
    if (bodyFatPct < 6) return { label: 'Gordura essencial', tone: 'low' }
    if (bodyFatPct < 14) return { label: 'Atleta', tone: 'normal' }
    if (bodyFatPct < 18) return { label: 'Bom (fitness)', tone: 'normal' }
    if (bodyFatPct < 25) return { label: 'Aceitável', tone: 'normal' }
    return { label: 'Obesidade', tone: 'warn' }
  }
  if (bodyFatPct < 14) return { label: 'Gordura essencial', tone: 'low' }
  if (bodyFatPct < 21) return { label: 'Atleta', tone: 'normal' }
  if (bodyFatPct < 25) return { label: 'Bom (fitness)', tone: 'normal' }
  if (bodyFatPct < 32) return { label: 'Aceitável', tone: 'normal' }
  return { label: 'Obesidade', tone: 'warn' }
}
