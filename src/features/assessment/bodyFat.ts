import type { Sex } from './protocols'
import { adultReferenceApplies, noAdultReferenceLabel } from './adultReference'

// Classificação de % de gordura corporal pelas faixas do ACE (American Council
// on Exercise), por sexo e independente de idade — referência geral e
// amplamente publicada. É contexto clínico, não diagnóstico.
//
// As faixas são de adulto: abaixo de 18 anos não há classificação (ver
// adultReference.ts).
//
// Decisão de produto em aberto (ver V1.1.md): trocar por tabela etária
// (ex.: ACSM/Pollock por sexo e idade) é possível, mas exige fonte verificada
// antes de entrar.
//
// Faixas ACE:
//   Homens  — essencial 2–5 · atleta 6–13 · fitness 14–17 · aceitável 18–24 · obesidade 25+
//   Mulheres— essencial 10–13 · atleta 14–20 · fitness 21–24 · aceitável 25–31 · obesidade 32+

export type BodyFatCategory = {
  label: string
  // 'low' = gordura essencial (abaixo do mínimo saudável); 'normal' = faixas
  // atleta/fitness/aceitável; 'warn' = obesidade; 'none' = sem classificação
  tone: 'low' | 'normal' | 'warn' | 'none'
}

export function classifyBodyFat(
  sex: Sex,
  bodyFatPct: number,
  ageYears: number | null | undefined
): BodyFatCategory {
  if (!adultReferenceApplies(ageYears)) return { label: noAdultReferenceLabel(ageYears), tone: 'none' }
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
