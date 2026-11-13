// Resumo de uma linha ("Cooper, flexão, preensão") para a ficha do aluno.
// Fica separado de measures/engine de propósito: a ficha abre sem carregar o
// cálculo e as tabelas, que só as telas de testes usam.

const ORDER: [string, string][] = [
  ['cooper', 'Cooper'],
  ['rockport', 'Rockport'],
  ['queens', 'banco de Queens'],
  ['push_ups', 'flexão'],
  ['sit_ups', 'abdominal'],
  ['sit_and_reach', 'sentar e alcançar'],
  ['grip', 'preensão'],
]

export function fitnessSummary(measures: unknown): string {
  if (!measures || typeof measures !== 'object' || Array.isArray(measures)) return ''
  const m = measures as Record<string, unknown>
  return ORDER.filter(([k]) => m[k] && typeof m[k] === 'object')
    .map(([, label]) => label)
    .join(', ')
}
