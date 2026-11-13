// Resumo de uma linha ("Cooper, flexão, preensão") para a ficha do aluno.
// Fica separado de measures/engine de propósito: a ficha está no pré-cache e
// as telas de testes não (vite.config.ts). Importar o motor daqui levaria o
// código delas para dentro do pré-cache.

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
