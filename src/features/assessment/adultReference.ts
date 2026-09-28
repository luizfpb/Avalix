// As faixas de IMC (OMS) e de gordura corporal (ACE) que o app usa são faixas
// de ADULTO. O cadastro aceita menores (exige responsável abaixo de 18 anos) e o
// Durnin-Womersley cobre a partir de ~12, então a tela, a evolução e o laudo
// classificavam crianças e adolescentes com cortes que não valem para eles —
// dos 5 aos 19 anos a OMS classifica o IMC pela curva de idade
// (IMC-para-idade), e com o corte de adulto uma criança com sobrepeso pela curva
// saía como "Peso normal".
//
// Regra: sem classificação abaixo de 18 anos, dizendo o motivo. A referência
// OMS 2007 foi construída para encostar nos cortes de adulto aos 19 anos (+1 z
// ≈ 25 e +2 z ≈ 30), então 18 e 19 anos ficam com a faixa adulta. Idade
// desconhecida também não é classificada: não dá para afirmar que a faixa vale.
import { ageFromBirthDate } from '../../lib/age'

export const ADULT_REFERENCE_MIN_AGE = 18

// Idade NA DATA DA AVALIAÇÃO, não hoje: o laudo de uma avaliação antiga não
// pode mudar de faixa porque o avaliado fez aniversário. O snapshot do cálculo
// já guarda a idade; avaliação sem protocolo de composição não tem snapshot, e
// aí a idade sai do nascimento e da data da coleta.
export function assessmentAgeYears(
  snapshotAge: number | null | undefined,
  birthDate: string | null | undefined,
  assessedAt: string
): number | null {
  if (snapshotAge != null && Number.isFinite(snapshotAge)) return snapshotAge
  if (!birthDate) return null
  return ageFromBirthDate(birthDate, new Date(`${assessedAt.slice(0, 10)}T00:00:00`))
}

export function adultReferenceApplies(ageYears: number | null | undefined): boolean {
  return ageYears != null && Number.isFinite(ageYears) && ageYears >= ADULT_REFERENCE_MIN_AGE
}

export function noAdultReferenceLabel(ageYears: number | null | undefined): string {
  return ageYears == null || !Number.isFinite(ageYears)
    ? 'Sem classificação (idade não informada)'
    : 'Sem classificação adulta (menor de 18 anos)'
}
