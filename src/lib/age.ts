// Idade em anos completos a partir de uma data ISO (YYYY-MM-DD).
// Retorna null se a data for malformada ou inexistente (ex.: 2026-02-30).
// `today` é injetável pra testes determinísticos.
export function ageFromBirthDate(birthDate: string, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const d = new Date(year, month - 1, day)
  // rejeita data que "transbordou" (ex.: 30/02 vira 02/03)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null
  }
  let age = today.getFullYear() - year
  const monthDiff = today.getMonth() - (month - 1)
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) age--
  return age
}
