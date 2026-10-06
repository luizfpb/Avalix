// Telefone para exibir: o número digitado de qualquer jeito ("11999990000",
// "11 99999 0000") aparece como (11) 99999-0000. O valor gravado não muda, e o
// que não parece telefone brasileiro aparece exatamente como foi digitado.
export function formatPhone(raw: string | null | undefined): string | null {
  const typed = raw?.trim()
  if (!typed) return null
  let digits = typed.replace(/\D/g, '')
  if (typed.startsWith('+') && !digits.startsWith('55')) return typed
  let prefix = ''
  if (digits.length >= 12 && digits.startsWith('55')) {
    digits = digits.slice(2)
    prefix = '+55 '
  }
  if (digits.length === 11) {
    return `${prefix}(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `${prefix}(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return typed
}
