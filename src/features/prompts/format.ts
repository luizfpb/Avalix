// Primitivas de texto dos prompts.
//
// Saída é texto puro, não markdown: o destino é a caixa de mensagem de um chat
// qualquer, então títulos em caixa alta, listas com hífen e linha em branco
// entre blocos. Isso sobrevive a qualquer editor e não vira formatação
// estranha no meio do caminho.

import type { Option } from '../anamnesis/spec'

// Campo em branco NUNCA vira "normal" ou "sem queixa": vira ausência
// declarada. Metade do valor de uma anamnese está no que não foi respondido.
export const NAO_RESPONDIDO = 'não respondido'

export function line(label: string, value: string | number | null | undefined): string {
  const empty = value === null || value === undefined || String(value).trim() === ''
  return `- ${label}: ${empty ? NAO_RESPONDIDO : String(value).trim()}`
}

// Variante para campo que só existe quando preenchido (texto condicional do
// formulário, item de lista repetível). Some quando vazio em vez de poluir.
export function optionalLine(label: string, value: string | number | null | undefined): string | null {
  const empty = value === null || value === undefined || String(value).trim() === ''
  return empty ? null : `- ${label}: ${String(value).trim()}`
}

export function boolLabel(v: boolean | null | undefined): string | null {
  if (v === true) return 'Sim'
  if (v === false) return 'Não'
  return null
}

export function optionLabel(opts: Option[], value: string | null | undefined): string | null {
  if (!value) return null
  return opts.find((o) => o.value === value)?.label ?? value
}

export function optionLabels(opts: Option[], values: string[] | null | undefined): string | null {
  const list = (values ?? []).map((v) => optionLabel(opts, v)).filter(Boolean)
  return list.length > 0 ? list.join('; ') : null
}

// Lista de caixas de seleção vazia NÃO é "não respondido": é "nenhuma opção
// marcada", que é exatamente o que o gate usa no cálculo (computeGate testa
// .length > 0). Escrever "não respondido" faria a IA tratar como desconhecido
// o que a triagem tratou como ausente — e ela acabaria contradizendo, na
// leitura, o resultado que a tela mostra ao profissional.
export const NENHUMA_MARCADA = 'nenhuma opção marcada'

export function multiLine(
  label: string,
  opts: Option[],
  values: string[] | null | undefined
): string {
  return `- ${label}: ${optionLabels(opts, values) ?? NENHUMA_MARCADA}`
}

// null = linha ausente (campo condicional vazio) e some. String vazia = linha
// em branco PEDIDA por quem montou o bloco, e sobrevive: é o que separa a
// tabela da série dos totais logo abaixo.
export function block(title: string, lines: (string | null)[]): string {
  const body = lines.filter((l): l is string => l !== null)
  return [title, ...body].join('\n')
}

export function joinBlocks(blocks: (string | null)[]): string {
  return blocks
    .filter((b): b is string => b !== null && b.trim() !== '')
    .join('\n\n')
    .trim()
}

export function fmtDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? '').trim())
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? '')
}

export function fmtNum(v: number | null | undefined, decimals = 1): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null
  return v.toFixed(decimals)
}

// Δ sempre com sinal explícito: "+0,4" e "-1,2" são lidos sem ambiguidade;
// "0,4" sozinho depende do leitor lembrar a direção da comparação.
export function fmtSigned(v: number | null | undefined, decimals = 1): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null
  const s = v.toFixed(decimals)
  return v > 0 ? `+${s}` : s
}

export function daysBetween(fromIso: string, toIso: string): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(fromIso)
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(toIso)
  if (!a || !b) return null
  const da = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]))
  const db = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]))
  return Math.round((db - da) / 86_400_000)
}
