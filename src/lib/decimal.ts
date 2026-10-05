// Texto de um campo de número com casas decimais, como a pessoa digitou, já na
// forma que `Number()` entende: vírgula vira ponto e só o primeiro separador
// conta. Letras e espaços ficam de fora, como no antigo type="number"; o sinal
// de menos fica, para a validação recusar a medida negativa às claras em vez de
// o campo trocá-la calado por uma positiva. O valor continua string — campo
// vazio e campo em edição ("12.") são estados legítimos do formulário.
export function normalizeDecimalInput(raw: string): string {
  const negative = raw.trimStart().startsWith('-')
  const cleaned = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '')
  const dot = cleaned.indexOf('.')
  const number = dot === -1 ? cleaned : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '')
  return negative ? `-${number}` : number
}
