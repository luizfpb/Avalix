// Iniciais para o avatar: primeira letra do primeiro e do último nome.
// Ignora partículas comuns (de, da, dos...) pra não pegar "D" de "da Silva".
const PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

export function initials(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0 && !PARTICLES.has(p.toLowerCase()))
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}
