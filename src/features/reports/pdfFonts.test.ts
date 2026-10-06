import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Glifos montados de componentes ("Ú" = "U" + acento) fazem o fontkit guardar
// o componente sem a letra que ele representa; no PDF seguinte da mesma
// sessão, o "U" saía sem texto e a quebra de linha deslocava uma posição.
// scripts/fontes-pdf.py desmonta todos. Aqui se confere direto na tabela glyf:
// glifo composto tem numberOfContours = -1.
function compostos(arquivo: string): number {
  const buf = readFileSync(join(process.cwd(), 'public/fonts', arquivo))
  const tabelas = new Map<string, number>()
  const numTables = buf.readUInt16BE(4)
  for (let i = 0; i < numTables; i++) {
    const registro = 12 + i * 16
    tabelas.set(buf.toString('latin1', registro, registro + 4), buf.readUInt32BE(registro + 8))
  }
  const head = tabelas.get('head')!
  const maxp = tabelas.get('maxp')!
  const loca = tabelas.get('loca')!
  const glyf = tabelas.get('glyf')!
  const locaLonga = buf.readInt16BE(head + 50) === 1
  const numGlyphs = buf.readUInt16BE(maxp + 4)
  const offset = (i: number) => (locaLonga ? buf.readUInt32BE(loca + i * 4) : buf.readUInt16BE(loca + i * 2) * 2)
  let total = 0
  for (let i = 0; i < numGlyphs; i++) {
    if (offset(i + 1) === offset(i)) continue // glifo vazio (espaço)
    if (buf.readInt16BE(glyf + offset(i)) === -1) total++
  }
  return total
}

describe('fontes dos PDFs', () => {
  it.each(['inter-400.ttf', 'inter-600.ttf'])('%s não tem glifo composto', (arquivo) => {
    expect(compostos(arquivo)).toBe(0)
  })
})
