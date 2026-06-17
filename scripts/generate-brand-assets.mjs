// Gera os SVGs da marca a partir do Black Ops One (.woff do @fontsource),
// com os glifos já convertidos em PATH — assim o app NÃO depende da fonte em
// runtime e o logo nunca "pula" enquanto a fonte carrega.
// Rodar: node scripts/generate-brand-assets.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import opentype from 'opentype.js'

const FONT = 'node_modules/@fontsource/black-ops-one/files/black-ops-one-latin-400-normal.woff'
const INK = '#ECE3FA' // cor da marca (letras claras)

const buf = readFileSync(FONT)
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

// Monta o path glifo a glifo (charToGlyph + getPath), evitando o shaping
// (ccmp/ligaturas) do font.getPath(string), que esta fonte não suporta no
// opentype.js. Avança x pela largura de cada glifo.
function textPath(text, fontSize) {
  const scale = fontSize / font.unitsPerEm
  const full = new opentype.Path()
  let x = 0
  for (const ch of text) {
    const glyph = font.charToGlyph(ch)
    full.extend(glyph.getPath(x, 0, fontSize))
    x += (glyph.advanceWidth || 0) * scale
  }
  return full
}

// viewBox + path data do texto, ajustados ao bounding box.
function wordmark(text, pad = 40) {
  const path = textPath(text, 1000)
  const b = path.getBoundingBox()
  const viewBox = `${r(b.x1 - pad)} ${r(b.y1 - pad)} ${r(b.x2 - b.x1 + pad * 2)} ${r(
    b.y2 - b.y1 + pad * 2
  )}`
  return { viewBox, d: path.toPathData(2) }
}

function svgFile(g, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${g.viewBox}" role="img" aria-label="${label}"><path d="${g.d}" fill="${INK}"/></svg>\n`
}

function r(n) {
  return Math.round(n * 100) / 100
}

const logo = wordmark('BODYTRACK')
const mark = wordmark('B')

mkdirSync('src/brand', { recursive: true })
writeFileSync('src/brand/logo-bodytrack.svg', svgFile(logo, 'BODYTRACK'))
writeFileSync('src/brand/mark-b.svg', svgFile(mark, 'B'))

// Módulo TS pros componentes desenharem o SVG inline (fill=currentColor),
// sem depender de máscara CSS nem de carregar o arquivo .svg.
const ts =
  `// Gerado por scripts/generate-brand-assets.mjs — não editar à mão.\n` +
  `export const BRAND_LOGO = { viewBox: '${logo.viewBox}', d: '${logo.d}' }\n` +
  `export const BRAND_MARK = { viewBox: '${mark.viewBox}', d: '${mark.d}' }\n`
writeFileSync('src/brand/paths.ts', ts)

console.log('gerados: src/brand/logo-bodytrack.svg, mark-b.svg, paths.ts')
