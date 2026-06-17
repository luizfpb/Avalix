// Gera favicon e ícones do PWA: a letra B do Black Ops One (#ECE3FA) sobre um
// quadrado de cantos arredondados #2A0E52. O B é rasterizado a partir da fonte
// (sem dependência em runtime), com supersampling 2x para bordas suaves.
// Rodar: node scripts/generate-pwa-icons.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { Buffer } from 'node:buffer'
import opentype from 'opentype.js'

const PURPLE = [0x2a, 0x0e, 0x52]
const INK = [0xec, 0xe3, 0xfa]
const FONT = 'node_modules/@fontsource/black-ops-one/files/black-ops-one-latin-400-normal.woff'

const fbuf = readFileSync(FONT)
const font = opentype.parse(fbuf.buffer.slice(fbuf.byteOffset, fbuf.byteOffset + fbuf.byteLength))

// ---- PNG mínimo (sem dependências) -------------------------------------
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(b) {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const tb = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0)
  return Buffer.concat([len, tb, data, crc])
}
function pngFromRGBA(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- glifo B -> polígonos (flatten das curvas) -------------------------
function glyphPolys() {
  const path = font.charToGlyph('B').getPath(0, 0, 1000)
  const bez2 = (a, b, c, t) => {
    const u = 1 - t
    return u * u * a + 2 * u * t * b + t * t * c
  }
  const bez3 = (a, b, c, d, t) => {
    const u = 1 - t
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
  }
  const polys = []
  let cur = []
  let sx = 0, sy = 0, px = 0, py = 0
  for (const c of path.commands) {
    if (c.type === 'M') {
      if (cur.length > 1) polys.push(cur)
      cur = [[c.x, c.y]]
      px = sx = c.x
      py = sy = c.y
    } else if (c.type === 'L') {
      cur.push([c.x, c.y])
      px = c.x
      py = c.y
    } else if (c.type === 'C') {
      for (let i = 1; i <= 16; i++) {
        const t = i / 16
        cur.push([bez3(px, c.x1, c.x2, c.x, t), bez3(py, c.y1, c.y2, c.y, t)])
      }
      px = c.x
      py = c.y
    } else if (c.type === 'Q') {
      for (let i = 1; i <= 12; i++) {
        const t = i / 12
        cur.push([bez2(px, c.x1, c.x, t), bez2(py, c.y1, c.y, t)])
      }
      px = c.x
      py = c.y
    } else if (c.type === 'Z') {
      if (cur.length > 1) {
        cur.push([sx, sy])
        polys.push(cur)
      }
      cur = []
    }
  }
  if (cur.length > 1) polys.push(cur)
  return polys
}

const POLYS = glyphPolys()
const GB = (() => {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const p of POLYS)
    for (const [x, y] of p) {
      if (x < x1) x1 = x
      if (x > x2) x2 = x
      if (y < y1) y1 = y
      if (y > y2) y2 = y
    }
  return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 }
})()

function insideEdges(px, py, edges) {
  let c = false
  for (const e of edges) {
    const [x0, y0, x1, y1] = e
    if (y0 > py !== y1 > py) {
      const xint = x0 + ((py - y0) / (y1 - y0)) * (x1 - x0)
      if (px < xint) c = !c
    }
  }
  return c
}
function insideRounded(x, y, S, R) {
  const a = R, b = S - R
  let dx = 0, dy = 0
  if (x < a) dx = a - x
  else if (x > b) dx = x - b
  if (y < a) dy = a - y
  else if (y > b) dy = y - b
  return dx * dx + dy * dy <= R * R
}

// desenha o ícone (size px) com supersampling ss; maskable = sem cantos (full bleed)
function drawIcon(size, { maskable = false } = {}) {
  const ss = 2
  const S = size * ss
  const R = maskable ? 0 : S * 0.22
  const target = S * (maskable ? 0.5 : 0.56) // margem segura
  const scale = target / Math.max(GB.w, GB.h)
  const cx = S / 2, cy = S / 2
  const edges = []
  for (const p of POLYS) {
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i], b = p[i + 1]
      edges.push([
        cx + (a[0] - GB.cx) * scale,
        cy + (a[1] - GB.cy) * scale,
        cx + (b[0] - GB.cx) * scale,
        cy + (b[1] - GB.cy) * scale,
      ])
    }
  }
  const big = Buffer.alloc(S * S * 4)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = x + 0.5, py = y + 0.5
      const inBg = maskable || insideRounded(px, py, S, R)
      const col = inBg && insideEdges(px, py, edges) ? INK : PURPLE
      const i = (y * S + x) * 4
      big[i] = col[0]
      big[i + 1] = col[1]
      big[i + 2] = col[2]
      big[i + 3] = inBg ? 255 : 0
    }
  }
  // downsample ss -> size (antialias)
  const out = Buffer.alloc(size * size * 4)
  const n = ss * ss
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let j = 0; j < ss; j++)
        for (let i = 0; i < ss; i++) {
          const idx = ((y * ss + j) * S + (x * ss + i)) * 4
          r += big[idx]
          g += big[idx + 1]
          b += big[idx + 2]
          a += big[idx + 3]
        }
      const o = (y * size + x) * 4
      out[o] = Math.round(r / n)
      out[o + 1] = Math.round(g / n)
      out[o + 2] = Math.round(b / n)
      out[o + 3] = Math.round(a / n)
    }
  }
  return out
}

function ico(size) {
  const png = pngFromRGBA(size, drawIcon(size))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry[0] = size >= 256 ? 0 : size
  entry[1] = size >= 256 ? 0 : size
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12)
  return Buffer.concat([header, entry, png])
}

function faviconSvg() {
  const box = 64, target = 40
  const path = font.charToGlyph('B').getPath(0, 0, 1000)
  const s = target / Math.max(GB.w, GB.h)
  const tx = box / 2 - s * GB.cx
  const ty = box / 2 - s * GB.cy
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}"><rect width="${box}" height="${box}" rx="14" fill="#2A0E52"/><path transform="translate(${
    Math.round(tx * 100) / 100
  } ${Math.round(ty * 100) / 100}) scale(${Math.round(s * 10000) / 10000})" d="${path.toPathData(
    2
  )}" fill="#ECE3FA"/></svg>\n`
}

mkdirSync('public', { recursive: true })
const png = (size, opt) => pngFromRGBA(size, drawIcon(size, opt))
writeFileSync('public/pwa-192.png', png(192))
writeFileSync('public/pwa-512.png', png(512))
writeFileSync('public/maskable-512.png', png(512, { maskable: true }))
writeFileSync('public/apple-touch-icon.png', png(180))
writeFileSync('public/favicon.ico', ico(64))
writeFileSync('public/favicon.svg', faviconSvg())
console.log('gerados: pwa-192/512, maskable-512, apple-touch-icon, favicon.ico, favicon.svg')
