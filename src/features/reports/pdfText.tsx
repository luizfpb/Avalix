import { Text as RawText } from '@react-pdf/renderer'
import type { ComponentProps, ReactNode } from 'react'

// Os PDFs usam as fontes padrão do @react-pdf (Helvetica e família), que são
// codificadas em WinAnsi (CP1252). Nenhum Font.register acontece no projeto.
//
// Consequência que passava despercebida: qualquer caractere fora do CP1252
// digitado pelo profissional não some nem dá erro — ele vira OUTRO caractere
// no PDF entregue ao aluno. "RIR <= 2" escrito com o sinal de menor-ou-igual
// era impresso como "RIR d 2". Um documento de prescrição não pode trocar
// símbolo em silêncio.
//
// Registrar uma fonte Unicode resolveria, mas acrescentaria centenas de KB ao
// chunk de PDF (que já é o mais pesado do bundle e fica fora do precache de
// propósito). Transliterar é mais barato e preserva o SENTIDO: em vez de um
// glifo errado, imprime-se o equivalente ASCII correto.
//
// Acentuação do português está toda em Latin-1 (á é í ó ú â ê ô ã õ ç à),
// assim como °, ², ³, aspas curvas, travessões, • e …: nada disso é tocado.

const TRANSLITERACAO: Record<string, string> = {
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
  '≈': '~',
  '→': '->',
  '←': '<-',
  '↑': 'para cima',
  '↓': 'para baixo',
  '⇒': '=>',
  '✓': 'OK',
  '✔': 'OK',
  '✗': 'X',
  '✘': 'X',
  '★': '*',
  '☆': '*',
  '∆': 'delta',
  '∑': 'soma',
  '√': 'raiz',
  '∞': 'infinito',
  '№': 'no.',
  '‑': '-', // hífen não separável (U+2011) — fora do CP1252
  '−': '-', // sinal de menos matemático (U+2212) — fora do CP1252
}

// Princípio: só entra no mapa acima o que a fonte NÃO consegue imprimir.
// Travessão (–, —), aspas curvas, bullet, reticências, € e ™ existem no CP1252
// e passam intactos — convertê-los seria degradar a tipografia do documento
// sem necessidade. Espaço não separável idem.

// CP1252 = ASCII imprimível + o bloco 0x80-0x9F + Latin-1 0xA0-0xFF.
// Os pontos de código do bloco 0x80-0x9F em Unicode (aspas curvas, travessões,
// bullet, reticências, €) são listados explicitamente porque não são contíguos.
const CP1252_EXTRA = new Set(
  [
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
    0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
    0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
  ].map((c) => String.fromCharCode(c))
)

function representavel(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  if (code === 0x0a || code === 0x09) return true // quebra de linha e tab
  if (code >= 0x20 && code <= 0x7e) return true // ASCII imprimível
  if (code >= 0xa0 && code <= 0xff) return true // Latin-1 (acentos do pt-BR)
  return CP1252_EXTRA.has(ch)
}

// Exportada para teste: transforma um texto qualquer em algo que a fonte
// padrão consegue imprimir sem trocar glifo.
export function sanitizePdfText(value: string): string {
  let out = ''
  // Itera por code point (não por unidade UTF-16) para não partir emoji ao meio.
  for (const ch of value) {
    const mapeado = TRANSLITERACAO[ch]
    if (mapeado != null) {
      out += mapeado
      continue
    }
    if (representavel(ch)) {
      out += ch
      continue
    }
    // Última tentativa: decompor acento desconhecido (ex.: latim estendido) no
    // caractere base. Se ainda assim não couber, cai fora em vez de virar lixo.
    const base = ch.normalize('NFD').replace(/\p{Diacritic}/gu, '')
    out += [...base].every(representavel) ? base : ''
  }
  return out
}

function sanitizeChildren(children: ReactNode): ReactNode {
  if (typeof children === 'string') return sanitizePdfText(children)
  if (typeof children === 'number') return children
  if (Array.isArray(children)) return children.map(sanitizeChildren)
  return children
}

// Substitui o Text do @react-pdf nos documentos. Um ponto só de saneamento,
// para não depender de lembrar disso em cada campo novo.
// props é união (texto de página | texto dentro de <Svg>), então children é
// lido por acesso tipado em vez de destructuring: o JSX child explícito abaixo
// tem precedência sobre o que veio no spread.
export function Text(props: ComponentProps<typeof RawText>) {
  const children = (props as { children?: ReactNode }).children
  return <RawText {...props}>{sanitizeChildren(children)}</RawText>
}
